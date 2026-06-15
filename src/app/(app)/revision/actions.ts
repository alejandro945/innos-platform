"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireRoles } from "@/lib/session";
import { inferKind } from "@/lib/infer-kind";
import { embedCanonicalItem } from "@/lib/embed-items";
import type { ActionResult } from "@/lib/action-result";

/** Scope filter: optionally restrict review actions to one process. */
function scopeWhere(
  organizationId: string,
  proceso?: string,
): Prisma.ItemMappingWhereInput {
  return {
    providerItem: {
      provider: { organizationId },
      ...(proceso ? { upload: { processId: proceso } } : {}),
    },
  };
}

async function loadMapping(mappingId: string, organizationId: string) {
  return prisma.itemMapping.findFirst({
    where: {
      id: mappingId,
      providerItem: { provider: { organizationId } },
    },
  });
}

/** Approve a mapping (optionally re-pointing it to a chosen canonical item). */
export async function approveMapping(
  formData: FormData,
): Promise<ActionResult> {
  const session = await requireRoles("ADMIN", "PROCUREMENT_ANALYST", "REVIEWER");
  const mappingId = String(formData.get("mappingId"));
  const canonicalItemId = String(formData.get("canonicalItemId") || "");
  if (!canonicalItemId)
    return { ok: false, message: "Seleccione un ítem canónico." };

  const mapping = await loadMapping(mappingId, session.organizationId);
  if (!mapping) return { ok: false, message: "Homologación no encontrada." };

  // Validate the chosen item belongs to the organization.
  const item = await prisma.canonicalItem.findFirst({
    where: { id: canonicalItemId, organizationId: session.organizationId },
    select: { id: true },
  });
  if (!item) return { ok: false, message: "Ítem canónico inválido." };

  await prisma.$transaction([
    prisma.itemMapping.update({
      where: { id: mappingId },
      data: {
        canonicalItemId,
        status: "APPROVED",
        method: "HUMAN",
        confidence: 1,
        reviewedById: session.userId,
        reviewedAt: new Date(),
      },
    }),
    prisma.auditLog.create({
      data: {
        organizationId: session.organizationId,
        actorId: session.userId,
        action: "mapping.approved",
        entityType: "ItemMapping",
        entityId: mappingId,
        after: { canonicalItemId },
      },
    }),
  ]);

  revalidatePath("/revision");
  return { ok: true, message: "Homologación aprobada." };
}

/**
 * Create a new canonical item from the provider item and approve the mapping
 * to it. Unblocks providers whose services aren't yet in the catalog.
 */
export async function createCanonicalAndApprove(
  formData: FormData,
): Promise<ActionResult> {
  const session = await requireRoles("ADMIN", "PROCUREMENT_ANALYST", "REVIEWER");
  const mappingId = String(formData.get("mappingId"));

  const mapping = await prisma.itemMapping.findFirst({
    where: { id: mappingId, providerItem: { provider: { organizationId: session.organizationId } } },
    include: { providerItem: true },
  });
  if (!mapping) return { ok: false, message: "Homologación no encontrada." };

  const name = mapping.providerItem.rawName.trim();
  const rawCode = mapping.providerItem.rawCode?.trim() || null;
  const canonicalCode = `INO-${randomUUID().slice(0, 8).toUpperCase()}`;

  const created = await prisma.canonicalItem.create({
    data: {
      organizationId: session.organizationId,
      kind: inferKind(name),
      canonicalCode,
      normativeCode: rawCode,
      name,
      isApproved: true,
      codes: rawCode
        ? { create: [{ system: "CUPS", code: rawCode }] }
        : undefined,
    },
  });

  await prisma.$transaction([
    prisma.itemMapping.update({
      where: { id: mappingId },
      data: {
        canonicalItemId: created.id,
        status: "APPROVED",
        method: "HUMAN",
        confidence: 1,
        reviewedById: session.userId,
        reviewedAt: new Date(),
      },
    }),
    prisma.auditLog.create({
      data: {
        organizationId: session.organizationId,
        actorId: session.userId,
        action: "mapping.created_canonical",
        entityType: "ItemMapping",
        entityId: mappingId,
        after: { canonicalItemId: created.id, name },
      },
    }),
  ]);

  // Best-effort embedding for future retrieval.
  try {
    await embedCanonicalItem(created.id);
  } catch (e) {
    console.warn("Embedding skipped:", (e as Error).message);
  }

  revalidatePath("/revision");
  return { ok: true, message: "Ítem canónico creado y aprobado." };
}

