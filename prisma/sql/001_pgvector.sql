-- Enables pgvector and adds the embedding column to ItemEmbedding.
-- PREFERRED: use `pnpm db:vector`, which reads EMBEDDING_DIMS and matches your
-- embedding model (e.g. 768 for Ollama nomic-embed-text). This file assumes 1536
-- (OpenAI text-embedding-3-small) and is kept for reference only.
--   psql "$DIRECT_URL" -f prisma/sql/001_pgvector.sql

CREATE EXTENSION IF NOT EXISTS vector;

-- Embedding column on the Prisma-managed table (1536 dims = text-embedding-3-small).
ALTER TABLE "ItemEmbedding"
  ADD COLUMN IF NOT EXISTS embedding vector(1536);

-- Approximate nearest-neighbour index (cosine distance).
CREATE INDEX IF NOT EXISTS item_embedding_cosine_idx
  ON "ItemEmbedding"
  USING hnsw (embedding vector_cosine_ops);
