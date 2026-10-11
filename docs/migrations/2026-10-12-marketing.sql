-- Marketing suite: automation flows (enrollments + run log), form/pop-up stats, campaign channels,
-- discount settings, and the browse-abandonment automation trigger.
--
-- Additive only and safe to re-run. Apply staging first, per docs/production-database-safety.md.
-- Depends on: "AutomationRule", "BroadcastCampaign", "Discount" (schema alignment migrations).

-- New automation trigger. ADD VALUE can't run inside a transaction block on older Postgres; run it on its own.
ALTER TYPE "AutomationTrigger" ADD VALUE IF NOT EXISTS 'browse_abandonment';

-- Campaign channel: email | sms | whatsapp. For SMS/WhatsApp the recipient's phone goes in CampaignRecipient.email.
ALTER TABLE "BroadcastCampaign" ADD COLUMN IF NOT EXISTS "channel" TEXT NOT NULL DEFAULT 'email';

-- Discount settings: automatic discounts, buy X get Y, product scope, segment, once per customer.
ALTER TABLE "Discount" ADD COLUMN IF NOT EXISTS "config" JSONB NOT NULL DEFAULT '{}';

-- One row per contact walking through an automation flow.
CREATE TABLE IF NOT EXISTS "AutomationEnrollment" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "automationId" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "name" TEXT,
    "context" JSONB NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'active',
    "currentStep" INTEGER NOT NULL DEFAULT 0,
    "nextRunAt" TIMESTAMP(3),
    "exitReason" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AutomationEnrollment_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "AutomationEnrollment_automationId_dedupeKey_key" ON "AutomationEnrollment"("automationId", "dedupeKey");
CREATE INDEX IF NOT EXISTS "AutomationEnrollment_storeId_createdAt_idx" ON "AutomationEnrollment"("storeId", "createdAt");
CREATE INDEX IF NOT EXISTS "AutomationEnrollment_status_nextRunAt_idx" ON "AutomationEnrollment"("status", "nextRunAt");
CREATE INDEX IF NOT EXISTS "AutomationEnrollment_automationId_status_idx" ON "AutomationEnrollment"("automationId", "status");

-- What each flow step did (sent, skipped, failed, exited) — the run log on /home/automations.
CREATE TABLE IF NOT EXISTS "AutomationLog" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "automationId" TEXT NOT NULL,
    "enrollmentId" TEXT,
    "stepIndex" INTEGER NOT NULL DEFAULT 0,
    "stepType" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "recipient" TEXT,
    "message" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AutomationLog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "AutomationLog_storeId_createdAt_idx" ON "AutomationLog"("storeId", "createdAt");
CREATE INDEX IF NOT EXISTS "AutomationLog_automationId_createdAt_idx" ON "AutomationLog"("automationId", "createdAt");

-- Daily views and sign-ups per storefront form / pop-up.
CREATE TABLE IF NOT EXISTS "MarketingFormStat" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "formId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "views" INTEGER NOT NULL DEFAULT 0,
    "submissions" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "MarketingFormStat_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "MarketingFormStat_formId_day_key" ON "MarketingFormStat"("formId", "day");
CREATE INDEX IF NOT EXISTS "MarketingFormStat_storeId_day_idx" ON "MarketingFormStat"("storeId", "day");

-- The app talks to these through Prisma with the service connection; nothing reads them with the anon key.
ALTER TABLE "AutomationEnrollment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AutomationLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MarketingFormStat" ENABLE ROW LEVEL SECURITY;

-- ─── Scheduler ────────────────────────────────────────────────────────────────
-- /api/cron/marketing sends scheduled campaigns, enrolls contacts (abandoned carts, browse abandonment,
-- win-back, birthdays) and runs due flow steps. It replaces /api/cron/campaigns (which still works).
-- Vercel Hobby only allows daily crons, so call it from pg_cron like the campaign scheduler
-- (2026-10-11-campaign-scheduler.sql; reuses the "cron_secret" Vault secret = CRON_SECRET in Vercel).
-- Run once the app is deployed with the route:

select cron.schedule(
  'run-marketing',
  '*/10 * * * *',
  $$
  select net.http_get(
    url := 'https://app.shopinbos.com/api/cron/marketing',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    timeout_milliseconds := 120000
  );
  $$
)
where not exists (select 1 from cron.job where jobname = 'run-marketing');
-- Optional once run-marketing is live (it already sends scheduled campaigns):
--   select cron.unschedule('send-scheduled-campaigns');
