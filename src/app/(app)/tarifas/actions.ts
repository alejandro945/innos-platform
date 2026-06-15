"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRoles } from "@/lib/session";
import type { ActionResult } from "@/lib/action-result";

const rateSchema = z.object({
  canonicalItemId: z.string().trim().min(1, "Seleccione un ítem canónico."),
  providerId: z.string().trim().min(1, "Seleccione un proveedor."),
  tariffSource: z.string().trim().optional(),
  value: z.coerce
    .number()
    .positive("El valor debe ser mayor a cero.")
    .lt(1e12, "El valor es demasiado grande."),
  unit: z.string().trim().optional(),
  exclusions: z.string().trim().optional(),
  validFrom: z.string().trim().min(1, "Indique la vigencia desde."),
  validTo: z.string().trim().optional(),
});

export type ActionState = { error?: string; ok?: boolean };

export async function createRate(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireRoles("ADMIN", "PROCUREMENT_ANALYST", "PROVIDER_MANAGER");

  const parsed = rateSchema.safeParse({
    canonicalItemId: formData.get("canonicalItemId"),
    providerId: formData.get("providerId"),
    tariffSource: formData.get("tariffSource"),
    value: formData.get("value"),
    unit: formData.get("unit"),
    exclusions: formData.get("exclusions"),
    validFrom: formData.get("validFrom"),
    validTo: formData.get("validTo"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }
  const data = parsed.data;

  // Ensure the item and provider belong to the organization.
  const [item, provider] = await Promise.all([
    prisma.canonicalItem.findFirst({
      where: { id: data.canonicalItemId, organizationId: session.organizationId },
    }),
    prisma.provider.findFirst({
      where: { id: data.providerId, organizationId: session.organizationId },
    }),
  ]);
  if (!item || !provider) return { error: "Ítem o proveedor no válido." };

  await prisma.rateCard.create({
    data: {
      organizationId: session.organizationId,
      canonicalItemId: data.canonicalItemId,
      providerId: data.providerId,
      tariffSource: data.tariffSource || null,
      value: data.value,
      unit: data.unit || null,
      exclusions: data.exclusions || null,
      validFrom: new Date(data.validFrom),
      validTo: data.validTo ? new Date(data.validTo) : null,
    },
  });

  revalidatePath("/tarifas");
  return { ok: true };
}

const rateUpdateSchema = z.object({
  tariffSource: z.string().trim().optional(),
  value: z.coerce
    .number()
    .positive("El valor debe ser mayor a cero.")
    .lt(1e12, "El valor es demasiado grande."),
  unit: z.string().trim().optional(),
  exclusions: z.string().trim().optional(),
  validFrom: z.string().trim().min(1, "Indique la vigencia desde."),
  validTo: z.string().trim().optional(),
});

export async function updateRate(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireRoles(
    "ADMIN",
    "PROCUREMENT_ANALYST",
    "PROVIDER_MANAGER",
  );
  const id = String(formData.get("id"));
  const parsed = rateUpdateSchema.safeParse({
    tariffSource: formData.get("tariffSource"),
    value: formData.get("value"),
    unit: formData.get("unit"),
    exclusions: formData.get("exclusions"),
    validFrom: formData.get("validFrom"),
    validTo: formData.get("validTo"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }
  const existing = await prisma.rateCard.findFirst({
    where: { id, organizationId: session.organizationId },
    select: { id: true },
  });
  if (!existing) return { error: "Tarifa no encontrada." };

  const data = parsed.data;
  await prisma.rateCard.update({
    where: { id },
    data: {
      tariffSource: data.tariffSource || null,
      value: data.value,
      unit: data.unit || null,
      exclusions: data.exclusions || null,
      validFrom: new Date(data.validFrom),
      validTo: data.validTo ? new Date(data.validTo) : null,
    },
  });
  revalidatePath("/tarifas");
  return { ok: true };
}

export async function deleteRate(formData: FormData): Promise<ActionResult> {
  const session = await requireRoles(
    "ADMIN",
    "PROCUREMENT_ANALYST",
    "PROVIDER_MANAGER",
  );
  const id = String(formData.get("id"));
  const existing = await prisma.rateCard.findFirst({
    where: { id, organizationId: session.organizationId },
    select: { id: true },
  });
  if (!existing) return { ok: false, message: "Tarifa no encontrada." };
  await prisma.rateCard.delete({ where: { id } });
  revalidatePath("/tarifas");
  return { ok: true, message: "Tarifa eliminada." };
}
