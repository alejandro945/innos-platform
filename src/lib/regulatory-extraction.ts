import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { structuredGenerate, isLlmEnabled } from "@/lib/llm";
import { prisma } from "@/lib/prisma";
import { extractPdfText, chunkText } from "@/lib/pdf-extract";

const changeSchema = z.object({
  oldCode: z.string().trim().min(1),
  newCode: z.string().trim().nullable().optional(),
  oldDescription: z.string().trim().nullable().optional(),
  newDescription: z.string().trim().nullable().optional(),
  note: z.string().trim().nullable().optional(),
});
export type ExtractedCupsChange = z.infer<typeof changeSchema>;

const chunkResultSchema = z.object({
  resolutionNumber: z.string().trim().nullable().optional(),
  resolutionDate: z.string().trim().nullable().optional(),
  title: z.string().trim().nullable().optional(),
  changes: z.array(changeSchema).default([]),
});
export type ChunkResult = z.infer<typeof chunkResultSchema>;

/** Why a fragment did (or didn't) yield changes — persisted as audit trail. */
export type ChunkOutcome =
  | "CHANGES_FOUND"
  | "NO_CHANGES"
  | "SKIPPED_UNLIKELY"
  | "LLM_ERROR"
  | "LLM_UNAVAILABLE";

export const CHUNK_OUTCOME_LABELS: Record<ChunkOutcome, string> = {
  CHANGES_FOUND: "Cambios encontrados",
  NO_CHANGES: "Analizado con IA — sin cambios",
  SKIPPED_UNLIKELY: "Omitido — no contiene códigos",
  LLM_ERROR: "Error de la IA en este fragmento",
  LLM_UNAVAILABLE: "IA no configurada",
};

/** ChunkResult plus the trace of how it was produced. */
export type ChunkExtraction = ChunkResult & {
  chunkIndex: number;
  outcome: ChunkOutcome;
  codeCandidates: number;
  excerpt: string;
};

const EXCERPT_LENGTH = 280;

function chunkExcerpt(chunk: string): string {
  return chunk.replace(/\s+/g, " ").trim().slice(0, EXCERPT_LENGTH);
}

function countCodeCandidates(chunk: string): number {
  const compact = chunk.replace(/\s+/g, "");
  return compact.match(/\d{6}/g)?.length ?? 0;
}

function emptyExtraction(
  chunk: string,
  chunkIndex: number,
  outcome: ChunkOutcome,
): ChunkExtraction {
  return {
    resolutionNumber: null,
    resolutionDate: null,
    title: null,
    changes: [],
    chunkIndex,
    outcome,
    codeCandidates: countCodeCandidates(chunk),
    excerpt: chunkExcerpt(chunk),
  };
}

// A resolution PDF is mostly legal boilerplate (considerandos, citations,
// signatures) — only a small fraction of chunks actually contain a code
// table. Calling the LLM on every chunk anyway is what turns a normal-sized
// resolution into an hours-long run (each call costs real time, especially
// on a resource-constrained self-hosted model) for zero benefit on chunks
// that can't possibly contain a code change. Skip the LLM call entirely for
// chunks that don't even look like they contain codes — cheap and, unlike
// the LLM call, effectively instant. Deliberately permissive (better to send
// a few boilerplate chunks to the LLM than to miss a real change).
const CUPS_CODE_KEYWORD =
  /(c[oó]digo|cups|sustit[uú]yase|modif[ií]quese|derog|elimina|adici[oó]nese|reempla)/i;

function looksLikelyToContainCodes(chunk: string): boolean {
  // Strip whitespace before matching: PDF table extraction often splits a
  // single code across artificial spaces/line breaks (column layout).
  const codeCount = countCodeCandidates(chunk);
  if (codeCount >= 3) return true; // looks like a code table
  return codeCount >= 1 && CUPS_CODE_KEYWORD.test(chunk);
}

/**
 * Ask the LLM to extract CUPS code changes from one chunk of resolution text.
 * A resolution is split into chunks (lib/pdf-extract.ts) before this is
 * called; each chunk is independent, so this is safe to run as one Inngest
 * step per chunk. `chunkIndex === 0` always goes to the LLM regardless of the
 * code-likelihood heuristic, since the resolution's number/date/title
 * typically appear in the opening paragraph, which rarely contains codes.
 */