/** Approve all high-confidence (≥0.9) pending mappings that have a match. */
export async function approveAllHighConfidence(
  formData: FormData,
): Promise<ActionResult> {
  const session = await requireRoles("ADMIN", "PROCUREMENT_ANALYST", "REVIEWER");
  const proceso = String(formData.get("proceso") || "") || undefined;

  const result = await prisma.itemMapping.updateMany({
    where: {
      status: "PENDING_REVIEW",
      confidence: { gte: 0.9 },
      canonicalItemId: { not: null },
      ...scopeWhere(session.organizationId, proceso),
    },
    data: {
      status: "APPROVED",
      method: "HUMAN",
      reviewedById: session.userId,
      reviewedAt: new Date(),
    },
  });

  revalidatePath("/revision");
  return {
    ok: true,
    message:
      result.count > 0
        ? `${result.count} homologación(es) de alta confianza aprobadas.`
        : "No hay homologaciones de alta confianza por aprobar.",
  };
}

/** Approve the selected mappings (keeping their suggested canonical item). */
export async function approveSelected(
  formData: FormData,
): Promise<ActionResult> {
  const session = await requireRoles("ADMIN", "PROCUREMENT_ANALYST", "REVIEWER");
  const ids = String(formData.get("ids") || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (ids.length === 0) return { ok: false, message: "No seleccionó ítems." };

  const result = await prisma.itemMapping.updateMany({
    where: {
      id: { in: ids },
      canonicalItemId: { not: null },
      ...scopeWhere(session.organizationId),
    },
    data: {
      status: "APPROVED",
      method: "HUMAN",
      reviewedById: session.userId,
      reviewedAt: new Date(),
    },
  });

  revalidatePath("/revision");
  return { ok: true, message: `${result.count} homologación(es) aprobadas.` };
}

/** Create a canonical item for every "no match" item and approve it. */
export async function bulkCreateAndApproveNoMatch(
  formData: FormData,
): Promise<ActionResult> {
  const session = await requireRoles("ADMIN", "PROCUREMENT_ANALYST", "REVIEWER");
  const proceso = String(formData.get("proceso") || "") || undefined;

  const items = await prisma.itemMapping.findMany({
    where: {
      status: "NO_MATCH",
      canonicalItemId: null,
      ...scopeWhere(session.organizationId, proceso),
    },
    include: { providerItem: true },
    take: 500,
  });

  let created = 0;
  for (const m of items) {
    const name = m.providerItem.rawName.trim();
    if (!name) continue;
    const rawCode = m.providerItem.rawCode?.trim() || null;
    const item = await prisma.canonicalItem.create({
      data: {
        organizationId: session.organizationId,
        kind: inferKind(name),
        canonicalCode: `INO-${randomUUID().slice(0, 8).toUpperCase()}`,
        normativeCode: rawCode,
        name,
        isApproved: true,
        codes: rawCode ? { create: [{ system: "CUPS", code: rawCode }] } : undefined,
      },
    });
    await prisma.itemMapping.update({
      where: { id: m.id },
      data: {
        canonicalItemId: item.id,
        status: "APPROVED",
        method: "HUMAN",
        confidence: 1,
        reviewedById: session.userId,
        reviewedAt: new Date(),
      },
    });
    try {
      await embedCanonicalItem(item.id);
    } catch {
      /* embeddings optional */
    }
    created++;
  }

  revalidatePath("/revision");
  return {
    ok: true,
    message:
      created > 0
        ? `${created} ítem(s) canónico(s) creados y aprobados.`
        : "No hay ítems sin coincidencia.",
  };
}

/** Reject a mapping (no canonical match). */
export async function rejectMapping(
  formData: FormData,
): Promise<ActionResult> {
  const session = await requireRoles("ADMIN", "PROCUREMENT_ANALYST", "REVIEWER");
  const mappingId = String(formData.get("mappingId"));

  const mapping = await loadMapping(mappingId, session.organizationId);
  if (!mapping) return { ok: false, message: "Homologación no encontrada." };

  await prisma.$transaction([
    prisma.itemMapping.update({
      where: { id: mappingId },
      data: {
        canonicalItemId: null,
        status: "REJECTED",
        method: "HUMAN",
        reviewedById: session.userId,
        reviewedAt: new Date(),
      },
    }),
    prisma.auditLog.create({
      data: {
        organizationId: session.organizationId,
        actorId: session.userId,
        action: "mapping.rejected",
        entityType: "ItemMapping",
        entityId: mappingId,
      },
    }),
  ]);

  revalidatePath("/revision");
  return { ok: true, message: "Marcada como sin coincidencia." };
}
