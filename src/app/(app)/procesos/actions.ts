"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireRoles } from "@/lib/session";
import { storeProviderFile } from "@/lib/blob";
import { parseSpreadsheet } from "@/lib/parse";
import { normalizeUpload } from "@/lib/normalize";
import { generateComparison } from "@/lib/comparison";
import { parsePrice } from "@/lib/number";
import type { ActionResult } from "@/lib/action-result";
import { inngest, EVENTS } from "@/inngest/client";
import {
  suggestColumnMapping,
  MAPPING_FIELDS,
  type ColumnMapping,
} from "@/lib/column-mapping";

export type ActionState = { error?: string; ok?: boolean };

const processSchema = z.object({
  name: z.string().trim().min(2, "El nombre es obligatorio."),
  description: z.string().trim().optional(),
});

export async function createProcess(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireRoles("ADMIN", "PROCUREMENT_ANALYST");
  const parsed = processSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }

  const created = await prisma.procurementProcess.create({
    data: {
      organizationId: session.organizationId,
      name: parsed.data.name,
      description: parsed.data.description || null,
      createdById: session.userId,
    },
  });

  redirect(`/procesos/${created.id}`);
}

export async function updateProcess(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireRoles("ADMIN", "PROCUREMENT_ANALYST");
  const id = String(formData.get("id"));
  const parsed = processSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }
  const existing = await prisma.procurementProcess.findFirst({
    where: { id, organizationId: session.organizationId },
    select: { id: true },
  });
  if (!existing) return { error: "Proceso no encontrado." };

  await prisma.procurementProcess.update({
    where: { id },
    data: {
      name: parsed.data.name,
      description: parsed.data.description || null,
    },
  });
  revalidatePath("/procesos");
  return { ok: true };
}

export async function deleteProcess(
  formData: FormData,
): Promise<ActionResult> {
  const session = await requireRoles("ADMIN", "PROCUREMENT_ANALYST");
  const id = String(formData.get("id"));
  const existing = await prisma.procurementProcess.findFirst({
    where: { id, organizationId: session.organizationId },
    select: { id: true },
  });
  if (!existing) return { ok: false, message: "Proceso no encontrado." };
  // Uploads/items/mappings/comparisons cascade; promoted rates are kept
  // (sourceUploadId is set null), so the repository is not affected.
  await prisma.procurementProcess.delete({ where: { id } });
  revalidatePath("/procesos");
  return { ok: true, message: "Proceso eliminado." };
}

/** Upload a provider file, store it, parse it and suggest a column mapping. */
export async function uploadAndParse(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireRoles("ADMIN", "PROCUREMENT_ANALYST");
  const processId = String(formData.get("processId"));
  const providerId = String(formData.get("providerId"));
  const file = formData.get("file");

  if (!providerId) return { error: "Seleccione un proveedor." };
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Seleccione un archivo." };
  }

  const [process, provider] = await Promise.all([
    prisma.procurementProcess.findFirst({
      where: { id: processId, organizationId: session.organizationId },
    }),
    prisma.provider.findFirst({
      where: { id: providerId, organizationId: session.organizationId },
    }),
  ]);
  if (!process || !provider) return { error: "Proceso o proveedor inválido." };

  const buffer = Buffer.from(await file.arrayBuffer());

  // Store raw file as evidence (best effort: don't block parsing in dev).
  let blobUrl = "";
  try {
    blobUrl = await storeProviderFile(file.name, buffer, processId);
  } catch (e) {
    console.warn("Blob storage skipped:", (e as Error).message);
  }

  let parsed;
  try {
    parsed = parseSpreadsheet(buffer, file.name);
  } catch (e) {
    return { error: (e as Error).message };
  }
  if (parsed.rows.length === 0) {
    return { error: "El archivo no contiene filas de datos." };
  }

  const { mapping, method } = await suggestColumnMapping(
    parsed.headers,
    parsed.rows,
  );

  await prisma.processUpload.create({
    data: {
      processId,
      providerId,
      uploadedById: session.userId,
      fileName: file.name,
      blobUrl,
      status: "MAPPING",
      rowCount: parsed.rows.length,
      columnMapping: {
        mapping,
        method,
        headers: parsed.headers,
        rows: parsed.rows,
      } as Prisma.InputJsonValue,
    },
  });

  await prisma.procurementProcess.update({
    where: { id: processId },
    data: { status: "PROCESSING" },
  });

  revalidatePath(`/procesos/${processId}`);
  return { ok: true };
}

/** Delete an uploaded file (e.g. wrong file). Cascades its items + mappings;
 *  rates already promoted to the repository are kept (sourceUploadId -> null). */
