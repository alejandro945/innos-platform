-- Enables pgvector and adds the embedding column to ItemEmbedding.
-- Run once against the database (or include in a Prisma migration):
--   psql "$DIRECT_URL" -f prisma/sql/001_pgvector.sql

CREATE EXTENSION IF NOT EXISTS vector;

-- Embedding column on the Prisma-managed table (1536 dims = text-embedding-3-small).
ALTER TABLE "ItemEmbedding"
  ADD COLUMN IF NOT EXISTS embedding vector(1536);

-- Approximate nearest-neighbour index (cosine distance).
CREATE INDEX IF NOT EXISTS item_embedding_cosine_idx
  ON "ItemEmbedding"
  USING hnsw (embedding vector_cosine_ops);
