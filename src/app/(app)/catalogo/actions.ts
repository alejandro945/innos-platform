"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRoles } from "@/lib/session";

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

  try {
    await prisma.canonicalItem.create({
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
  } catch {
    return { error: "Ya existe un ítem con ese CUPS propio." };
  }

  revalidatePath("/catalogo");
  return { ok: true };
}
