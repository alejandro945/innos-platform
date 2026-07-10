import { prisma } from "@/lib/prisma";
import { normalizeProviderItem, finalizeUpload } from "@/lib/normalize";
import { extractPdfText, chunkText } from "@/lib/pdf-extract";
import {
  extractChangesFromChunk,
  persistChunkResult,
  finalizeRegulatoryExtraction,
  setChunksTotal,
} from "@/lib/regulatory-extraction";
import { verifyOneItem, finalizeSisproVerification } from "@/lib/sispro";
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

// Text chunks processed per run (each costs ~2 steps: extract + persist).
// Chunks are re-derived from the source PDF each run (cheap, deterministic)
// rather than carried across runs, so there's no large intermediate state to
// pass through the continuation event.
const CHUNK_BATCH_SIZE = Number(process.env.REGULATORY_CHUNK_BATCH_SIZE) || 60;

/**
 * Durable extraction workflow for a regulatory update PDF: fetches the stored
 * PDF, splits it into text chunks, and asks the LLM to extract CUPS code
 * changes from each chunk, persisting results (and resolution metadata) as it
 * goes. Batches like `normalizeUploadFn` — a run processes up to
 * CHUNK_BATCH_SIZE chunks, then hands off to a fresh run so large PDFs don't
 * hit Inngest's 1000-step ceiling.
 */
export const extractRegulatoryUpdateFn = inngest.createFunction(
  {
    id: "extract-regulatory-update",
    concurrency: { key: "event.data.regulatoryUpdateId", limit: 1 },
    retries: 3,
    triggers: [
      { event: EVENTS.extractRegulatoryUpdate },
      { event: EVENTS.continueExtractRegulatoryUpdate },
    ],
    cancelOn: [
      { event: EVENTS.extractRegulatoryUpdate, match: "data.regulatoryUpdateId" },
    ],
    // Without this, a run that exhausts all retries (e.g. the PDF fetch or
    // an LLM call keeps timing out) leaves the row stuck in EXTRACTING
    // forever — nothing else ever flips its status.
    onFailure: async ({ event }) => {
      const { regulatoryUpdateId } = event.data.event.data as {
        regulatoryUpdateId: string;
      };
      await prisma.regulatoryUpdate.update({
        where: { id: regulatoryUpdateId },
        data: { status: "FAILED" },
      });
    },
  },
  async ({ event, step }) => {
    const { regulatoryUpdateId, startChunk = 0 } = event.data as {
      regulatoryUpdateId: string;
      startChunk?: number;
    };

    const chunks = await step.run("fetch-and-chunk", async () => {
      const update = await prisma.regulatoryUpdate.findUnique({
        where: { id: regulatoryUpdateId },
        select: { sourceBlobUrl: true },
      });
      if (!update?.sourceBlobUrl) throw new Error("Falta el PDF de origen.");
      const res = await fetch(update.sourceBlobUrl);
      if (!res.ok) throw new Error(`No se pudo descargar el PDF (${res.status}).`);
      const text = await extractPdfText(await res.arrayBuffer());
      return chunkText(text);
    });

    if (chunks.length === 0) {
      await step.run("mark-failed-empty", () =>
        prisma.regulatoryUpdate.update({
          where: { id: regulatoryUpdateId },
          data: { status: "FAILED" },
        }),
      );
      return { failed: true, reason: "empty-pdf" };
    }

    if (startChunk === 0) {
      await step.run("set-chunks-total", () =>
        setChunksTotal(regulatoryUpdateId, chunks.length),
      );
    }

    const endChunk = Math.min(startChunk + CHUNK_BATCH_SIZE, chunks.length);
    for (let i = startChunk; i < endChunk; i++) {
      const result = await step.run(`extract-chunk-${i}`, () =>
        extractChangesFromChunk(chunks[i], i),
      );
      await step.run(`persist-chunk-${i}`, () =>
        persistChunkResult(regulatoryUpdateId, result),
      );
    }

    if (endChunk < chunks.length) {
      await step.sendEvent("continue-extraction", {
        name: EVENTS.continueExtractRegulatoryUpdate,
        data: { regulatoryUpdateId, startChunk: endChunk },
      });
      return { continued: true, processed: endChunk };
    }

    await step.run("finalize", () => finalizeRegulatoryExtraction(regulatoryUpdateId));
    return { done: true, totalChunks: chunks.length };
  },
);

// SISPRO lookups per run, with a pause between each to be polite to a
// government server (see lib/sispro.ts for the postback-simulation caveats).
const SISPRO_BATCH_SIZE = Number(process.env.SISPRO_VERIFY_BATCH_SIZE) || 30;
const SISPRO_REQUEST_DELAY_MS = Number(process.env.SISPRO_REQUEST_DELAY_MS) || 400;

/**
 * Durable verification workflow: checks every active canonical item with a
 * normativeCode against the public SISPRO lookup, in small batches with a
 * pause between requests. Batches/continues like the jobs above; a single
 * item's lookup failing (network error, page format changed) doesn't abort
 * the run — it's recorded as an ERROR result and the batch continues.
 */
export const verifySisproFn = inngest.createFunction(
  {
    id: "verify-sispro",
    concurrency: { key: "event.data.verificationId", limit: 1 },
    retries: 2,
    triggers: [
      { event: EVENTS.verifySisproVerification },
      { event: EVENTS.continueSisproVerification },
    ],
    cancelOn: [
      { event: EVENTS.verifySisproVerification, match: "data.verificationId" },
    ],
    onFailure: async ({ event }) => {
      const { verificationId } = event.data.event.data as { verificationId: string };
      await prisma.sisproVerification.update({
        where: { id: verificationId },
        data: { status: "FAILED" },
      });
    },
  },
  async ({ event, step }) => {
    const { verificationId, startIndex = 0 } = event.data as {
      verificationId: string;
      startIndex?: number;
    };

    const items = await step.run("load-items", async () => {
      const verification = await prisma.sisproVerification.findUnique({
        where: { id: verificationId },
        select: { organizationId: true },
      });
      if (!verification) return [];
      return prisma.canonicalItem.findMany({
        where: {
          organizationId: verification.organizationId,
          isActive: true,
          normativeCode: { not: null },
        },
        select: { id: true, name: true, normativeCode: true },
        orderBy: { name: "asc" },
      });
    });

    if (items.length === 0) {
      await step.run("finalize-empty", () =>
        finalizeSisproVerification(verificationId, 0),
      );
      return { done: true, scanned: 0 };
    }

    const endIndex = Math.min(startIndex + SISPRO_BATCH_SIZE, items.length);
    for (let i = startIndex; i < endIndex; i++) {
      await step.run(`verify-${items[i].id}`, () =>
        verifyOneItem(verificationId, items[i]),
      );
      if (i < endIndex - 1) {
        await step.sleep(`pause-${items[i].id}`, SISPRO_REQUEST_DELAY_MS);
      }
    }

    if (endIndex < items.length) {
      await step.sendEvent("continue-verification", {
        name: EVENTS.continueSisproVerification,
        data: { verificationId, startIndex: endIndex },
      });
      return { continued: true, processed: endIndex };
    }

    await step.run("finalize", () =>
      finalizeSisproVerification(verificationId, items.length),
    );
    return { done: true, scanned: items.length };
  },
);
