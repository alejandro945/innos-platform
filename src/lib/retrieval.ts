import { prisma } from "@/lib/prisma";
import { getEmbedding } from "@/lib/embeddings";
import { searchSimilarItems } from "@/lib/vector";
import { lexicalScore } from "@/lib/text-similarity";

export type Candidate = {
  id: string;
  name: string;
  description: string | null;
  kind: string;
  score: number; // 0..1 (higher is closer)
};

/**
 * Exact match by provider-supplied code. Only compared against the official
 * normative code (CUPS/CUM/ATC) — a provider's own code (rawCode) is specific
 * to that provider's file and must never be matched across providers.
 */
export async function findByCode(
  organizationId: string,
  rawCode: string | null,
): Promise<string | null> {
  if (!rawCode) return null;
  const code = rawCode.trim();
  if (!code) return null;

  const byCanonical = await prisma.canonicalItem.findFirst({
    where: { organizationId, isActive: true, normativeCode: code },
    select: { id: true },
  });
  if (byCanonical) return byCanonical.id;

  const byCodeTable = await prisma.canonicalCode.findFirst({
    where: { code, canonicalItem: { organizationId, isActive: true } },
    select: { canonicalItemId: true },
  });
  return byCodeTable?.canonicalItemId ?? null;
}

/** Reuse a previously approved homologation for the same provider + raw name. */
export async function findPriorMapping(
  providerId: string,
  rawName: string,
): Promise<string | null> {
  const prior = await prisma.itemMapping.findFirst({
    where: {
      canonicalItemId: { not: null },
      canonicalItem: { isActive: true },
      status: { in: ["APPROVED", "AUTO_APPROVED"] },
      providerItem: {
        providerId,
        rawName: { equals: rawName, mode: "insensitive" },
      },
    },
    orderBy: { updatedAt: "desc" },
    select: { canonicalItemId: true },
  });
  return prior?.canonicalItemId ?? null;
}

export type RetrievalMethod = "vector" | "lexical" | "none";
export type RetrievalResult = {
  method: RetrievalMethod;
  candidates: Candidate[];
};

/**
 * Retrieve top-K canonical candidates for a provider item.
 * Prefers vector (semantic) search; falls back to in-memory lexical scoring.
 * Returns the method so callers can trust a vector score more than a lexical one.
 */
export async function retrieveCandidates(
  organizationId: string,
  text: string,
  limit = 8,
): Promise<RetrievalResult> {
  const embedding = await getEmbedding(text);
  if (embedding) {
    const vec = await searchSimilarItems(organizationId, embedding, limit);
    if (vec.length > 0) {
      return {
        method: "vector",
        candidates: vec.map((v) => ({
          id: v.id,
          name: v.name,
          description: v.description,
          kind: v.kind,
          score: Math.max(0, 1 - v.distance),
        })),
      };
    }
  }

  // Lexical fallback.
  const items = await prisma.canonicalItem.findMany({
    where: { organizationId, isActive: true },
    select: {
      id: true,
      name: true,
      description: true,
      kind: true,
    },
  });

  const candidates = items
    .map((it) => ({
      ...it,
      kind: String(it.kind),
      score: lexicalScore(text, `${it.name} ${it.description ?? ""}`),
    }))
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return { method: candidates.length ? "lexical" : "none", candidates };
}
