-- Seasonal campaigns (Marketing > Seasonal campaigns, /home/campaigns): a seller schedules Black Friday, Detty
-- December… once, and the live store changes and reverts by itself.
--
--   * "StoreCampaign":      one row per campaign. startsAt / endsAt are UTC (null = draft); the status is worked out
--                           from the dates, pausedAt and archivedAt (src/lib/store-campaigns/status.ts), so it is right
--                           even when the job below runs late. "themeOverride" and "sectionOverrides" hold only the
--                           differences from the store's own design, merged when the storefront renders; the store's
--                           design is never edited. startJobRanAt / endJobRanAt / endingSoonSentAt make the start and
--                           end side effects (linked discount on/off, seller notifications) run exactly once.
--   * "StoreCampaignBlock": the store-wide pieces: announcement bar, pop-up (points at a "StoreForm" pop-up, so there is
--                           one pop-up engine), product badges and the countdown.
--   * "StoreCampaignEvent": storefront events for the campaign report (views, clicks, pop-up shown/closed/converted).
--
-- Additive only, safe to run more than once. RLS is on with no policies: only the app's server connection (which
-- bypasses RLS) reads or writes these tables, and every app route checks the campaign belongs to the seller's store.
-- Shoppers never read them directly: the storefront asks the server, which only returns live campaigns (or one
-- campaign with a valid signed preview link). Run BEFORE deploying the code that uses it.

CREATE TABLE IF NOT EXISTS "StoreCampaign" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "preset" TEXT,
  "startsAt" TIMESTAMP(3),
  "endsAt" TIMESTAMP(3),
  "timezone" TEXT NOT NULL DEFAULT 'Africa/Lagos',
  "priority" INTEGER NOT NULL DEFAULT 0,
  "pausedAt" TIMESTAMP(3),
  "archivedAt" TIMESTAMP(3),
  "endingSoonHours" INTEGER NOT NULL DEFAULT 24,
  "discountId" TEXT,
  "discountAutoToggle" BOOLEAN NOT NULL DEFAULT false,
  "themeOverride" JSONB NOT NULL DEFAULT '{}',
  "sectionOverrides" JSONB NOT NULL DEFAULT '[]',
  "startJobRanAt" TIMESTAMP(3),
  "endJobRanAt" TIMESTAMP(3),
  "endingSoonSentAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StoreCampaign_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StoreCampaign_dates_check" CHECK ("endsAt" IS NULL OR "startsAt" IS NULL OR "endsAt" > "startsAt")
);
CREATE INDEX IF NOT EXISTS "StoreCampaign_storeId_startsAt_endsAt_idx" ON "StoreCampaign"("storeId", "startsAt", "endsAt");
CREATE INDEX IF NOT EXISTS "StoreCampaign_endsAt_idx" ON "StoreCampaign"("endsAt");

CREATE TABLE IF NOT EXISTS "StoreCampaignBlock" (
  "id" TEXT NOT NULL,
  "campaignId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "settings" JSONB NOT NULL DEFAULT '{}',
  "targeting" JSONB NOT NULL DEFAULT '{}',
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StoreCampaignBlock_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StoreCampaignBlock_type_check" CHECK ("type" IN ('announcement', 'popup', 'badge', 'countdown'))
);
CREATE INDEX IF NOT EXISTS "StoreCampaignBlock_campaignId_type_idx" ON "StoreCampaignBlock"("campaignId", "type");

CREATE TABLE IF NOT EXISTS "StoreCampaignEvent" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "campaignId" TEXT NOT NULL,
  "blockId" TEXT,
  "event" TEXT NOT NULL,
  "sessionId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StoreCampaignEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "StoreCampaignEvent_campaignId_event_createdAt_idx" ON "StoreCampaignEvent"("campaignId", "event", "createdAt");

-- Foreign keys (added once; "ADD CONSTRAINT" has no IF NOT EXISTS).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'StoreCampaign_storeId_fkey') THEN
    ALTER TABLE "StoreCampaign" ADD CONSTRAINT "StoreCampaign_storeId_fkey"
      FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'StoreCampaign_discountId_fkey') THEN
    ALTER TABLE "StoreCampaign" ADD CONSTRAINT "StoreCampaign_discountId_fkey"
      FOREIGN KEY ("discountId") REFERENCES "Discount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'StoreCampaignBlock_campaignId_fkey') THEN
    ALTER TABLE "StoreCampaignBlock" ADD CONSTRAINT "StoreCampaignBlock_campaignId_fkey"
      FOREIGN KEY ("campaignId") REFERENCES "StoreCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'StoreCampaignEvent_campaignId_fkey') THEN
    ALTER TABLE "StoreCampaignEvent" ADD CONSTRAINT "StoreCampaignEvent_campaignId_fkey"
      FOREIGN KEY ("campaignId") REFERENCES "StoreCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

ALTER TABLE "StoreCampaign" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StoreCampaignBlock" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StoreCampaignEvent" ENABLE ROW LEVEL SECURITY;

-- Start/end side effects and the safety sweep: /api/cron/seasonal-campaigns every 5 minutes. (/api/cron/campaigns is
-- the email broadcast sender, a different job.) Each run switches linked discounts on/off, tells the seller a
-- campaign went live, is ending soon or ended (with a summary), and catches any boundary a late run missed. Running
-- it twice changes nothing: each side effect is claimed once with a conditional update on its *JobRanAt column.
-- Reuses the "cron_secret" Vault secret (= CRON_SECRET in Vercel), like the other jobs.
--
-- To see recent calls:  select status_code, content, created from net._http_response order by created desc limit 10;
-- To stop it:           select cron.unschedule('seasonal-campaigns');
--
-- The job, as run by hand (same as the guarded block below):
--
-- select cron.schedule(
--   'seasonal-campaigns',
--   '*/5 * * * *',
--   $$
--   select net.http_get(
--     url := 'https://shopinbos-app.vercel.app/api/cron/seasonal-campaigns',
--     headers := jsonb_build_object(
--       'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
--     ),
--     timeout_milliseconds := 60000
--   );
--   $$
-- )
-- where not exists (select 1 from cron.job where jobname = 'seasonal-campaigns');
--
-- Guarded so it only schedules when pg_cron, pg_net and Vault exist, and never twice.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron')
     AND EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net')
     AND EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'vault')
     AND NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'seasonal-campaigns') THEN
    PERFORM cron.schedule(
      'seasonal-campaigns',
      '*/5 * * * *',
      $job$
      select net.http_get(
        url := 'https://shopinbos-app.vercel.app/api/cron/seasonal-campaigns',
        headers := jsonb_build_object(
          'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
        ),
        timeout_milliseconds := 60000
      );
      $job$
    );
  END IF;
END $$;
