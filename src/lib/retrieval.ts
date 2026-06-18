import { prisma } from "@/lib/prisma";
import { getEmbedding, normalizeText } from "@/lib/embeddings";
import { searchSimilarItems } from "@/lib/vector";

export type Candidate = {
  id: string;
  canonicalCode: string;
  name: string;
  description: string | null;
  kind: string;
  score: number; // 0..1 (higher is closer)
};

/** Exact match by provider-supplied code (CUPS/CUM/own/normative). */
export async function findByCode(
  organizationId: string,
  rawCode: string | null,
): Promise<string | null> {
  if (!rawCode) return null;
  const code = rawCode.trim();
  if (!code) return null;

  const byCanonical = await prisma.canonicalItem.findFirst({
    where: {
      organizationId,
      OR: [{ canonicalCode: code }, { normativeCode: code }],
    },
    select: { id: true },
  });
  if (byCanonical) return byCanonical.id;

  const byCodeTable = await prisma.canonicalCode.findFirst({
    where: { code, canonicalItem: { organizationId } },
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

/** Token Jaccard similarity for the lexical fallback. */
function lexicalScore(a: string, b: string): number {
  const ta = new Set(normalizeText(a).split(" ").filter(Boolean));
  const tb = new Set(normalizeText(b).split(" ").filter(Boolean));
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return inter / (ta.size + tb.size - inter);
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
          canonicalCode: v.canonicalCode,
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
    where: { organizationId },
    select: {
      id: true,
      canonicalCode: true,
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
