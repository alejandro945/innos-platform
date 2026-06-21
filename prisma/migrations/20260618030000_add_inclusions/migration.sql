-- Add free-text "inclusions" alongside "exclusions" on provider items and rates.
ALTER TABLE "ProviderItem" ADD COLUMN IF NOT EXISTS "inclusions" TEXT;
ALTER TABLE "RateCard" ADD COLUMN IF NOT EXISTS "inclusions" TEXT;
