-- Schedule for later: a shop publish the seller set for a day and time from the phone's store editor (Publish sheet,
-- design SE-13).
--
--   * "ScheduledStorePublish": one row per scheduled publish. snapshot is the draft exactly as it was when scheduled
--     (draftVersion: its save stamp), so later edits never change what goes live. runAt is the moment (the phone picks
--     it in Lagos time). status scheduled | publishing | published | failed | cancelled. draftChanged is set when the
--     seller edited the draft after scheduling (the scheduled version went live; the newer changes stayed in the
--     draft and the "live" notification says so). At most one scheduled or publishing row per store.
--
-- Written by src/lib/store-editor/scheduled-publish.server.ts (GET/POST/DELETE /api/mobile/store-editor/schedule);
-- /api/cron/store-publish (every 5 minutes) publishes the due ones through publishStoreDraft and notifies the seller.
--
-- Supabase turns on row level security for new tables; the app reads and writes them through Prisma's service
-- connection, so no policies are needed (anon and authenticated roles can't read them).
--
-- Additive only, safe to run more than once. Run BEFORE deploying the code that uses it (until then scheduling
-- answers "isn't switched on yet" and the job does nothing).

CREATE TABLE IF NOT EXISTS "ScheduledStorePublish" (
  "id" TEXT PRIMARY KEY,
  "storeId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "runAt" TIMESTAMP(3) NOT NULL,
  "snapshot" JSONB NOT NULL,
  "draftVersion" TEXT NOT NULL DEFAULT '',
  "status" TEXT NOT NULL DEFAULT 'scheduled',
  "draftChanged" BOOLEAN NOT NULL DEFAULT false,
  "error" TEXT,
  "publishedAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "ScheduledStorePublish_status_runAt_idx" ON "ScheduledStorePublish" ("status", "runAt");
CREATE INDEX IF NOT EXISTS "ScheduledStorePublish_storeId_status_idx" ON "ScheduledStorePublish" ("storeId", "status");
-- One publish waiting (or going live) per store.
CREATE UNIQUE INDEX IF NOT EXISTS "ScheduledStorePublish_one_active_per_store" ON "ScheduledStorePublish" ("storeId") WHERE "status" IN ('scheduled', 'publishing');

ALTER TABLE "ScheduledStorePublish" ENABLE ROW LEVEL SECURITY;

-- /api/cron/store-publish every 5 minutes (QStash schedule "store-publish" in scripts/qstash-schedules.mjs does the
-- same; use one of them). Reuses the "cron_secret" Vault secret (= CRON_SECRET in Vercel). Kept commented out so it is
-- never scheduled before the route is deployed; run it once the app is live with the route:
--
-- select cron.schedule(
--   'store-publish',
--   '*/5 * * * *',
--   $$
--   select net.http_get(
--     url := 'https://app.shopinbos.com/api/cron/store-publish',
--     headers := jsonb_build_object(
--       'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
--     ),
--     timeout_milliseconds := 300000
--   );
--   $$
-- )
-- where not exists (select 1 from cron.job where jobname = 'store-publish');
--
-- To stop it:
--   select cron.unschedule('store-publish');
