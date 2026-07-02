"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRoles } from "@/lib/session";
import { repointCanonicalItem } from "@/lib/canonical-merge";
import { embedCanonicalItem } from "@/lib/embed-items";
import { extractRegulatoryUpdateInline } from "@/lib/regulatory-extraction";
import { runSisproVerificationInline } from "@/lib/sispro";
import { formatDate } from "@/lib/format";
import { inngest, EVENTS } from "@/inngest/client";
import type { ActionResult } from "@/lib/action-result";

export type ActionState = { error?: string; ok?: boolean };

function appendNote(existing: string | null, note: string): string {
  return existing ? `${existing}\n\n${note}` : note;
}

/**
 * Trigger (durable via Inngest, or inline as a dev/no-queue fallback)
 * extraction for a regulatory update that already has its PDF in Blob
 * storage. Shared by the initial upload and by a manual retry.
 *
 * IMPORTANT: without INNGEST_EVENT_KEY configured, extraction runs inline
 * inside this request's `after()` — which is bound by Vercel's serverless
 * function duration limit (a few minutes at most). A resolution with many
 * chunks, each needing an LLM call, can easily exceed that, silently killing
 * the job mid-way with no error ever recorded (the process is killed, not
 * caught) — the row is then stuck in EXTRACTING forever. Configuring Inngest
 * is what makes this reliable for real-sized PDFs.
 */
function triggerRegulatoryExtraction(regulatoryUpdateId: string): void {
  if (process.env.INNGEST_EVENT_KEY) {
    void inngest.send({
      name: EVENTS.extractRegulatoryUpdate,
      data: { regulatoryUpdateId },
    });
    return;
  }
  after(async () => {
    try {
      await extractRegulatoryUpdateInline(regulatoryUpdateId);
    } catch (e) {
      console.error("extractRegulatoryUpdateInline failed:", e);
      await prisma.regulatoryUpdate.update({
        where: { id: regulatoryUpdateId },
        data: { status: "FAILED" },
      });
    }
  });
}

/**
 * Create a RegulatoryUpdate for a PDF already uploaded to Blob storage (the
 * browser uploads directly via @vercel/blob/client — see upload-form.tsx —
 * since a Server Action's own request body is capped at 1MB, far too small
 * for a multi-MB resolution) and kick off (durable or inline) extraction.
 */
export async function createRegulatoryUpdateFromBlob(
  fileName: string,
  blobUrl: string,
): Promise<ActionState> {
  const session = await requireRoles("ADMIN");
  if (!fileName || !blobUrl) return { error: "Archivo inválido." };

  const created = await prisma.regulatoryUpdate.create({
    data: {
      organizationId: session.organizationId,
      sourceFileName: fileName,
      sourceBlobUrl: blobUrl,
      createdById: session.userId,
    },
  });

  triggerRegulatoryExtraction(created.id);

  revalidatePath("/actualizaciones-cups");
  redirect(`/actualizaciones-cups/${created.id}`);
}

/**
 * Re-run extraction from scratch for a stuck/failed update. Safe to repeat:
 * `persistChunkResult` dedupes by oldCode, so already-recorded changes for
 * this resolution aren't duplicated. Sending EVENTS.extractRegulatoryUpdate
 * again also cancels any still-running prior attempt for the same id
 * (`cancelOn` on the Inngest function), so there's never two in flight.
 */
export async function retryRegulatoryExtraction(formData: FormData): Promise<ActionResult> {
  const session = await requireRoles("ADMIN");
  const regulatoryUpdateId = String(formData.get("regulatoryUpdateId"));

  const update = await prisma.regulatoryUpdate.findFirst({
    where: { id: regulatoryUpdateId, organizationId: session.organizationId },
    select: { id: true, sourceBlobUrl: true },
  });
  if (!update?.sourceBlobUrl) {
    return { ok: false, message: "Actualización no encontrada." };
  }

  await prisma.regulatoryUpdate.update({
    where: { id: regulatoryUpdateId },
    data: { status: "EXTRACTING" },
  });
  triggerRegulatoryExtraction(regulatoryUpdateId);

  revalidatePath(`/actualizaciones-cups/${regulatoryUpdateId}`);
  return { ok: true, message: "Reintentando el análisis." };
}

