-- Audit trail of the resolution-PDF analysis, one row per text fragment, so
-- an extraction that finds zero CUPS changes still leaves evidence of what
-- was read and why each fragment yielded nothing.
CREATE TABLE IF NOT EXISTS "RegulatoryChunkLog" (
    "id" TEXT NOT NULL,
    "regulatoryUpdateId" TEXT NOT NULL,
    "chunkIndex" INTEGER NOT NULL,
    "outcome" TEXT NOT NULL,
    "codeCandidates" INTEGER NOT NULL DEFAULT 0,
    "changesFound" INTEGER NOT NULL DEFAULT 0,
    "excerpt" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RegulatoryChunkLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "RegulatoryChunkLog_regulatoryUpdateId_chunkIndex_key"
    ON "RegulatoryChunkLog"("regulatoryUpdateId", "chunkIndex");

ALTER TABLE "RegulatoryChunkLog"
    ADD CONSTRAINT "RegulatoryChunkLog_regulatoryUpdateId_fkey"
    FOREIGN KEY ("regulatoryUpdateId") REFERENCES "RegulatoryUpdate"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
