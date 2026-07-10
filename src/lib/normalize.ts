import type { MappingMethod, MappingStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isLlmEnabled } from "@/lib/llm";
import {
  findByCode,
  findPriorMapping,
  retrieveCandidates,
} from "@/lib/retrieval";
import { decideHomologation } from "@/lib/homologation";

export const CONFIDENCE_THRESHOLDS = {
  autoApprove: 0.9,
  review: 0.6,
} as const;

// Above this retrieval score, accept the top candidate without calling the LLM
// (the slow part). Lower = faster but less precise. Tunable via env.
const AUTO_ACCEPT_SCORE = Number(process.env.AUTO_ACCEPT_SCORE) || 0.92;
// How many candidates to retrieve / send to the LLM (smaller prompt = faster).
const CANDIDATE_LIMIT = Number(process.env.CANDIDATE_LIMIT) || 5;

export type NormalizeSummary = {
  total: number;
  autoApproved: number;
  pendingReview: number;
  noMatch: number;
};

function statusForConfidence(
  canonicalItemId: string | null,
  confidence: number,
): MappingStatus {
  if (!canonicalItemId) return "NO_MATCH";
  if (confidence >= CONFIDENCE_THRESHOLDS.autoApprove) return "AUTO_APPROVED";
  return "PENDING_REVIEW";
}

async function persistMapping(
  providerItemId: string,
  data: {
    canonicalItemId: string | null;
    confidence: number;
    method: MappingMethod;
    status: MappingStatus;
    rationale: string;
    candidates?: Prisma.InputJsonValue;
  },
) {
  await prisma.itemMapping.upsert({
    where: { providerItemId },
    update: {
      canonicalItemId: data.canonicalItemId,
      confidence: data.confidence,
      method: data.method,
      status: data.status,
      rationale: data.rationale,
      candidates: data.candidates,
      reviewedById: null,
      reviewedAt: null,
    },
    create: { providerItemId, ...data },
  });
}

/** Run the full homologation pipeline for one provider item. */
export async function normalizeProviderItem(providerItemId: string) {
  const item = await prisma.providerItem.findUnique({
    where: { id: providerItemId },
    include: { provider: true },
  });
  if (!item) return;
  const organizationId = item.provider.organizationId;

  // 0. The institution's own CUPS ("CUPS PROPIO") is the strongest signal:
  // it points straight at the canonical catalog.
  const byOwnCode = await findByCode(organizationId, item.rawOwnCode);
  if (byOwnCode) {
    return persistMapping(providerItemId, {
      canonicalItemId: byOwnCode,
      confidence: 1,
      method: "RULE",
      status: "AUTO_APPROVED",
      rationale: `Coincidencia exacta por CUPS propio "${item.rawOwnCode}".`,
    });
  }

  // 1. Exact code match (rule).
  const byCode = await findByCode(organizationId, item.rawCode);
  if (byCode) {
    return persistMapping(providerItemId, {
      canonicalItemId: byCode,
      confidence: 1,
      method: "RULE",
      status: "AUTO_APPROVED",
      rationale: `Coincidencia exacta por código "${item.rawCode}".`,
    });
  }

  // 2. Reuse a prior approved mapping (rule / learning).
  const prior = await findPriorMapping(item.providerId, item.rawName);
  if (prior) {
    return persistMapping(providerItemId, {
      canonicalItemId: prior,
      confidence: 0.99,
      method: "RULE",
      status: "AUTO_APPROVED",
      rationale: "Homologación previa aprobada para este proveedor (reutilizada).",
    });
  }

  // 3. Retrieve candidates.
  const { method: retrievalMethod, candidates } = await retrieveCandidates(
    organizationId,
    `${item.rawName} ${item.rawUnit ?? ""}`.trim(),
    CANDIDATE_LIMIT,
  );

  const candidateSnapshot = candidates.slice(0, 5).map((c) => ({
    id: c.id,
    name: c.name,
    score: Math.round(c.score * 100) / 100,
  }));

  // 3a. Short-circuit a near-perfect candidate WITHOUT the LLM (the slow part).
  // Only AUTO-APPROVE when the score is semantic (vector). A high *lexical*
  // score can be a false friend (same words, different service), so we skip the
  // LLM but still send it to human review instead of auto-approving.
  const top = candidates[0];
  if (top && top.score >= AUTO_ACCEPT_SCORE) {
    const trustworthy = retrievalMethod === "vector";
    return persistMapping(providerItemId, {
      canonicalItemId: top.id,
      confidence: top.score,
      method: "VECTOR",
      status: trustworthy ? "AUTO_APPROVED" : "PENDING_REVIEW",
      rationale: trustworthy
        ? `Coincidencia semántica muy alta (${Math.round(top.score * 100)}%).`
        : `Coincidencia textual alta (${Math.round(top.score * 100)}%) — requiere revisión.`,
      candidates: candidateSnapshot,
    });
  }

  // 3b. No candidates at all -> no point asking the LLM.
  if (candidates.length === 0) {
    return persistMapping(providerItemId, {
      canonicalItemId: null,
      confidence: 0,
      method: isLlmEnabled() ? "AI" : "VECTOR",
      status: "NO_MATCH",
      rationale: "Sin candidatos en el catálogo.",
      candidates: [],
    });
  }

  // 3c. Ambiguous -> let the LLM decide among the candidates.
  const decision = await decideHomologation(
    { rawName: item.rawName, rawCode: item.rawCode, rawUnit: item.rawUnit },
    candidates,
  );

  return persistMapping(providerItemId, {
    canonicalItemId: decision.canonicalItemId,
    confidence: decision.confidence,
    method: isLlmEnabled() ? "AI" : "VECTOR",
    status: statusForConfidence(decision.canonicalItemId, decision.confidence),
    rationale: decision.rationale,
    candidates: candidateSnapshot,
  });
}

