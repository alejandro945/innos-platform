-- "CUPS propio" moves from the shared canonical catalog (CanonicalItem) to
-- each provider's own tariff line (RateCard.providerCode) -- it was never a
-- shared/platform-wide code, only ever the provider's own internal reference.
ALTER TABLE "RateCard" ADD COLUMN "providerCode" TEXT;
ALTER TABLE "RateCard" ADD COLUMN "extra" JSONB;
ALTER TABLE "ProviderItem" ADD COLUMN "extra" JSONB;

-- Full reset of catalog/tariffs/process pipeline + regulatory-update history:
-- the shape of the data is changing (canonicalCode goes away, providerCode/
-- extra are new), so everything downstream of an upload needs to be
-- re-created from a fresh re-upload of the provider files. Organization,
-- User and Provider (master data, not re-uploaded) are left untouched.
-- Order matters for FKs: RateCard.canonicalItemId is ON DELETE RESTRICT, so
-- RateCard must be emptied before CanonicalItem.
TRUNCATE TABLE "SisproVerificationResult", "SisproVerification", "CupsCodeChange", "RegulatoryUpdate" CASCADE;
TRUNCATE TABLE "ComparisonLine", "Comparison" CASCADE;
TRUNCATE TABLE "RateCard" CASCADE;
TRUNCATE TABLE "ItemMapping" CASCADE;
TRUNCATE TABLE "ProviderItem" CASCADE;
TRUNCATE TABLE "ProcessUpload" CASCADE;
TRUNCATE TABLE "ProcurementProcess" CASCADE;
TRUNCATE TABLE "ItemEmbedding", "CanonicalCode", "CanonicalItem" CASCADE;

DROP INDEX "CanonicalItem_organizationId_canonicalCode_key";
ALTER TABLE "CanonicalItem" DROP COLUMN "canonicalCode";
