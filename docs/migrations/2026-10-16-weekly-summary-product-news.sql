-- Shopinbos's own emails: weekly summaries and product news.
--
--   * "WeeklySummaryLog": one row per user and week ("weekStart" = the Monday, Africa/Lagos, YYYY-MM-DD). The cron
--     claims the row (INSERT … ON CONFLICT DO NOTHING) before it sends, so a re-run or two overlapping runs never
--     send the same week twice. Users with nothing to report get a "skipped" row, so each run carries on where the
--     last one stopped. The quiet-week email ("kind" = 'quiet') goes at most once every 4 weeks.
--   * "ProductNewsBroadcast": a product news email an admin writes at /admin/product-news (draft / scheduled /
--     sending / sent / failed, with counts).
--   * "ProductNewsRecipient": who a broadcast goes to, unique per (broadcast, user), so a retry never sends twice.
--     Users who turned off "Product news and tips" get a 'skipped' row (counted, never emailed).
--
-- Additive only (new tables), safe to run more than once. RLS is on for the new tables with no policies: only the
-- app's server connection (which bypasses RLS) reads or writes them, never the Supabase anon/authenticated keys.
-- Run BEFORE deploying the code that uses it.

CREATE TABLE IF NOT EXISTS "WeeklySummaryLog" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "weekStart" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "kind" TEXT NOT NULL DEFAULT 'full',
  "status" TEXT NOT NULL DEFAULT 'claimed',
  "attempts" INTEGER NOT NULL DEFAULT 1,
  "error" TEXT,
  "sentAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WeeklySummaryLog_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "WeeklySummaryLog_userId_weekStart_key" ON "WeeklySummaryLog"("userId", "weekStart");
CREATE INDEX IF NOT EXISTS "WeeklySummaryLog_weekStart_status_idx" ON "WeeklySummaryLog"("weekStart", "status");
CREATE INDEX IF NOT EXISTS "WeeklySummaryLog_userId_kind_status_idx" ON "WeeklySummaryLog"("userId", "kind", "status");

CREATE TABLE IF NOT EXISTS "ProductNewsBroadcast" (
  "id" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "preheader" TEXT,
  "heading" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "imageUrl" TEXT,
  "ctaLabel" TEXT,
  "ctaUrl" TEXT,
  "audience" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "status" TEXT NOT NULL DEFAULT 'draft',
  "scheduledAt" TIMESTAMP(3),
  "startedAt" TIMESTAMP(3),
  "sentAt" TIMESTAMP(3),
  "recipientCount" INTEGER NOT NULL DEFAULT 0,
  "sentCount" INTEGER NOT NULL DEFAULT 0,
  "failedCount" INTEGER NOT NULL DEFAULT 0,
  "skippedCount" INTEGER NOT NULL DEFAULT 0,
  "lastError" TEXT,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProductNewsBroadcast_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ProductNewsBroadcast_status_scheduledAt_idx" ON "ProductNewsBroadcast"("status", "scheduledAt");

CREATE TABLE IF NOT EXISTS "ProductNewsRecipient" (
  "id" TEXT NOT NULL,
  "broadcastId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'queued',
  "error" TEXT,
  "sentAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProductNewsRecipient_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ProductNewsRecipient_broadcastId_userId_key" ON "ProductNewsRecipient"("broadcastId", "userId");
CREATE INDEX IF NOT EXISTS "ProductNewsRecipient_broadcastId_status_idx" ON "ProductNewsRecipient"("broadcastId", "status");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ProductNewsRecipient_broadcastId_fkey') THEN
    ALTER TABLE "ProductNewsRecipient"
      ADD CONSTRAINT "ProductNewsRecipient_broadcastId_fkey" FOREIGN KEY ("broadcastId") REFERENCES "ProductNewsBroadcast"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

ALTER TABLE "WeeklySummaryLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProductNewsBroadcast" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProductNewsRecipient" ENABLE ROW LEVEL SECURITY;

-- ─── Schedules (pg_cron + pg_net, like 2026-10-14-expire-orders-cron.sql) ───────
-- Reuses the "cron_secret" Vault secret (= CRON_SECRET in Vercel). Kept commented out so it is never run by
-- accident; run once the app is deployed with the routes.
--
-- 1. Weekly summaries: Monday 07:00 Africa/Lagos = 06:00 UTC. Each call sends a bounded batch
--    (WEEKLY_SUMMARY_MAX_PER_RUN, default 300) for last week (Mon–Sun, Lagos).
--
-- select cron.schedule(
--   'weekly-summary',
--   '0 6 * * 1',
--   $$
--   select net.http_get(
--     url := 'https://shopinbos-app.vercel.app/api/cron/weekly-summary',
--     headers := jsonb_build_object(
--       'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
--     ),
--     timeout_milliseconds := 300000
--   );
--   $$
-- )
-- where not exists (select 1 from cron.job where jobname = 'weekly-summary');
--
-- 1b. Optional, once there are more users than one call sends: follow-up calls on Monday morning carry on where the
--     06:00 run stopped (already-sent users are skipped, so extra calls are harmless).
--
-- select cron.schedule(
--   'weekly-summary-continue',
--   '20,40 6-9 * * 1',
--   $$
--   select net.http_get(
--     url := 'https://shopinbos-app.vercel.app/api/cron/weekly-summary',
--     headers := jsonb_build_object(
--       'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
--     ),
--     timeout_milliseconds := 300000
--   );
--   $$
-- )
-- where not exists (select 1 from cron.job where jobname = 'weekly-summary-continue');
--
-- 2. Product news: starts scheduled broadcasts and carries on with ones still sending, every 10 minutes.
--
-- select cron.schedule(
--   'product-news',
--   '*/10 * * * *',
--   $$
--   select net.http_get(
--     url := 'https://shopinbos-app.vercel.app/api/cron/product-news',
--     headers := jsonb_build_object(
--       'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
--     ),
--     timeout_milliseconds := 300000
--   );
--   $$
-- )
-- where not exists (select 1 from cron.job where jobname = 'product-news');
--
-- To stop them:
--   select cron.unschedule('weekly-summary');
--   select cron.unschedule('weekly-summary-continue');
--   select cron.unschedule('product-news');