export async function extractChangesFromChunk(
  chunk: string,
  chunkIndex: number,
): Promise<ChunkExtraction> {
  if (!isLlmEnabled()) return emptyExtraction(chunk, chunkIndex, "LLM_UNAVAILABLE");
  if (chunkIndex !== 0 && !looksLikelyToContainCodes(chunk)) {
    return emptyExtraction(chunk, chunkIndex, "SKIPPED_UNLIKELY");
  }

  const raw = await structuredGenerate({
    tier: "reasoning",
    maxTokens: 2048,
    toolName: "report_cups_changes",
    toolDescription:
      "Reporta los cambios de códigos CUPS normativos mencionados en este fragmento de una resolución del Ministerio de Salud de Colombia.",
    jsonSchema: {
      type: "object",
      properties: {
        resolutionNumber: {
          type: ["string", "null"],
          description:
            "Número de la resolución (ej. '1234 de 2026'), solo si aparece en este fragmento.",
        },
        resolutionDate: {
          type: ["string", "null"],
          description: "Fecha de la resolución en formato AAAA-MM-DD si aparece.",
        },
        title: {
          type: ["string", "null"],
          description: "Título u objeto de la resolución si aparece.",
        },
        changes: {
          type: "array",
          items: {
            type: "object",
            properties: {
              oldCode: {
                type: "string",
                description: "Código CUPS normativo que se retira.",
              },
              newCode: {
                type: ["string", "null"],
                description:
                  "Código CUPS normativo que lo reemplaza, o null si se elimina sin reemplazo.",
              },
              oldDescription: { type: ["string", "null"] },
              newDescription: { type: ["string", "null"] },
              note: {
                type: ["string", "null"],
                description: "Aclaración breve del cambio, si la hay.",
              },
            },
            required: ["oldCode"],
          },
        },
      },
      required: ["changes"],
    },
    prompt: `Eres un asistente experto en normatividad de salud de Colombia (Ministerio de Salud, SISPRO, códigos CUPS).
Este es un fragmento (parte ${chunkIndex + 1}) del texto de una resolución que actualiza códigos CUPS normativos.

Extrae ÚNICAMENTE los cambios de código EXPLÍCITAMENTE mencionados en este fragmento: qué código CUPS viejo se
retira y por cuál código nuevo se reemplaza. Si un código se elimina SIN reemplazo, usa newCode = null.
No inventes cambios que no estén en el texto. Si este fragmento no contiene ningún cambio de código, responde
con changes: [].

Texto del fragmento:
"""
${chunk}
"""

Responde únicamente con el objeto solicitado.`,
  });

  if (!raw) return emptyExtraction(chunk, chunkIndex, "LLM_ERROR");
  const parsed = chunkResultSchema.safeParse(raw);
  if (!parsed.success) return emptyExtraction(chunk, chunkIndex, "LLM_ERROR");
  return {
    ...parsed.data,
    chunkIndex,
    outcome: parsed.data.changes.length > 0 ? "CHANGES_FOUND" : "NO_CHANGES",
    codeCandidates: countCodeCandidates(chunk),
    excerpt: chunkExcerpt(chunk),
  };
}

/**
 * Record the total chunk count once known, so the UI can show real progress
 * ("X of Y fragments") instead of just the cumulative changes-found count —
 * which can legitimately stay at 0 for many chunks in a long resolution
 * before the actual code table shows up later in the document.
 */
export async function setChunksTotal(
  regulatoryUpdateId: string,
  chunksTotal: number,
): Promise<void> {
  await prisma.regulatoryUpdate.update({
    where: { id: regulatoryUpdateId },
    data: { chunksTotal },
  });
}

/**
 * Persist one chunk's extraction result: captures resolution metadata the
 * first time it's found (any chunk may contain it, usually the first), and
 * inserts new `CupsCodeChange` rows — deduped by oldCode against what's
 * already recorded for this resolution (chunks overlap on purpose) — each
 * matched against the org's active catalog by normativeCode. Always bumps
 * `chunksProcessed`, whether or not this chunk contained any changes.
 */