/** Delete a resolution upload (e.g. one stuck or failed) so it can be re-uploaded. */
export async function deleteRegulatoryUpdate(formData: FormData) {
  const session = await requireRoles("ADMIN");
  const regulatoryUpdateId = String(formData.get("regulatoryUpdateId"));

  const update = await prisma.regulatoryUpdate.findFirst({
    where: { id: regulatoryUpdateId, organizationId: session.organizationId },
    select: { id: true, sourceBlobUrl: true },
  });
  if (!update) return;

  await prisma.regulatoryUpdate.delete({ where: { id: regulatoryUpdateId } });
  if (update.sourceBlobUrl) {
    try {
      const { del } = await import("@vercel/blob");
      await del(update.sourceBlobUrl);
    } catch (e) {
      console.warn("Blob cleanup skipped:", (e as Error).message);
    }
  }

  revalidatePath("/actualizaciones-cups");
  redirect("/actualizaciones-cups");
}

/** Approve or reject one extracted change (before applying). */
export async function setChangeStatus(formData: FormData): Promise<ActionResult> {
  const session = await requireRoles("ADMIN");
  const changeId = String(formData.get("changeId"));
  const status = String(formData.get("status"));
  if (status !== "APPROVED" && status !== "REJECTED" && status !== "PENDING") {
    return { ok: false, message: "Estado inválido." };
  }

  const change = await prisma.cupsCodeChange.findFirst({
    where: { id: changeId, regulatoryUpdate: { organizationId: session.organizationId } },
    select: { id: true, regulatoryUpdateId: true },
  });
  if (!change) return { ok: false, message: "Cambio no encontrado." };

  await prisma.cupsCodeChange.update({ where: { id: changeId }, data: { status } });
  revalidatePath(`/actualizaciones-cups/${change.regulatoryUpdateId}`);
  return {
    ok: true,
    message:
      status === "APPROVED" ? "Aprobado." : status === "REJECTED" ? "Descartado." : "Revertido a pendiente.",
  };
}

/**
 * Apply every APPROVED change with a matched catalog item: creates a new
 * CanonicalItem cloned from the matched one (same CUPS propio) with the
 * updated normativeCode, deactivates the old one, and repoints its
 * rates/mappings — or, if the resolution eliminates the code with no
 * replacement, just deactivates the matched item. See
 * src/lib/canonical-merge.ts for the repoint logic (shared with the manual
 * catalog-duplicate merge in /analisis).
 */
