-- CanonicalItem: soft-deactivation flag (retired by a regulatory update).
ALTER TABLE "CanonicalItem" ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true;

-- CreateEnum
CREATE TYPE "RegulatoryUpdateStatus" AS ENUM ('EXTRACTING', 'REVIEW', 'APPLIED', 'FAILED');

-- CreateEnum
CREATE TYPE "CupsChangeStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'APPLIED');

-- CreateEnum
CREATE TYPE "SisproVerificationStatus" AS ENUM ('RUNNING', 'DONE', 'FAILED');

-- CreateEnum
CREATE TYPE "SisproMatchStatus" AS ENUM ('MISMATCH', 'NOT_FOUND', 'ERROR');

-- CreateTable
CREATE TABLE "RegulatoryUpdate" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "resolutionNumber" TEXT,
    "resolutionDate" TIMESTAMP(3),
    "title" TEXT,
    "sourceFileName" TEXT NOT NULL,
    "sourceBlobUrl" TEXT,
    "status" "RegulatoryUpdateStatus" NOT NULL DEFAULT 'EXTRACTING',
    "extractedAt" TIMESTAMP(3),
    "appliedAt" TIMESTAMP(3),
    "appliedById" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RegulatoryUpdate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CupsCodeChange" (
    "id" TEXT NOT NULL,
    "regulatoryUpdateId" TEXT NOT NULL,
    "oldCode" TEXT NOT NULL,
    "newCode" TEXT,
    "oldDescription" TEXT,
    "newDescription" TEXT,
    "note" TEXT,
    "status" "CupsChangeStatus" NOT NULL DEFAULT 'PENDING',
    "matchedItemId" TEXT,
    "createdItemId" TEXT,

    CONSTRAINT "CupsCodeChange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SisproVerification" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "status" "SisproVerificationStatus" NOT NULL DEFAULT 'RUNNING',
    "runAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "runById" TEXT NOT NULL,
    "scannedCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "SisproVerification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SisproVerificationResult" (
    "id" TEXT NOT NULL,
    "verificationId" TEXT NOT NULL,
    "canonicalItemId" TEXT NOT NULL,
    "normativeCode" TEXT NOT NULL,
    "status" "SisproMatchStatus" NOT NULL,
    "sisproName" TEXT,
    "note" TEXT,

    CONSTRAINT "SisproVerificationResult_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RegulatoryUpdate_organizationId_status_idx" ON "RegulatoryUpdate"("organizationId", "status");

-- CreateIndex
CREATE INDEX "CupsCodeChange_regulatoryUpdateId_idx" ON "CupsCodeChange"("regulatoryUpdateId");

-- CreateIndex
CREATE INDEX "SisproVerification_organizationId_idx" ON "SisproVerification"("organizationId");

-- CreateIndex
CREATE INDEX "SisproVerificationResult_verificationId_idx" ON "SisproVerificationResult"("verificationId");

-- AddForeignKey
ALTER TABLE "RegulatoryUpdate" ADD CONSTRAINT "RegulatoryUpdate_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegulatoryUpdate" ADD CONSTRAINT "RegulatoryUpdate_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CupsCodeChange" ADD CONSTRAINT "CupsCodeChange_regulatoryUpdateId_fkey" FOREIGN KEY ("regulatoryUpdateId") REFERENCES "RegulatoryUpdate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CupsCodeChange" ADD CONSTRAINT "CupsCodeChange_matchedItemId_fkey" FOREIGN KEY ("matchedItemId") REFERENCES "CanonicalItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CupsCodeChange" ADD CONSTRAINT "CupsCodeChange_createdItemId_fkey" FOREIGN KEY ("createdItemId") REFERENCES "CanonicalItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SisproVerification" ADD CONSTRAINT "SisproVerification_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SisproVerification" ADD CONSTRAINT "SisproVerification_runById_fkey" FOREIGN KEY ("runById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SisproVerificationResult" ADD CONSTRAINT "SisproVerificationResult_verificationId_fkey" FOREIGN KEY ("verificationId") REFERENCES "SisproVerification"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SisproVerificationResult" ADD CONSTRAINT "SisproVerificationResult_canonicalItemId_fkey" FOREIGN KEY ("canonicalItemId") REFERENCES "CanonicalItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
