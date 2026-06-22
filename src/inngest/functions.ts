import { prisma } from "@/lib/prisma";
import { normalizeProviderItem, finalizeUpload } from "@/lib/normalize";
import { inngest, EVENTS } from "./client";

// Items processed per run before handing off to a fresh run. Items are
// normalized in parallel pages of NORMALIZE_CONCURRENCY, so per-run steps are
// ~(BATCH/CONCURRENCY) page lookups + BATCH normalize steps. Keep that well
// under Inngest's 1000-step ceiling; large files spill into continuation runs.
const BATCH_SIZE = Number(process.env.NORMALIZE_BATCH_SIZE) || 400;

// How many items to homologate at once within a run. Set this to your Inngest
// plan's concurrency budget (free trial = 5) to use every available slot. The
// real-world speedup depends on the AI backend keeping up: a single self-hosted
// Ollama box must run with OLLAMA_NUM_PARALLEL >= this, or the concurrent LLM
// calls just queue on the server. Items that short-circuit (code/prior match,
// strong vector hit, no candidates) skip the LLM and parallelize cleanly.
const CONCURRENCY = Math.max(
  1,
  Number(process.env.NORMALIZE_CONCURRENCY) || 5,
);

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
 * - Parallelism: items are normalized in pages of CONCURRENCY using parallel
 *   steps, so the run uses the account's concurrent-step budget instead of
 *   crawling one item at a time.
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

    // Process up to BATCH_SIZE pending items this run, in parallel pages of
    // CONCURRENCY, checking for pause before each page.
    for (let processed = 0; processed < BATCH_SIZE; processed += CONCURRENCY) {
      const page = await step.run(`page-${processed}`, async () => {
        const upload = await prisma.processUpload.findUnique({
          where: { id: uploadId },
          select: { status: true },
        });
        if (upload?.status === "PAUSED") return { paused: true, ids: [] };
        const items = await prisma.providerItem.findMany({
          where: { uploadId, mapping: { is: null } },
          select: { id: true },
          take: CONCURRENCY,
        });
        return { paused: false, ids: items.map((it) => it.id) };
      });

      if (page.paused) return { paused: true };
      if (page.ids.length === 0) {
        return step.run("finalize", () => finalizeUpload(uploadId));
      }

      // Normalize this page concurrently. Each item is its own durable step, so
      // a retry only re-runs the items that actually failed.
      await Promise.all(
        page.ids.map((id) =>
          step.run(`normalize-${id}`, () => normalizeProviderItem(id)),
        ),
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
