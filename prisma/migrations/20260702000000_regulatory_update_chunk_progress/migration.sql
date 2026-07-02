-- Track per-chunk extraction progress so the UI can show real progress
-- ("X of Y fragments") instead of just the cumulative changes-found count,
-- which can legitimately stay at 0 for many chunks before the actual code
-- table shows up later in a long resolution.
ALTER TABLE "RegulatoryUpdate" ADD COLUMN IF NOT EXISTS "chunksTotal" INTEGER;
ALTER TABLE "RegulatoryUpdate" ADD COLUMN IF NOT EXISTS "chunksProcessed" INTEGER NOT NULL DEFAULT 0;
