-- Link RateCard directly to the ProcurementProcess it was promoted from, so
-- the origin survives even if the source upload is later deleted.
ALTER TABLE "RateCard" ADD COLUMN IF NOT EXISTS "sourceProcessId" TEXT;

-- Backfill: rates already promoted from an upload inherit that upload's process.
UPDATE "RateCard" r
SET "sourceProcessId" = u."processId"
FROM "ProcessUpload" u
WHERE r."sourceUploadId" = u."id"
  AND r."sourceProcessId" IS NULL;

CREATE INDEX IF NOT EXISTS "RateCard_sourceProcessId_idx" ON "RateCard"("sourceProcessId");

ALTER TABLE "RateCard"
  ADD CONSTRAINT "RateCard_sourceProcessId_fkey"
  FOREIGN KEY ("sourceProcessId") REFERENCES "ProcurementProcess"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