export async function deleteUpload(formData: FormData): Promise<ActionResult> {
  const session = await requireRoles("ADMIN", "PROCUREMENT_ANALYST");
  const uploadId = String(formData.get("uploadId"));

  const upload = await prisma.processUpload.findFirst({
    where: { id: uploadId, process: { organizationId: session.organizationId } },
    select: { id: true, processId: true, blobUrl: true },
  });
  if (!upload) return { ok: false, message: "Archivo no encontrado." };

  await prisma.processUpload.delete({ where: { id: uploadId } });

  // Best-effort: remove the stored raw file from blob storage.
  if (upload.blobUrl) {
    try {
      const { del } = await import("@vercel/blob");
      await del(upload.blobUrl);
    } catch {
      /* ignore — file cleanup is non-critical */
    }
  }

  revalidatePath(`/procesos/${upload.processId}`);
  return { ok: true, message: "Archivo eliminado." };
}

/** Confirm the column mapping and materialize ProviderItem rows. */
export async function confirmMapping(formData: FormData) {
  const session = await requireRoles("ADMIN", "PROCUREMENT_ANALYST");
  const uploadId = String(formData.get("uploadId"));

  const upload = await prisma.processUpload.findFirst({
    where: { id: uploadId, process: { organizationId: session.organizationId } },
  });
  if (!upload || !upload.columnMapping) return;

  const stored = upload.columnMapping as {
    headers: string[];
    rows: Record<string, unknown>[];
  };

  const mapping: ColumnMapping = {
    name: null,
    code: null,
    price: null,
    unit: null,
    inclusions: null,
    exclusions: null,
  };
  for (const field of MAPPING_FIELDS) {
    const value = String(formData.get(field) ?? "").trim();
    mapping[field] = value || null;
  }
  if (!mapping.name) return; // name is required to identify items

  // Any header not claimed by one of the known logical fields is preserved
  // as-is on each row, instead of being silently dropped — the export can
  // then reverse this and put them back as their own columns.
  const mappedHeaders = new Set(Object.values(mapping).filter((h): h is string => !!h));
  const extraHeaders = stored.headers.filter((h) => !mappedHeaders.has(h));

  await prisma.$transaction(async (tx) => {
    // Reset any previously materialized items for this upload.
    await tx.providerItem.deleteMany({ where: { uploadId } });

    let rowNumber = 0;
    for (const row of stored.rows) {
      rowNumber++;
      const rawName = String(row[mapping.name!] ?? "").trim();
      if (!rawName) continue;
      const extra: Record<string, unknown> = {};
      for (const h of extraHeaders) {
        const value = row[h];
        if (value !== null && value !== undefined && String(value).trim() !== "") {
          extra[h] = value;
        }
      }
      await tx.providerItem.create({
        data: {
          uploadId,
          providerId: upload.providerId,
          rowNumber,
          rawName,
          rawCode: mapping.code ? String(row[mapping.code] ?? "").trim() || null : null,
          rawUnit: mapping.unit ? String(row[mapping.unit] ?? "").trim() || null : null,
          rawPrice: mapping.price ? parsePrice(row[mapping.price]) : null,
          inclusions: mapping.inclusions
            ? String(row[mapping.inclusions] ?? "").trim() || null
            : null,
          exclusions: mapping.exclusions
            ? String(row[mapping.exclusions] ?? "").trim() || null
            : null,
          extra: Object.keys(extra).length > 0 ? (extra as Prisma.InputJsonValue) : undefined,
        },
      });
    }

    await tx.processUpload.update({
      where: { id: uploadId },
      data: {
        status: "READY",
        parsedAt: new Date(),
        columnMapping: {
          mapping,
          method: "human",
          headers: stored.headers,
        } as Prisma.InputJsonValue,
      },
    });
  });

  revalidatePath(`/procesos/${upload.processId}`);
}

/**
 * Start/resume homologation for an upload. Uses Inngest (durable) when
 * configured, otherwise runs inline. Resumable: only processes pending items.
 */
export async function requestNormalization(
  formData: FormData,
): Promise<ActionResult> {
  const session = await requireRoles("ADMIN", "PROCUREMENT_ANALYST");
  const uploadId = String(formData.get("uploadId"));

  const upload = await prisma.processUpload.findFirst({
    where: { id: uploadId, process: { organizationId: session.organizationId } },
    select: { id: true, processId: true },
  });
  if (!upload) return { ok: false, message: "Archivo no encontrado." };

  // Mark as normalizing immediately so the UI shows progress and the action
  // returns fast (the heavy work runs asynchronously).
  await prisma.processUpload.update({
    where: { id: uploadId },
    data: { status: "NORMALIZING" },
  });

  if (process.env.INNGEST_EVENT_KEY) {
    await inngest.send({ name: EVENTS.normalizeUpload, data: { uploadId } });
  } else {
    // No queue configured: run after the response is sent (dev / small files).
    after(async () => {
      try {
        await normalizeUpload(uploadId);
      } catch (e) {
        console.error("normalizeUpload failed:", e);
        await prisma.processUpload.update({
          where: { id: uploadId },
          data: { status: "FAILED" },
        });
      }
    });
  }

  revalidatePath(`/procesos/${upload.processId}`);
  return { ok: true, message: "Homologación en curso." };
}

