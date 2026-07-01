import { prisma } from "@/lib/prisma";

/** Serialize a JS number[] to a pgvector literal: "[1,2,3]". */
function toVectorLiteral(vector: number[]): string {
  return `[${vector.join(",")}]`;
}

/** Upsert an item's embedding (raw SQL — Prisma has no native vector type). */
export async function upsertItemEmbedding(
  canonicalItemId: string,
  vector: number[],
): Promise<void> {
  const literal = toVectorLiteral(vector);
  await prisma.$executeRaw`
    INSERT INTO "ItemEmbedding" ("canonicalItemId", embedding, "updatedAt")
    VALUES (${canonicalItemId}, ${literal}::vector, NOW())
    ON CONFLICT ("canonicalItemId")
    DO UPDATE SET embedding = ${literal}::vector, "updatedAt" = NOW()
  `;
}

export type VectorCandidate = {
  id: string;
  canonicalCode: string;
  name: string;
  description: string | null;
  kind: string;
  distance: number;
};

/**
 * Vector similarity search over canonical items (cosine distance).
 * Returns the nearest items within the organization. Empty if no embeddings.
 */
export async function searchSimilarItems(
  organizationId: string,
  vector: number[],
  limit = 8,
): Promise<VectorCandidate[]> {
  const literal = toVectorLiteral(vector);
  try {
    return await prisma.$queryRaw<VectorCandidate[]>`
      SELECT ci.id,
             ci."canonicalCode",
             ci.name,
             ci.description,
             ci.kind::text AS kind,
             (e.embedding <=> ${literal}::vector) AS distance
      FROM "ItemEmbedding" e
      JOIN "CanonicalItem" ci ON ci.id = e."canonicalItemId"
      WHERE ci."organizationId" = ${organizationId}
        AND ci."isActive" = true
        AND e.embedding IS NOT NULL
      ORDER BY e.embedding <=> ${literal}::vector
      LIMIT ${limit}
    `;
  } catch (err) {
    // pgvector not installed / column missing — caller falls back to lexical.
    console.warn("Vector search unavailable:", (err as Error).message);
    return [];
  }
}
