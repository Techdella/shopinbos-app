-- Logistics tiers control reach, not cash (WP-1, shared/partner-reach.ts): Tier 1 Verified, Tier 2 Trusted (interstate,
-- higher in shops' rider lists), Tier 3 Top partner (high-value parcels, can apply to be featured).
-- Additive only: new columns with defaults and one index; nothing changed or removed. Safe to run more than once.
-- Run BEFORE deploying the reach-tier code (the level screen, featured applications and job creation read these).
-- The admin-editable high-value rules live in PlatformSetting "logistics.high_value" (defaults in code, no row needed).

ALTER TABLE "LogisticsPartner" ADD COLUMN IF NOT EXISTS "featuredStatus" TEXT NOT NULL DEFAULT 'none';
ALTER TABLE "LogisticsPartner" ADD COLUMN IF NOT EXISTS "featuredAppliedAt" TIMESTAMP(3);
ALTER TABLE "LogisticsPartner" ADD COLUMN IF NOT EXISTS "featuredAt" TIMESTAMP(3);
ALTER TABLE "LogisticsPartner" ADD COLUMN IF NOT EXISTS "featuredNote" TEXT;
ALTER TABLE "LogisticsPartner" ADD COLUMN IF NOT EXISTS "interstateNoticeAt" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "LogisticsPartner_featuredStatus_idx" ON "LogisticsPartner" ("featuredStatus");

ALTER TABLE "DeliveryBooking" ADD COLUMN IF NOT EXISTS "highValue" BOOLEAN NOT NULL DEFAULT false;

-- How many partners the interstate gate touches (offer interstate, verified, still below Trusted). They keep their
-- interstate switch but stop getting interstate jobs, and are told once (cron /api/cron/delivery-jobs):
--   SELECT count(*) FROM "LogisticsPartner"
--   WHERE 'interstate' = ANY("services") AND "verificationStatus" = 'verified' AND "level" NOT IN ('trusted', 'cash_trusted');
