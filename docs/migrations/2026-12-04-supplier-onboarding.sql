-- Supplier onboarding, one question per screen (shared/supplier-onboarding.ts, /supplier/onboarding). The supplier
-- keeps its ID check (identityChecks: the kind of ID photographed and, for a NIN slip, the NIN's last 4 digits, keyed
-- hash and Korapay result; never the whole number), how shops can buy (buyModes: dropship / wholesale / preorder,
-- the defaults for new products), the smallest wholesale order (minimumOrder) and where goods leave from
-- (pickupLat / pickupLng). Additive only: new columns with defaults or nulls. No new table, so no new RLS. Safe to
-- run more than once. Run BEFORE deploying: the app reads these columns.

ALTER TABLE "Supplier" ADD COLUMN IF NOT EXISTS "identityChecks" JSONB NOT NULL DEFAULT '{}';
ALTER TABLE "Supplier" ADD COLUMN IF NOT EXISTS "buyModes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Supplier" ADD COLUMN IF NOT EXISTS "minimumOrder" INTEGER;
ALTER TABLE "Supplier" ADD COLUMN IF NOT EXISTS "pickupLat" DOUBLE PRECISION;
ALTER TABLE "Supplier" ADD COLUMN IF NOT EXISTS "pickupLng" DOUBLE PRECISION;
