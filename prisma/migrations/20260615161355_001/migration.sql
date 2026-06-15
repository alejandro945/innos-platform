-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "vector";

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'PROCUREMENT_ANALYST', 'REVIEWER', 'PROVIDER_MANAGER', 'VIEWER');

-- CreateEnum
CREATE TYPE "ProviderStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "ItemKind" AS ENUM ('SERVICE', 'MEDICATION', 'DEVICE', 'SUPPLY');

-- CreateEnum
CREATE TYPE "CodeSystem" AS ENUM ('CUPS', 'CUM', 'ATC', 'IUM', 'OTHER');

-- CreateEnum
CREATE TYPE "ProcessStatus" AS ENUM ('DRAFT', 'PROCESSING', 'IN_REVIEW', 'COMPLETED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "UploadStatus" AS ENUM ('UPLOADED', 'PARSING', 'MAPPING', 'NORMALIZING', 'READY', 'FAILED');

-- CreateEnum
CREATE TYPE "MappingMethod" AS ENUM ('RULE', 'VECTOR', 'AI', 'HUMAN');

-- CreateEnum
CREATE TYPE "MappingStatus" AS ENUM ('AUTO_APPROVED', 'PENDING_REVIEW', 'APPROVED', 'REJECTED', 'NO_MATCH');

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nit" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "entraOid" TEXT,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "image" TEXT,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserRole" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "Role" NOT NULL,

    CONSTRAINT "UserRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Provider" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nit" TEXT,
    "contactName" TEXT,
    "contactEmail" TEXT,
    "status" "ProviderStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Provider_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CanonicalItem" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "kind" "ItemKind" NOT NULL DEFAULT 'SERVICE',
    "canonicalCode" TEXT NOT NULL,
    "normativeCode" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "includesFees" BOOLEAN NOT NULL DEFAULT false,
    "includesSupplies" BOOLEAN NOT NULL DEFAULT false,
    "isApproved" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CanonicalItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CanonicalCode" (
    "id" TEXT NOT NULL,
    "canonicalItemId" TEXT NOT NULL,
    "system" "CodeSystem" NOT NULL,
    "code" TEXT NOT NULL,

    CONSTRAINT "CanonicalCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemEmbedding" (
    "canonicalItemId" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ItemEmbedding_pkey" PRIMARY KEY ("canonicalItemId")
);

-- CreateTable
CREATE TABLE "RateCard" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "canonicalItemId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "tariffSource" TEXT,
    "value" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'COP',
    "unit" TEXT,
    "exclusions" TEXT,
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validTo" TIMESTAMP(3),
    "sourceUploadId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RateCard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcurementProcess" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "ProcessStatus" NOT NULL DEFAULT 'DRAFT',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProcurementProcess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcessUpload" (
    "id" TEXT NOT NULL,
    "processId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "blobUrl" TEXT NOT NULL,
    "status" "UploadStatus" NOT NULL DEFAULT 'UPLOADED',
    "columnMapping" JSONB,
    "rowCount" INTEGER NOT NULL DEFAULT 0,
    "parsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProcessUpload_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderItem" (
    "id" TEXT NOT NULL,
    "uploadId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "rowNumber" INTEGER NOT NULL,
    "rawName" TEXT NOT NULL,
    "rawCode" TEXT,
    "rawUnit" TEXT,
    "rawPrice" DECIMAL(14,2),
    "currency" TEXT NOT NULL DEFAULT 'COP',
    "exclusions" TEXT,

    CONSTRAINT "ProviderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemMapping" (
    "id" TEXT NOT NULL,
    "providerItemId" TEXT NOT NULL,
    "canonicalItemId" TEXT,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "method" "MappingMethod" NOT NULL,
    "status" "MappingStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "rationale" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ItemMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Comparison" (
    "id" TEXT NOT NULL,
    "processId" TEXT NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "summary" JSONB,

    CONSTRAINT "Comparison_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComparisonLine" (
    "id" TEXT NOT NULL,
    "comparisonId" TEXT NOT NULL,
    "canonicalItemId" TEXT NOT NULL,
    "minValue" DECIMAL(14,2),
    "maxValue" DECIMAL(14,2),
    "avgValue" DECIMAL(14,2),
    "optionCount" INTEGER NOT NULL DEFAULT 0,
    "bestProviderId" TEXT,
    "options" JSONB NOT NULL,

    CONSTRAINT "ComparisonLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Organization_nit_key" ON "Organization"("nit");

-- CreateIndex
CREATE UNIQUE INDEX "User_entraOid_key" ON "User"("entraOid");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_organizationId_idx" ON "User"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "UserRole_userId_role_key" ON "UserRole"("userId", "role");

-- CreateIndex
CREATE INDEX "Provider_organizationId_idx" ON "Provider"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "Provider_organizationId_name_key" ON "Provider"("organizationId", "name");

-- CreateIndex
CREATE INDEX "CanonicalItem_organizationId_kind_idx" ON "CanonicalItem"("organizationId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "CanonicalItem_organizationId_canonicalCode_key" ON "CanonicalItem"("organizationId", "canonicalCode");

-- CreateIndex
CREATE INDEX "CanonicalCode_system_code_idx" ON "CanonicalCode"("system", "code");

-- CreateIndex
CREATE UNIQUE INDEX "CanonicalCode_canonicalItemId_system_code_key" ON "CanonicalCode"("canonicalItemId", "system", "code");

-- CreateIndex
CREATE INDEX "RateCard_organizationId_canonicalItemId_idx" ON "RateCard"("organizationId", "canonicalItemId");

-- CreateIndex
CREATE INDEX "RateCard_providerId_idx" ON "RateCard"("providerId");

-- CreateIndex
CREATE INDEX "RateCard_validFrom_validTo_idx" ON "RateCard"("validFrom", "validTo");

-- CreateIndex
CREATE INDEX "ProcurementProcess_organizationId_status_idx" ON "ProcurementProcess"("organizationId", "status");

-- CreateIndex
CREATE INDEX "ProcessUpload_processId_idx" ON "ProcessUpload"("processId");

-- CreateIndex
CREATE INDEX "ProviderItem_uploadId_idx" ON "ProviderItem"("uploadId");

-- CreateIndex
CREATE INDEX "ProviderItem_providerId_rawName_idx" ON "ProviderItem"("providerId", "rawName");

-- CreateIndex
CREATE UNIQUE INDEX "ItemMapping_providerItemId_key" ON "ItemMapping"("providerItemId");

-- CreateIndex
CREATE INDEX "ItemMapping_status_idx" ON "ItemMapping"("status");

-- CreateIndex
CREATE INDEX "ItemMapping_canonicalItemId_idx" ON "ItemMapping"("canonicalItemId");

-- CreateIndex
CREATE INDEX "Comparison_processId_idx" ON "Comparison"("processId");

-- CreateIndex
CREATE INDEX "ComparisonLine_comparisonId_idx" ON "ComparisonLine"("comparisonId");

-- CreateIndex
CREATE INDEX "AuditLog_organizationId_entityType_entityId_idx" ON "AuditLog"("organizationId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Provider" ADD CONSTRAINT "Provider_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CanonicalItem" ADD CONSTRAINT "CanonicalItem_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CanonicalCode" ADD CONSTRAINT "CanonicalCode_canonicalItemId_fkey" FOREIGN KEY ("canonicalItemId") REFERENCES "CanonicalItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemEmbedding" ADD CONSTRAINT "ItemEmbedding_canonicalItemId_fkey" FOREIGN KEY ("canonicalItemId") REFERENCES "CanonicalItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RateCard" ADD CONSTRAINT "RateCard_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RateCard" ADD CONSTRAINT "RateCard_canonicalItemId_fkey" FOREIGN KEY ("canonicalItemId") REFERENCES "CanonicalItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RateCard" ADD CONSTRAINT "RateCard_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RateCard" ADD CONSTRAINT "RateCard_sourceUploadId_fkey" FOREIGN KEY ("sourceUploadId") REFERENCES "ProcessUpload"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcurementProcess" ADD CONSTRAINT "ProcurementProcess_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcurementProcess" ADD CONSTRAINT "ProcurementProcess_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcessUpload" ADD CONSTRAINT "ProcessUpload_processId_fkey" FOREIGN KEY ("processId") REFERENCES "ProcurementProcess"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcessUpload" ADD CONSTRAINT "ProcessUpload_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcessUpload" ADD CONSTRAINT "ProcessUpload_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderItem" ADD CONSTRAINT "ProviderItem_uploadId_fkey" FOREIGN KEY ("uploadId") REFERENCES "ProcessUpload"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderItem" ADD CONSTRAINT "ProviderItem_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemMapping" ADD CONSTRAINT "ItemMapping_providerItemId_fkey" FOREIGN KEY ("providerItemId") REFERENCES "ProviderItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemMapping" ADD CONSTRAINT "ItemMapping_canonicalItemId_fkey" FOREIGN KEY ("canonicalItemId") REFERENCES "CanonicalItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemMapping" ADD CONSTRAINT "ItemMapping_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comparison" ADD CONSTRAINT "Comparison_processId_fkey" FOREIGN KEY ("processId") REFERENCES "ProcurementProcess"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComparisonLine" ADD CONSTRAINT "ComparisonLine_comparisonId_fkey" FOREIGN KEY ("comparisonId") REFERENCES "Comparison"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
