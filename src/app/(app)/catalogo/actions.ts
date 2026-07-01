"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRoles } from "@/lib/session";
import { embedCanonicalItem } from "@/lib/embed-items";
import { repointCanonicalItem } from "@/lib/canonical-merge";
import type { ActionResult } from "@/lib/action-result";

const itemSchema = z.object({
  kind: z.enum(["SERVICE", "MEDICATION", "DEVICE", "SUPPLY"]),
  canonicalCode: z.string().trim().min(1, "El CUPS propio es obligatorio."),
  normativeCode: z.string().trim().optional(),
  name: z.string().trim().min(2, "El nombre es obligatorio."),
  description: z.string().trim().optional(),
  includesFees: z.coerce.boolean(),
  includesSupplies: z.coerce.boolean(),
});

export type ActionState = { error?: string; ok?: boolean };

export async function createCanonicalItem(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireRoles("ADMIN");

  const parsed = itemSchema.safeParse({
    kind: formData.get("kind"),
    canonicalCode: formData.get("canonicalCode"),
    normativeCode: formData.get("normativeCode"),
    name: formData.get("name"),
    description: formData.get("description"),
    includesFees: formData.get("includesFees") === "on",
    includesSupplies: formData.get("includesSupplies") === "on",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }
  const data = parsed.data;

  let createdId: string;
  try {
    const created = await prisma.canonicalItem.create({
      data: {
        organizationId: session.organizationId,
        kind: data.kind,
        canonicalCode: data.canonicalCode,
        normativeCode: data.normativeCode || null,
        name: data.name,
        description: data.description || null,
        includesFees: data.includesFees,
        includesSupplies: data.includesSupplies,
        codes: data.normativeCode
          ? { create: [{ system: "CUPS", code: data.normativeCode }] }
          : undefined,
      },
    });
    createdId = created.id;
  } catch {
    return { error: "Ya existe un ítem con ese CUPS propio." };
  }

  // Generate the search embedding (no-op when embeddings are not configured).
  try {
    await embedCanonicalItem(createdId);
  } catch (e) {
    console.warn("Embedding generation skipped:", (e as Error).message);
  }

  revalidatePath("/catalogo");
  return { ok: true };
}

export async function updateCanonicalItem(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireRoles("ADMIN");
  const id = String(formData.get("id"));
  const parsed = itemSchema.safeParse({
    kind: formData.get("kind"),
    canonicalCode: formData.get("canonicalCode"),
    normativeCode: formData.get("normativeCode"),
    name: formData.get("name"),
    description: formData.get("description"),
    includesFees: formData.get("includesFees") === "on",
    includesSupplies: formData.get("includesSupplies") === "on",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }
  const existing = await prisma.canonicalItem.findFirst({
    where: { id, organizationId: session.organizationId },
    select: { id: true },
  });
  if (!existing) return { error: "Ítem no encontrado." };

  const data = parsed.data;
  try {
    await prisma.canonicalItem.update({
      where: { id },
      data: {
        kind: data.kind,
        canonicalCode: data.canonicalCode,
        normativeCode: data.normativeCode || null,
        name: data.name,
        description: data.description || null,
        includesFees: data.includesFees,
        includesSupplies: data.includesSupplies,
      },
    });
  } catch {
    return { error: "Ya existe un ítem con ese CUPS propio." };
  }

  try {
    await embedCanonicalItem(id);
  } catch (e) {
    console.warn("Embedding skipped:", (e as Error).message);
  }

  revalidatePath("/catalogo");
  return { ok: true };
}

export async function deleteCanonicalItem(
  formData: FormData,
): Promise<ActionResult> {
  const session = await requireRoles("ADMIN");
  const id = String(formData.get("id"));
  const item = await prisma.canonicalItem.findFirst({
    where: { id, organizationId: session.organizationId },
    include: { _count: { select: { rateCards: true } } },
  });
  if (!item) return { ok: false, message: "Ítem no encontrado." };
  if (item._count.rateCards > 0) {
    return {
      ok: false,
      message: "No se puede borrar: tiene tarifas asociadas.",
    };
  }
  await prisma.canonicalItem.delete({ where: { id } });
  revalidatePath("/catalogo");
  return { ok: true, message: "Ítem eliminado." };
}

/**
 * Merge two canonical items flagged as likely duplicates: every rate, mapping
 * and code that pointed at `discardId` is repointed to `keepId`, then the
 * discarded item is deleted. Codes that would collide with one `keep` already
 * has are simply dropped (their FK cascades away with the deleted item).
 */
export async function mergeCanonicalItems(
  formData: FormData,
): Promise<ActionResult> {
  const session = await requireRoles("ADMIN");
  const keepId = String(formData.get("keepId"));
  const discardId = String(formData.get("discardId"));
  if (!keepId || !discardId || keepId === discardId) {
    return { ok: false, message: "Selección inválida." };
  }

  const [keep, discard] = await Promise.all([
    prisma.canonicalItem.findFirst({
      where: { id: keepId, organizationId: session.organizationId },
      select: { id: true, name: true, canonicalCode: true },
    }),
    prisma.canonicalItem.findFirst({
      where: { id: discardId, organizationId: session.organizationId },
      select: { id: true, name: true, canonicalCode: true },
    }),
  ]);
  if (!keep || !discard) return { ok: false, message: "Ítem no encontrado." };

  await prisma.$transaction(async (tx) => {
    // Codes that don't move (would collide on `keep`) cascade-delete with the
    // discarded item below, along with its embedding.
    await repointCanonicalItem(tx, { fromId: discardId, toId: keepId });

    await tx.canonicalItem.delete({ where: { id: discardId } });

    await tx.auditLog.create({
      data: {
        organizationId: session.organizationId,
        actorId: session.userId,
        action: "catalog.merged",
        entityType: "CanonicalItem",
        entityId: keepId,
        before: {
          discardId: discard.id,
          discardCode: discard.canonicalCode,
          discardName: discard.name,
        },
      },
    });
  });

  revalidatePath("/catalogo");
  revalidatePath("/analisis");
  return {
    ok: true,
    message: `"${discard.name}" se fusionó con "${keep.name}".`,
  };
}