export async function persistChunkResult(
  regulatoryUpdateId: string,
  result: ChunkExtraction,
): Promise<void> {
  await prisma.regulatoryUpdate.update({
    where: { id: regulatoryUpdateId },
    data: { chunksProcessed: { increment: 1 } },
  });

  // Audit trail: what this fragment contained and what the analysis did with
  // it — evidence of the reading even when the whole run yields no changes.
  // Upsert so an Inngest retry (or a re-run of the extraction) overwrites
  // instead of failing on the unique constraint.
  if (result.outcome !== undefined) {
    await prisma.regulatoryChunkLog.upsert({
      where: {
        regulatoryUpdateId_chunkIndex: {
          regulatoryUpdateId,
          chunkIndex: result.chunkIndex,
        },
      },
      update: {
        outcome: result.outcome,
        codeCandidates: result.codeCandidates,
        changesFound: result.changes.length,
        excerpt: result.excerpt || null,
      },
      create: {
        regulatoryUpdateId,
        chunkIndex: result.chunkIndex,
        outcome: result.outcome,
        codeCandidates: result.codeCandidates,
        changesFound: result.changes.length,
        excerpt: result.excerpt || null,
      },
    });
  }

  const update = await prisma.regulatoryUpdate.findUnique({
    where: { id: regulatoryUpdateId },
    select: {
      organizationId: true,
      resolutionNumber: true,
      resolutionDate: true,
      title: true,
    },
  });
  if (!update) return;

  const metaPatch: Prisma.RegulatoryUpdateUpdateInput = {};
  if (!update.resolutionNumber && result.resolutionNumber) {
    metaPatch.resolutionNumber = result.resolutionNumber;
  }
  if (!update.resolutionDate && result.resolutionDate) {
    const d = new Date(result.resolutionDate);
    if (!Number.isNaN(d.getTime())) metaPatch.resolutionDate = d;
  }
  if (!update.title && result.title) metaPatch.title = result.title;
  if (Object.keys(metaPatch).length > 0) {
    await prisma.regulatoryUpdate.update({
      where: { id: regulatoryUpdateId },
      data: metaPatch,
    });
  }

  if (result.changes.length === 0) return;

  const oldCodes = result.changes.map((c) => c.oldCode);
  const existing = await prisma.cupsCodeChange.findMany({
    where: { regulatoryUpdateId, oldCode: { in: oldCodes } },
    select: { oldCode: true },
  });
  const existingCodes = new Set(existing.map((e) => e.oldCode));
  const newChanges = result.changes.filter((c) => !existingCodes.has(c.oldCode));
  if (newChanges.length === 0) return;

  const matches = await prisma.canonicalItem.findMany({
    where: {
      organizationId: update.organizationId,
      isActive: true,
      normativeCode: { in: newChanges.map((c) => c.oldCode) },
    },
    select: { id: true, normativeCode: true },
  });
  const byCode = new Map(matches.map((m) => [m.normativeCode as string, m.id]));

  await prisma.cupsCodeChange.createMany({
    data: newChanges.map((c) => ({
      regulatoryUpdateId,
      oldCode: c.oldCode,
      newCode: c.newCode || null,
      oldDescription: c.oldDescription || null,
      newDescription: c.newDescription || null,
      note: c.note || null,
      matchedItemId: byCode.get(c.oldCode) ?? null,
    })),
  });
}

/** Mark extraction complete so the review UI takes over. */
export async function finalizeRegulatoryExtraction(
  regulatoryUpdateId: string,
): Promise<void> {
  await prisma.regulatoryUpdate.update({
    where: { id: regulatoryUpdateId },
    data: { status: "REVIEW", extractedAt: new Date() },
  });
}

/**
 * Non-durable fallback for local dev without Inngest configured: run the
 * whole extraction inline, start to finish (mirrors normalizeUpload() in
 * lib/normalize.ts, the same fallback used for homologation).
 */
export async function extractRegulatoryUpdateInline(
  regulatoryUpdateId: string,
): Promise<void> {
  const update = await prisma.regulatoryUpdate.findUnique({
    where: { id: regulatoryUpdateId },
    select: { sourceBlobUrl: true },
  });
  if (!update?.sourceBlobUrl) throw new Error("Falta el PDF de origen.");

  const res = await fetch(update.sourceBlobUrl);
  if (!res.ok) throw new Error(`No se pudo descargar el PDF (${res.status}).`);
  const text = await extractPdfText(await res.arrayBuffer());
  const chunks = chunkText(text);

  if (chunks.length === 0) {
    await prisma.regulatoryUpdate.update({
      where: { id: regulatoryUpdateId },
      data: { status: "FAILED" },
    });
    return;
  }

  await setChunksTotal(regulatoryUpdateId, chunks.length);

  for (let i = 0; i < chunks.length; i++) {
    const result = await extractChangesFromChunk(chunks[i], i);
    await persistChunkResult(regulatoryUpdateId, result);
  }

  await finalizeRegulatoryExtraction(regulatoryUpdateId);
}
