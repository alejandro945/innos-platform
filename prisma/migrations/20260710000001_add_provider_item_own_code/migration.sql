-- "CUPS PROPIO": the buying institution's own CUPS code column in a provider
-- file. Mapped separately from the provider's code so homologation can match
-- it directly against the canonical catalog.
ALTER TABLE "ProviderItem" ADD COLUMN IF NOT EXISTS "rawOwnCode" TEXT;