/** Update process status + compute the summary (no re-normalization). */
export async function finalizeUpload(
  uploadId: string,
): Promise<NormalizeSummary> {
  const upload = await prisma.processUpload.findUnique({
    where: { id: uploadId },
    select: { processId: true },
  });
  if (upload) {
    await Promise.all([
      prisma.processUpload.update({
        where: { id: uploadId },
        data: { status: "READY" },
      }),
      prisma.procurementProcess.update({
        where: { id: upload.processId },
        data: { status: "IN_REVIEW" },
      }),
    ]);
  }

  const total = await prisma.providerItem.count({ where: { uploadId } });
  const [autoApproved, pendingReview, noMatch] = await Promise.all([
    prisma.itemMapping.count({
      where: { providerItem: { uploadId }, status: "AUTO_APPROVED" },
    }),
    prisma.itemMapping.count({
      where: { providerItem: { uploadId }, status: "PENDING_REVIEW" },
    }),
    prisma.itemMapping.count({
      where: { providerItem: { uploadId }, status: "NO_MATCH" },
    }),
  ]);

  return { total, autoApproved, pendingReview, noMatch };
}

/**
 * Normalize the pending items of an upload (those without a mapping yet) and
 * finalize. Resumable: re-running only processes what's left. Stops early if
 * the upload is paused, leaving progress intact.
 */
export async function normalizeUpload(
  uploadId: string,
): Promise<NormalizeSummary | null> {
  const items = await prisma.providerItem.findMany({
    where: { uploadId, mapping: { is: null } },
    select: { id: true },
  });

  for (const it of items) {
    // Checkpoint: stop if paused from another request.
    const u = await prisma.processUpload.findUnique({
      where: { id: uploadId },
      select: { status: true },
    });
    if (u?.status === "PAUSED") return null;

    try {
      await normalizeProviderItem(it.id);
    } catch (e) {
      // A single failed item (e.g. provider timeout) shouldn't kill the run.
      console.error(`normalizeProviderItem ${it.id} failed:`, e);
    }
  }

  return finalizeUpload(uploadId);
}
