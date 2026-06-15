-- Add PAUSED to UploadStatus and the candidates column on ItemMapping.
-- Idempotent so it is safe on environments where it was already applied
-- manually (via `prisma db execute`).

ALTER TYPE "UploadStatus" ADD VALUE IF NOT EXISTS 'PAUSED';

ALTER TABLE "ItemMapping" ADD COLUMN IF NOT EXISTS "candidates" JSONB;
