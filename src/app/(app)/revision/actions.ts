"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRoles } from "@/lib/session";

async function loadMapping(mappingId: string, organizationId: string) {
  return prisma.itemMapping.findFirst({
    where: {
      id: mappingId,
      providerItem: { provider: { organizationId } },
    },
  });
}

/** Approve a mapping (optionally re-pointing it to a chosen canonical item). */
export async function approveMapping(formData: FormData) {
  const session = await requireRoles("ADMIN", "PROCUREMENT_ANALYST", "REVIEWER");
  const mappingId = String(formData.get("mappingId"));
  const canonicalItemId = String(formData.get("canonicalItemId") || "");
  if (!canonicalItemId) return;

  const mapping = await loadMapping(mappingId, session.organizationId);
  if (!mapping) return;

  // Validate the chosen item belongs to the organization.
  const item = await prisma.canonicalItem.findFirst({
    where: { id: canonicalItemId, organizationId: session.organizationId },
    select: { id: true },
  });
  if (!item) return;

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
}

/** Reject a mapping (no canonical match). */
export async function rejectMapping(formData: FormData) {
  const session = await requireRoles("ADMIN", "PROCUREMENT_ANALYST", "REVIEWER");
  const mappingId = String(formData.get("mappingId"));

  const mapping = await loadMapping(mappingId, session.organizationId);
  if (!mapping) return;

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
}
