import { prisma } from "@/lib/prisma";
import { lexicalScore } from "@/lib/text-similarity";

export type DuplicateItem = {
  id: string;
  canonicalCode: string;
  name: string;
  kind: string;
  rateCount: number;
};

export type CatalogDuplicatePair = {
  a: DuplicateItem;
  b: DuplicateItem;
  similarity: number; // 0..1, higher = more similar
  method: "vector" | "lexical";
};

// Advisory only — nothing here auto-merges. Thresholds just decide what's
// worth showing an admin for a manual decision, so they lean permissive.
const VECTOR_MIN_SCORE = 0.85; // 1 - cosine distance
const LEXICAL_MIN_SCORE = 0.6; // token Jaccard on the name
const LEXICAL_ITEM_CAP = 800; // guard the O(n^2) in-memory fallback
const MAX_PAIRS = 25;

function pairKey(a: string, b: string): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

type VectorPairRow = {
  id1: string;
  code1: string;
  name1: string;
  kind1: string;
  count1: bigint | number;
  id2: string;
  code2: string;
  name2: string;
  kind2: string;
  count2: bigint | number;
  distance: number;
};

/**
 * Self-join on embeddings to find semantically close canonical items — catches
 * true synonyms (different wording, same service) that lexical matching misses.
 * Bounded by the distance threshold + LIMIT, so it stays cheap even though the
 * join is conceptually O(n^2). Same organization + same kind only.
 */
async function findVectorDuplicatePairs(
  organizationId: string,
): Promise<CatalogDuplicatePair[]> {
  try {
    const rows = await prisma.$queryRaw<VectorPairRow[]>`
      SELECT
        ci1.id AS id1, ci1."canonicalCode" AS code1, ci1.name AS name1, ci1.kind::text AS kind1,
        (SELECT COUNT(*) FROM "RateCard" rc WHERE rc."canonicalItemId" = ci1.id) AS count1,
        ci2.id AS id2, ci2."canonicalCode" AS code2, ci2.name AS name2, ci2.kind::text AS kind2,
        (SELECT COUNT(*) FROM "RateCard" rc WHERE rc."canonicalItemId" = ci2.id) AS count2,
        (e1.embedding <=> e2.embedding) AS distance
      FROM "ItemEmbedding" e1
      JOIN "ItemEmbedding" e2 ON e1."canonicalItemId" < e2."canonicalItemId"
      JOIN "CanonicalItem" ci1 ON ci1.id = e1."canonicalItemId"
      JOIN "CanonicalItem" ci2 ON ci2.id = e2."canonicalItemId"
      WHERE ci1."organizationId" = ${organizationId}
        AND ci2."organizationId" = ${organizationId}
        AND ci1."isActive" = true
        AND ci2."isActive" = true
        AND ci1.kind = ci2.kind
        AND (e1.embedding <=> e2.embedding) <= ${1 - VECTOR_MIN_SCORE}
      ORDER BY distance ASC
      LIMIT ${MAX_PAIRS}
    `;
    return rows.map((r) => ({
      a: {
        id: r.id1,
        canonicalCode: r.code1,
        name: r.name1,
        kind: r.kind1,
        rateCount: Number(r.count1),
      },
      b: {
        id: r.id2,
        canonicalCode: r.code2,
        name: r.name2,
        kind: r.kind2,
        rateCount: Number(r.count2),
      },
      similarity: Math.max(0, 1 - r.distance),
      method: "vector" as const,
    }));
  } catch (err) {
    // pgvector not installed / no embeddings yet — caller falls back to lexical.
    console.warn("Catalog vector dedupe unavailable:", (err as Error).message);
    return [];
  }
}

/** In-memory token-overlap fallback for items without an embedding. */
async function findLexicalDuplicatePairs(
  organizationId: string,
): Promise<CatalogDuplicatePair[]> {
  const items = await prisma.canonicalItem.findMany({
    where: { organizationId, isActive: true },
    select: {
      id: true,
      canonicalCode: true,
      name: true,
      kind: true,
      _count: { select: { rateCards: true } },
    },
    take: LEXICAL_ITEM_CAP,
  });

  const pairs: CatalogDuplicatePair[] = [];
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const a = items[i];
      const b = items[j];
      if (a.kind !== b.kind) continue;
      const score = lexicalScore(a.name, b.name);
      if (score >= LEXICAL_MIN_SCORE) {
        pairs.push({
          a: {
            id: a.id,
            canonicalCode: a.canonicalCode,
            name: a.name,
            kind: a.kind,
            rateCount: a._count.rateCards,
          },
          b: {
            id: b.id,
            canonicalCode: b.canonicalCode,
            name: b.name,
            kind: b.kind,
            rateCount: b._count.rateCards,
          },
          similarity: score,
          method: "lexical",
        });
      }
    }
  }
  return pairs.sort((x, y) => y.similarity - x.similarity).slice(0, MAX_PAIRS);
}

/**
 * Find pairs of canonical items that look like duplicates (same or near-identical
 * service/medication filed as two catalog entries) — candidates for a manual
 * merge. Combines semantic (vector) similarity with a lexical fallback for items
 * without an embedding yet, so gaps in AI coverage don't hide obvious duplicates.
 * Never merges anything itself; results are always confirmed by an admin.
 */
export async function findCatalogDuplicates(organizationId: string): Promise<{
  pairs: CatalogDuplicatePair[];
  scannedItems: number;
  lexicalScanSkipped: boolean;
}> {
  const scannedItems = await prisma.canonicalItem.count({
    where: { organizationId, isActive: true },
  });

  const vectorPairs = await findVectorDuplicatePairs(organizationId);
  const seen = new Set(vectorPairs.map((p) => pairKey(p.a.id, p.b.id)));

  const lexicalScanSkipped = scannedItems > LEXICAL_ITEM_CAP;
  const lexicalPairs = lexicalScanSkipped
    ? []
    : (await findLexicalDuplicatePairs(organizationId)).filter(
        (p) => !seen.has(pairKey(p.a.id, p.b.id)),
      );

  const pairs = [...vectorPairs, ...lexicalPairs]
    .sort((x, y) => y.similarity - x.similarity)
    .slice(0, MAX_PAIRS);

  return { pairs, scannedItems, lexicalScanSkipped };
}
