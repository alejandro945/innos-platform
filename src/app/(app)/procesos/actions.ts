"use server";

import { revalidatePath } from "next/cache";
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
    exclusions: null,
  };
  for (const field of MAPPING_FIELDS) {
    const value = String(formData.get(field) ?? "").trim();
    mapping[field] = value || null;
  }
  if (!mapping.name) return; // name is required to identify items

  await prisma.$transaction(async (tx) => {
    // Reset any previously materialized items for this upload.
    await tx.providerItem.deleteMany({ where: { uploadId } });

    let rowNumber = 0;
    for (const row of stored.rows) {
      rowNumber++;
      const rawName = String(row[mapping.name!] ?? "").trim();
      if (!rawName) continue;
      await tx.providerItem.create({
        data: {
          uploadId,
          providerId: upload.providerId,
          rowNumber,
          rawName,
          rawCode: mapping.code ? String(row[mapping.code] ?? "").trim() || null : null,
          rawUnit: mapping.unit ? String(row[mapping.unit] ?? "").trim() || null : null,
          rawPrice: mapping.price ? parsePrice(row[mapping.price]) : null,
          exclusions: mapping.exclusions
            ? String(row[mapping.exclusions] ?? "").trim() || null
            : null,
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
 * Start homologation for an upload. Uses Inngest (durable) when configured,
 * otherwise runs the pipeline inline (suitable for dev / small files).
 */
export async function requestNormalization(formData: FormData) {
  const session = await requireRoles("ADMIN", "PROCUREMENT_ANALYST");
  const uploadId = String(formData.get("uploadId"));

  const upload = await prisma.processUpload.findFirst({
    where: { id: uploadId, process: { organizationId: session.organizationId } },
    select: { id: true, processId: true },
  });
  if (!upload) return;

  await prisma.processUpload.update({
    where: { id: uploadId },
    data: { status: "NORMALIZING" },
  });

  if (process.env.INNGEST_EVENT_KEY) {
    await inngest.send({ name: EVENTS.normalizeUpload, data: { uploadId } });
  } else {
    // Inline fallback (no queue configured).
    await normalizeUpload(uploadId);
  }

  revalidatePath(`/procesos/${upload.processId}`);
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
