"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRoles } from "@/lib/session";

const providerSchema = z.object({
  name: z.string().trim().min(2, "El nombre es obligatorio."),
  nit: z.string().trim().optional(),
  contactName: z.string().trim().optional(),
  contactEmail: z
    .string()
    .trim()
    .email("Correo inválido.")
    .optional()
    .or(z.literal("")),
});

export type ActionState = { error?: string; ok?: boolean };

export async function createProvider(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireRoles("ADMIN", "PROVIDER_MANAGER");

  const parsed = providerSchema.safeParse({
    name: formData.get("name"),
    nit: formData.get("nit"),
    contactName: formData.get("contactName"),
    contactEmail: formData.get("contactEmail"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }

  const data = parsed.data;
  try {
    await prisma.provider.create({
      data: {
        organizationId: session.organizationId,
        name: data.name,
        nit: data.nit || null,
        contactName: data.contactName || null,
        contactEmail: data.contactEmail || null,
      },
    });
  } catch {
    return { error: "Ya existe un proveedor con ese nombre." };
  }

  revalidatePath("/proveedores");
  return { ok: true };
}

export async function updateProvider(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireRoles("ADMIN", "PROVIDER_MANAGER");
  const id = String(formData.get("id"));
  const parsed = providerSchema.safeParse({
    name: formData.get("name"),
    nit: formData.get("nit"),
    contactName: formData.get("contactName"),
    contactEmail: formData.get("contactEmail"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }
  const existing = await prisma.provider.findFirst({
    where: { id, organizationId: session.organizationId },
    select: { id: true },
  });
  if (!existing) return { error: "Proveedor no encontrado." };

  const data = parsed.data;
  try {
    await prisma.provider.update({
      where: { id },
      data: {
        name: data.name,
        nit: data.nit || null,
        contactName: data.contactName || null,
        contactEmail: data.contactEmail || null,
      },
    });
  } catch {
    return { error: "Ya existe un proveedor con ese nombre." };
  }
  revalidatePath("/proveedores");
  return { ok: true };
}

export async function deleteProvider(formData: FormData) {
  const session = await requireRoles("ADMIN", "PROVIDER_MANAGER");
  const id = String(formData.get("id"));
  const provider = await prisma.provider.findFirst({
    where: { id, organizationId: session.organizationId },
    include: { _count: { select: { rateCards: true, uploads: true } } },
  });
  if (!provider) return;
  // Block delete when there are associated rates/uploads (FK + data safety).
  if (provider._count.rateCards > 0 || provider._count.uploads > 0) return;
  await prisma.provider.delete({ where: { id } });
  revalidatePath("/proveedores");
}

export async function toggleProviderStatus(formData: FormData) {
  const session = await requireRoles("ADMIN", "PROVIDER_MANAGER");
  const id = String(formData.get("id"));
  const provider = await prisma.provider.findFirst({
    where: { id, organizationId: session.organizationId },
  });
  if (!provider) return;
  await prisma.provider.update({
    where: { id },
    data: { status: provider.status === "ACTIVE" ? "INACTIVE" : "ACTIVE" },
  });
  revalidatePath("/proveedores");
}
