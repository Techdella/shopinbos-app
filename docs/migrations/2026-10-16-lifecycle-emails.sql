-- Lifecycle emails: welcome, onboarding nudges, milestones, retention and loyalty mail from Shopinbos to sellers,
-- suppliers, delivery partners and admins (catalog: src/lib/lifecycle/catalog.ts). One row per email per user;
-- the unique (userId, key) is what makes each one send once, however often the user is re-evaluated.
--
-- Safe to run before the code ships, and the code is safe before this runs: the in-app hooks and the cron route
-- treat a missing table as "nothing to do".

CREATE TABLE IF NOT EXISTS "LifecycleEmail" (
  "id"        TEXT         NOT NULL,
  "userId"    TEXT         NOT NULL,
  "key"       TEXT         NOT NULL,
  "rule"      TEXT         NOT NULL,
  "status"    TEXT         NOT NULL DEFAULT 'sending',
  "attempts"  INTEGER      NOT NULL DEFAULT 1,
  "resendId"  TEXT,
  "error"     TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sentAt"    TIMESTAMP(3),
  CONSTRAINT "LifecycleEmail_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "LifecycleEmail_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "LifecycleEmail_userId_key_key" ON "LifecycleEmail"("userId", "key");
CREATE INDEX IF NOT EXISTS "LifecycleEmail_userId_createdAt_idx" ON "LifecycleEmail"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "LifecycleEmail_rule_status_idx" ON "LifecycleEmail"("rule", "status");

-- Server-only table: no client reads it, so keep it behind RLS with no policies (the app uses the service role).
ALTER TABLE "LifecycleEmail" ENABLE ROW LEVEL SECURITY;

-- Hourly sweep: /api/cron/lifecycle evaluates every account against the catalog (time-based nudges, weekly
-- summary for admins, win-backs, anniversaries) and catches any event the in-app hooks missed. Vercel Hobby only allows
-- daily crons, so call it from pg_cron like the other jobs (reuses the "cron_secret" Vault secret = CRON_SECRET in
-- Vercel). Run once the app is deployed with the route (kept commented out so it is never run by accident):
--
-- select cron.schedule(
--   'lifecycle-emails',
--   '23 * * * *',
--   $$
--   select net.http_get(
--     url := 'https://shopinbos-app.vercel.app/api/cron/lifecycle',
--     headers := jsonb_build_object(
--       'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
--     ),
--     timeout_milliseconds := 120000
--   );
--   $$
-- )
-- where not exists (select 1 from cron.job where jobname = 'lifecycle-emails');
--
-- To stop it:
--   select cron.unschedule('lifecycle-emails');
