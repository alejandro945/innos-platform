import { prisma } from "@/lib/prisma";
import { normalizeProviderItem, finalizeUpload } from "@/lib/normalize";
import { inngest, EVENTS } from "./client";

// Items processed per run. Each item costs 2 steps (lookup + normalize), so the
// per-run step count is ~2*BATCH + a few. Keep 2*BATCH well under Inngest's
// 1000-step ceiling. When a file has more pending items than this, the run
// re-triggers itself (continuation event) to process the rest in a fresh run.
const BATCH_SIZE = Number(process.env.NORMALIZE_BATCH_SIZE) || 400;

/**
 * Durable normalization workflow. Each provider item is its own step so it
 * stays within serverless limits and retries independently.
 *
 * - `cancelOn`: a new request for the SAME upload (resume / retry / restart)
 *   cancels the previous run — no duplicate runs processing the same file.
 * - `concurrency` keyed by uploadId (limit 1): belt-and-suspenders against
 *   two runs of the same upload overlapping (covers continuation runs too).
 * - Pause: the loop checks the upload status before each item and stops if it's
 *   no longer NORMALIZING (e.g. the user paused), leaving progress intact.
 * - Only pending items (without a mapping yet) are processed -> resumable.
 * - Batching: a single run processes at most BATCH_SIZE items, then hands off
 *   to a fresh run via `continueNormalizeUpload`. This keeps each run under the
 *   1000-step limit for large files (thousands of rows) while progress (one
 *   persisted mapping per item) survives across runs.
 */
export const normalizeUploadFn = inngest.createFunction(
  {
    id: "normalize-upload",
    concurrency: { key: "event.data.uploadId", limit: 1 },
    retries: 3,
    triggers: [
      { event: EVENTS.normalizeUpload },
      { event: EVENTS.continueNormalizeUpload },
    ],
    // Only the user-facing request cancels a prior run. The internal
    // continuation event must NOT cancel, or the chain would cancel itself.
    cancelOn: [{ event: EVENTS.normalizeUpload, match: "data.uploadId" }],
  },
  async ({ event, step }) => {
    const uploadId = (event.data as { uploadId: string }).uploadId;

    await step.run("mark-normalizing", async () => {
      // Don't override a pause that landed between runs.
      const u = await prisma.processUpload.findUnique({
        where: { id: uploadId },
        select: { status: true },
      });
      if (u?.status === "PAUSED") return;
      await prisma.processUpload.update({
        where: { id: uploadId },
        data: { status: "NORMALIZING" },
      });
    });

    // Process up to BATCH_SIZE pending items this run, checking for pause
    // between each.
    for (let i = 0; i < BATCH_SIZE; i++) {
      const next = await step.run(`next-${i}`, async () => {
        const upload = await prisma.processUpload.findUnique({
          where: { id: uploadId },
          select: { status: true },
        });
        if (upload?.status === "PAUSED") return { stop: "paused" as const };
        const item = await prisma.providerItem.findFirst({
          where: { uploadId, mapping: { is: null } },
          select: { id: true },
        });
        return item
          ? { stop: false as const, itemId: item.id }
          : { stop: "done" as const };
      });

      if (next.stop === "paused") return { paused: true };
      if (next.stop === "done") {
        return step.run("finalize", () => finalizeUpload(uploadId));
      }

      await step.run(`normalize-${next.itemId}`, () =>
        normalizeProviderItem(next.itemId),
      );
    }

    // Batch full but items remain -> continue in a fresh run (resets the step
    // budget). Progress so far is already persisted per item.
    await step.sendEvent("continue-normalization", {
      name: EVENTS.continueNormalizeUpload,
      data: { uploadId },
    });
    return { continued: true };
  },
);
