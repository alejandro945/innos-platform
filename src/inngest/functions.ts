import { prisma } from "@/lib/prisma";
import { normalizeProviderItem, finalizeUpload } from "@/lib/normalize";
import { inngest, EVENTS } from "./client";

/**
 * Durable normalization workflow. Each provider item is its own step so it
 * stays within serverless limits and retries independently.
 *
 * - `cancelOn`: a new request for the SAME upload (resume / retry / restart)
 *   cancels the previous run — no duplicate runs processing the same file.
 * - `concurrency` keyed by uploadId (limit 1): belt-and-suspenders against
 *   two runs of the same upload overlapping.
 * - Pause: the loop checks the upload status before each item and stops if it's
 *   no longer NORMALIZING (e.g. the user paused), leaving progress intact.
 * - Only pending items (without a mapping yet) are processed -> resumable.
 */
export const normalizeUploadFn = inngest.createFunction(
  {
    id: "normalize-upload",
    concurrency: { key: "event.data.uploadId", limit: 1 },
    retries: 3,
    triggers: [{ event: EVENTS.normalizeUpload }],
    cancelOn: [{ event: EVENTS.normalizeUpload, match: "data.uploadId" }],
  },
  async ({ event, step }) => {
    const uploadId = (event.data as { uploadId: string }).uploadId;

    await step.run("mark-normalizing", async () => {
      await prisma.processUpload.update({
        where: { id: uploadId },
        data: { status: "NORMALIZING" },
      });
    });

    // Process pending items one at a time, checking for pause between each.
    for (let i = 0; ; i++) {
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
      if (next.stop === "done") break;

      await step.run(`normalize-${next.itemId}`, () =>
        normalizeProviderItem(next.itemId),
      );
    }

    return step.run("finalize", () => finalizeUpload(uploadId));
  },
);
