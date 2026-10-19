-- Admin › Pricing (/admin/pricing, shared/platform-pricing.ts).
--
--   * "PlatformSetting": platform-wide settings an admin changes without a deploy. Prices are "price.<key>"; a key
--     with no row uses the registry's default (today's number, or its old environment variable).
--   * "PlatformSettingChange": who changed which setting, when, from what to what, and why.
--
-- The store-sales fee and the delivery-partner fee used to live in "PlatformFeeConfig". Their current values are
-- copied over so nothing changes on deploy; that table is no longer read.
--
-- Additive only, safe to run more than once (existing settings are never overwritten). Run BEFORE deploying.

CREATE TABLE IF NOT EXISTS "PlatformSetting" (
  "key" TEXT NOT NULL,
  "value" JSONB NOT NULL,
  "updatedById" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PlatformSetting_pkey" PRIMARY KEY ("key")
);

CREATE TABLE IF NOT EXISTS "PlatformSettingChange" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "before" JSONB,
  "after" JSONB NOT NULL,
  "note" TEXT,
  "changedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PlatformSettingChange_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "PlatformSettingChange_key_createdAt_idx" ON "PlatformSettingChange"("key", "createdAt");
CREATE INDEX IF NOT EXISTS "PlatformSettingChange_createdAt_idx" ON "PlatformSettingChange"("createdAt");
DO $$ BEGIN
  ALTER TABLE "PlatformSettingChange" ADD CONSTRAINT "PlatformSettingChange_changedById_fkey"
    FOREIGN KEY ("changedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Carry the live fees over (the newest active PlatformFeeConfig row), only where no setting exists yet.
INSERT INTO "PlatformSetting" ("key", "value", "updatedAt")
SELECT k.key, k.value, CURRENT_TIMESTAMP
FROM (
  SELECT 'price.store_fee.rate' AS key, to_jsonb(rate) AS value FROM "PlatformFeeConfig" WHERE active ORDER BY "updatedAt" DESC LIMIT 1
) k
UNION ALL SELECT k.key, k.value, CURRENT_TIMESTAMP FROM (
  SELECT 'price.store_fee.min' AS key, to_jsonb("minFee") AS value FROM "PlatformFeeConfig" WHERE active ORDER BY "updatedAt" DESC LIMIT 1
) k
UNION ALL SELECT k.key, k.value, CURRENT_TIMESTAMP FROM (
  SELECT 'price.store_fee.max' AS key, to_jsonb("maxFee") AS value FROM "PlatformFeeConfig" WHERE active ORDER BY "updatedAt" DESC LIMIT 1
) k
UNION ALL SELECT k.key, k.value, CURRENT_TIMESTAMP FROM (
  SELECT 'price.delivery.fee_rate' AS key, to_jsonb(rate) AS value FROM "PlatformFeeConfig" WHERE active ORDER BY "updatedAt" DESC LIMIT 1
) k
UNION ALL SELECT k.key, k.value, CURRENT_TIMESTAMP FROM (
  SELECT 'price.delivery.fee_bearer' AS key, to_jsonb(bearer) AS value FROM "PlatformFeeConfig" WHERE active ORDER BY "updatedAt" DESC LIMIT 1
) k
ON CONFLICT ("key") DO NOTHING;

-- Server-only tables: no policies, so the anon and authenticated roles can't read them through the Supabase API.
ALTER TABLE "PlatformSetting" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PlatformSettingChange" ENABLE ROW LEVEL SECURITY;
