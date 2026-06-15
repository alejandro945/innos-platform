import { prisma } from "@/lib/prisma";
import { normalizeProviderItem, finalizeUpload } from "@/lib/normalize";
import { inngest, EVENTS } from "./client";

/**
 * Durable normalization workflow: one step per provider item so each unit of
 * work stays within serverless limits and retries independently.
 */
export const normalizeUploadFn = inngest.createFunction(
  {
    id: "normalize-upload",
    concurrency: 5,
    retries: 3,
    triggers: [{ event: EVENTS.normalizeUpload }],
  },
  async ({ event, step }) => {
    const uploadId = (event.data as { uploadId: string }).uploadId;

    await step.run("mark-normalizing", async () => {
      await prisma.processUpload.update({
        where: { id: uploadId },
        data: { status: "NORMALIZING" },
      });
    });

    const items = await step.run("load-items", async () =>
      prisma.providerItem.findMany({
        where: { uploadId },
        select: { id: true },
      }),
    );

    for (const item of items) {
      await step.run(`normalize-${item.id}`, () =>
        normalizeProviderItem(item.id),
      );
    }

    return step.run("finalize", () => finalizeUpload(uploadId));
  },
);
