"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRoles } from "@/lib/session";
import { embedCanonicalItem } from "@/lib/embed-items";

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

export async function deleteCanonicalItem(formData: FormData) {
  const session = await requireRoles("ADMIN");
  const id = String(formData.get("id"));
  const item = await prisma.canonicalItem.findFirst({
    where: { id, organizationId: session.organizationId },
    include: { _count: { select: { rateCards: true } } },
  });
  if (!item) return;
  // Block delete when rates reference this item.
  if (item._count.rateCards > 0) return;
  await prisma.canonicalItem.delete({ where: { id } });
  revalidatePath("/catalogo");
}