/** Pause a running homologation; the worker stops after the current item. */
export async function pauseNormalization(
  formData: FormData,
): Promise<ActionResult> {
  const session = await requireRoles("ADMIN", "PROCUREMENT_ANALYST");
  const uploadId = String(formData.get("uploadId"));
  const upload = await prisma.processUpload.findFirst({
    where: { id: uploadId, process: { organizationId: session.organizationId } },
    select: { id: true, processId: true, status: true },
  });
  if (!upload) return { ok: false, message: "Archivo no encontrado." };
  if (upload.status !== "NORMALIZING") {
    return { ok: false, message: "El archivo no está en proceso." };
  }
  await prisma.processUpload.update({
    where: { id: uploadId },
    data: { status: "PAUSED" },
  });
  revalidatePath(`/procesos/${upload.processId}`);
  return { ok: true, message: "Homologación pausada." };
}

/**
 * Promote an upload's approved homologations into the rate repository.
 * Creates a RateCard per provider item that is approved + priced, so the new
 * provider's tariffs become part of the permanent data store (already
 * normalized to canonical items). Idempotent: replaces rates from this upload.
 */
export async function promoteUploadRates(formData: FormData) {
  const session = await requireRoles(
    "ADMIN",
    "PROCUREMENT_ANALYST",
    "PROVIDER_MANAGER",
  );
  const uploadId = String(formData.get("uploadId"));
  const validFromRaw = String(formData.get("validFrom") || "");
  const validToRaw = String(formData.get("validTo") || "");

  const upload = await prisma.processUpload.findFirst({
    where: { id: uploadId, process: { organizationId: session.organizationId } },
    select: { id: true, processId: true, providerId: true, fileName: true },
  });
  if (!upload) return;

  const items = await prisma.providerItem.findMany({
    where: {
      uploadId,
      rawPrice: { not: null },
      mapping: {
        canonicalItemId: { not: null },
        status: { in: ["APPROVED", "AUTO_APPROVED"] },
      },
    },
    include: { mapping: true },
  });

  const validFrom = validFromRaw ? new Date(validFromRaw) : new Date();
  const validTo = validToRaw ? new Date(validToRaw) : null;

  const rows = items
    .filter(
      (item): item is typeof item & { mapping: { canonicalItemId: string } } =>
        !!item.mapping?.canonicalItemId && item.rawPrice !== null,
    )
    .map((item) => ({
      organizationId: session.organizationId,
      canonicalItemId: item.mapping.canonicalItemId,
      providerId: upload.providerId,
      tariffSource: upload.fileName,
      value: item.rawPrice!,
      inclusions: item.inclusions,
      exclusions: item.exclusions,
      providerCode: item.rawCode,
      extra: (item.extra as Prisma.InputJsonValue | null) ?? undefined,
      validFrom,
      validTo,
      sourceUploadId: uploadId,
      sourceProcessId: upload.processId,
    }));

  // Bulk-insert in chunks instead of one create() per row: a few hundred
  // round-trips vs. thousands is what was timing out on files of ~2k items.
  const CHUNK_SIZE = 500;
  await prisma.$transaction(
    async (tx) => {
      // Replace any rates previously promoted from this same upload.
      await tx.rateCard.deleteMany({ where: { sourceUploadId: uploadId } });

      for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
        await tx.rateCard.createMany({ data: rows.slice(i, i + CHUNK_SIZE) });
      }

      await tx.auditLog.create({
        data: {
          organizationId: session.organizationId,
          actorId: session.userId,
          action: "rates.promoted",
          entityType: "ProcessUpload",
          entityId: uploadId,
          after: { count: rows.length },
        },
      });
    },
    // Default interactive-transaction timeout is 5s, too short for large files.
    { timeout: 60_000 },
  );

  revalidatePath(`/procesos/${upload.processId}`);
  revalidatePath("/tarifas");
  // Take the user to the repository so they can see the created rates.
  redirect("/tarifas");
}

/** Generate (or regenerate) the comparison for a process. */
export async function createComparison(formData: FormData) {
  const session = await requireRoles("ADMIN", "PROCUREMENT_ANALYST");
  const processId = String(formData.get("processId"));

  const process = await prisma.procurementProcess.findFirst({
    where: { id: processId, organizationId: session.organizationId },
    select: { id: true },
  });
  if (!process) return;

  await generateComparison(processId, session.organizationId);
  revalidatePath(`/procesos/${processId}/comparacion`);
  redirect(`/procesos/${processId}/comparacion`);
}
