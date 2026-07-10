-- Tariff type: comes from a mapped column in the provider file when present,
-- defaults to PROPIA otherwise.
ALTER TABLE "RateCard" ADD COLUMN IF NOT EXISTS "type" TEXT NOT NULL DEFAULT 'PROPIA';
ALTER TABLE "ProviderItem" ADD COLUMN IF NOT EXISTS "rawType" TEXT;