export async function applyRegulatoryUpdate(formData: FormData): Promise<ActionResult> {
  const session = await requireRoles("ADMIN");
  const regulatoryUpdateId = String(formData.get("regulatoryUpdateId"));

  const update = await prisma.regulatoryUpdate.findFirst({
    where: { id: regulatoryUpdateId, organizationId: session.organizationId },
    select: { id: true, resolutionNumber: true, resolutionDate: true },
  });
  if (!update) return { ok: false, message: "Actualización no encontrada." };

  const approved = await prisma.cupsCodeChange.findMany({
    where: { regulatoryUpdateId, status: "APPROVED", matchedItemId: { not: null } },
    orderBy: { id: "asc" },
  });
  if (approved.length === 0) {
    return { ok: false, message: "No hay cambios aprobados con ítem coincidente." };
  }

  const resolutionLabel = update.resolutionNumber
    ? `la Resolución ${update.resolutionNumber}${update.resolutionDate ? ` del ${formatDate(update.resolutionDate)}` : ""}`
    : "la resolución cargada";

  const seenMatchedItems = new Set<string>();
  const createdItemIds: string[] = [];
  let appliedCount = 0;
  let skippedSplit = 0;

  for (const change of approved) {
    const matchedItemId = change.matchedItemId!;

    // A code that splits into several new ones would need the same matched
    // item updated twice in one pass — only the first applies automatically;
    // the rest stay APPROVED with a note for the admin to handle manually.
    if (seenMatchedItems.has(matchedItemId)) {
      await prisma.cupsCodeChange.update({
        where: { id: change.id },
        data: {
          note: appendNote(
            change.note,
            "Omitido al aplicar: el ítem coincidente ya fue actualizado por otro cambio de esta misma resolución (posible división de código). Revisar y aplicar manualmente en Catálogo si corresponde.",
          ),
        },
      });
      skippedSplit++;
      continue;
    }
    seenMatchedItems.add(matchedItemId);

    const createdItemId = await prisma.$transaction(async (tx) => {
      const oldItem = await tx.canonicalItem.findUnique({ where: { id: matchedItemId } });
      if (!oldItem) return null;

      let newItemId: string | null = null;

      if (change.newCode) {
        const archivedCode = `${oldItem.canonicalCode}__retirado__${oldItem.id.slice(-6)}`;
        await tx.canonicalItem.update({
          where: { id: oldItem.id },
          data: {
            canonicalCode: archivedCode,
            isActive: false,
            description: appendNote(
              oldItem.description,
              `Inactivado por ${resolutionLabel}. Reemplazado por CUPS normativo ${change.newCode} (mismo CUPS propio: ${oldItem.canonicalCode}).`,
            ),
          },
        });

        const newItem = await tx.canonicalItem.create({
          data: {
            organizationId: session.organizationId,
            kind: oldItem.kind,
            canonicalCode: oldItem.canonicalCode, // original code, now freed
            normativeCode: change.newCode,
            name: oldItem.name,
            description: appendNote(
              oldItem.description,
              `Creado por ${resolutionLabel}. Actualiza CUPS normativo ${change.oldCode} → ${change.newCode} (mismo CUPS propio).`,
            ),
            includesFees: oldItem.includesFees,
            includesSupplies: oldItem.includesSupplies,
          },
        });
        newItemId = newItem.id;

        await repointCanonicalItem(tx, { fromId: oldItem.id, toId: newItem.id });

        await tx.cupsCodeChange.update({
          where: { id: change.id },
          data: { status: "APPLIED", createdItemId: newItem.id },
        });
      } else {
        await tx.canonicalItem.update({
          where: { id: oldItem.id },
          data: {
            isActive: false,
            description: appendNote(
              oldItem.description,
              `Inactivado (CUPS normativo ${change.oldCode} eliminado) por ${resolutionLabel}, sin código de reemplazo.`,
            ),
          },
        });
        await tx.cupsCodeChange.update({
          where: { id: change.id },
          data: { status: "APPLIED" },
        });
      }

      await tx.auditLog.create({
        data: {
          organizationId: session.organizationId,
          actorId: session.userId,
          action: "catalog.cups_updated",
          entityType: "CanonicalItem",
          entityId: oldItem.id,
          before: { oldCode: change.oldCode, canonicalCode: oldItem.canonicalCode },
          after: { newCode: change.newCode, regulatoryUpdateId },
        },
      });

      return newItemId;
    });

    appliedCount++;
    if (createdItemId) createdItemIds.push(createdItemId);
  }

  // Generate embeddings outside the transaction (external AI call).
  for (const id of createdItemIds) {
    try {
      await embedCanonicalItem(id);
    } catch (e) {
      console.warn("Embedding skipped for", id, (e as Error).message);
    }
  }

  await prisma.regulatoryUpdate.update({
    where: { id: regulatoryUpdateId },
    data: { status: "APPLIED", appliedAt: new Date(), appliedById: session.userId },
  });

  revalidatePath(`/actualizaciones-cups/${regulatoryUpdateId}`);
  revalidatePath("/catalogo");
  revalidatePath("/analisis");

  return {
    ok: true,
    message:
      skippedSplit > 0
        ? `Se aplicaron ${appliedCount} cambio(s). ${skippedSplit} se omitieron por afectar un ítem ya actualizado en esta resolución.`
        : `Se aplicaron ${appliedCount} cambio(s).`,
  };
}

/** Trigger a (durable or inline) SISPRO verification run for the org's catalog. */
export async function verifyCatalogAgainstSispro() {
  const session = await requireRoles("ADMIN");

  const verification = await prisma.sisproVerification.create({
    data: { organizationId: session.organizationId, runById: session.userId },
  });

  if (process.env.INNGEST_EVENT_KEY) {
    await inngest.send({
      name: EVENTS.verifySisproVerification,
      data: { verificationId: verification.id },
    });
  } else {
    after(async () => {
      try {
        await runSisproVerificationInline(verification.id);
      } catch (e) {
        console.error("runSisproVerificationInline failed:", e);
        await prisma.sisproVerification.update({
          where: { id: verification.id },
          data: { status: "FAILED" },
        });
      }
    });
  }

  revalidatePath("/catalogo");
  redirect(`/catalogo/verificacion-sispro/${verification.id}`);
}
