/**
 * Sets up pgvector with the embedding dimension configured in EMBEDDING_DIMS.
 * Run once after `prisma migrate` (and re-run if you change the embedding model):
 *   pnpm db:vector
 *
 * Dimensions by common model:
 *   text-embedding-3-small (OpenAI) -> 1536
 *   nomic-embed-text (Ollama)       -> 768
 *   mxbai-embed-large (Ollama)      -> 1024
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const DIMS = Number(process.env.EMBEDDING_DIMS) || 1536;

async function main() {
  console.log(`Configurando pgvector con dimensión ${DIMS}...`);
  await prisma.$executeRawUnsafe(`CREATE EXTENSION IF NOT EXISTS vector;`);

  // Recreate the column if its dimension differs (drops existing vectors).
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "ItemEmbedding" DROP COLUMN IF EXISTS embedding;`,
  );
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "ItemEmbedding" ADD COLUMN embedding vector(${DIMS});`,
  );
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS item_embedding_cosine_idx
       ON "ItemEmbedding" USING hnsw (embedding vector_cosine_ops);`,
  );

  console.log("pgvector listo. Ejecute 'pnpm backfill:embeddings' para poblar.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
