-- Lead growth: campaigns and automations that turn website leads into users, and the activity log behind
-- Admin › Analytics (active users and retention).
--
--   * "WebsiteLead" gains convertedUserId / convertedAt (the account the lead became, matched on email or phone
--     when they sign up), optedOut (channels they asked us to stop: email | sms | whatsapp) and lastMessagedAt.
--   * "LeadCampaign": a one-off email, SMS or WhatsApp send to a slice of leads (Admin › Lead campaigns).
--   * "LeadAutomation" + "LeadEnrollment": a sequence of steps each new lead walks through (welcome now, a nudge
--     two days later...), stopped as soon as the lead signs up or opts out.
--   * "LeadMessage": one row per message, claimed before it is sent, so a retried run never sends twice.
--   * "UserActivityDay": one row per signed-in account per day they used the app.
--
-- Additive only, safe to run more than once. RLS is on with no policies: only the app's server connection reads
-- or writes these tables. Needs 2026-10-18-website-leads.sql first. Run BEFORE deploying the code that uses it.

ALTER TABLE "WebsiteLead" ADD COLUMN IF NOT EXISTS "convertedUserId" TEXT;
ALTER TABLE "WebsiteLead" ADD COLUMN IF NOT EXISTS "convertedAt" TIMESTAMP(3);
ALTER TABLE "WebsiteLead" ADD COLUMN IF NOT EXISTS "optedOut" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "WebsiteLead" ADD COLUMN IF NOT EXISTS "lastMessagedAt" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "WebsiteLead_convertedAt_idx" ON "WebsiteLead"("convertedAt");

CREATE TABLE IF NOT EXISTS "LeadCampaign" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "channel" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "audience" JSONB NOT NULL DEFAULT '{}',
  "subject" TEXT,
  "body" TEXT NOT NULL,
  "ctaLabel" TEXT,
  "ctaUrl" TEXT,
  "waTemplate" TEXT,
  "waLanguage" TEXT,
  "scheduledAt" TIMESTAMP(3),
  "startedAt" TIMESTAMP(3),
  "finishedAt" TIMESTAMP(3),
  "total" INTEGER NOT NULL DEFAULT 0,
  "sent" INTEGER NOT NULL DEFAULT 0,
  "failed" INTEGER NOT NULL DEFAULT 0,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LeadCampaign_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "LeadCampaign_status_scheduledAt_idx" ON "LeadCampaign"("status", "scheduledAt");

CREATE TABLE IF NOT EXISTS "LeadAutomation" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT false,
  "audience" JSONB NOT NULL DEFAULT '{}',
  "steps" JSONB NOT NULL DEFAULT '[]',
  "includeExisting" BOOLEAN NOT NULL DEFAULT false,
  "activatedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LeadAutomation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "LeadEnrollment" (
  "id" TEXT NOT NULL,
  "automationId" TEXT NOT NULL,
  "leadId" TEXT NOT NULL,
  "step" INTEGER NOT NULL DEFAULT 0,
  "nextAt" TIMESTAMP(3) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'active',
  "stopReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LeadEnrollment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "LeadEnrollment_automationId_fkey" FOREIGN KEY ("automationId") REFERENCES "LeadAutomation"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "LeadEnrollment_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "WebsiteLead"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "LeadEnrollment_automationId_leadId_key" ON "LeadEnrollment"("automationId", "leadId");
CREATE INDEX IF NOT EXISTS "LeadEnrollment_status_nextAt_idx" ON "LeadEnrollment"("status", "nextAt");

CREATE TABLE IF NOT EXISTS "LeadMessage" (
  "id" TEXT NOT NULL,
  "leadId" TEXT NOT NULL,
  "campaignId" TEXT,
  "automationId" TEXT,
  "step" INTEGER,
  "channel" TEXT NOT NULL,
  "to" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'sending',
  "error" TEXT,
  "providerId" TEXT,
  "sentAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LeadMessage_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "LeadMessage_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "WebsiteLead"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "LeadMessage_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "LeadCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "LeadMessage_automationId_fkey" FOREIGN KEY ("automationId") REFERENCES "LeadAutomation"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "LeadMessage_campaignId_leadId_key" ON "LeadMessage"("campaignId", "leadId");
CREATE UNIQUE INDEX IF NOT EXISTS "LeadMessage_automationId_leadId_step_key" ON "LeadMessage"("automationId", "leadId", "step");
CREATE INDEX IF NOT EXISTS "LeadMessage_leadId_idx" ON "LeadMessage"("leadId");
CREATE INDEX IF NOT EXISTS "LeadMessage_status_createdAt_idx" ON "LeadMessage"("status", "createdAt");

CREATE TABLE IF NOT EXISTS "UserActivityDay" (
  "userId" TEXT NOT NULL,
  "day" DATE NOT NULL,
  "role" TEXT NOT NULL,
  CONSTRAINT "UserActivityDay_pkey" PRIMARY KEY ("userId", "day")
);
CREATE INDEX IF NOT EXISTS "UserActivityDay_day_idx" ON "UserActivityDay"("day");

ALTER TABLE "LeadCampaign" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LeadAutomation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LeadEnrollment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LeadMessage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "UserActivityDay" ENABLE ROW LEVEL SECURITY;

-- Leads who already have an account: mark them signed up (the app keeps doing this as people sign up).
UPDATE "WebsiteLead" l
SET "convertedUserId" = u."id", "convertedAt" = GREATEST(u."createdAt", l."createdAt"), "status" = 'converted'
FROM "User" u
WHERE l."convertedUserId" IS NULL
  AND ((l."email" IS NOT NULL AND lower(u."email") = lower(l."email")) OR (l."phone" IS NOT NULL AND u."phone" = l."phone"));

-- Scheduled campaigns, automation steps and sign-up matching run from /api/cron/lead-growth every 10 minutes.
-- Vercel Hobby only allows daily crons, so call it from pg_cron like the other jobs (reuses the "cron_secret"
-- Vault secret = CRON_SECRET in Vercel). Run once the app is deployed with the route (commented out so it is
-- never run by accident):
--
-- select cron.schedule(
--   'lead-growth',
--   '*/10 * * * *',
--   $$
--   select net.http_get(
--     url := 'https://app.shopinbos.com/api/cron/lead-growth',
--     headers := jsonb_build_object(
--       'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
--     ),
--     timeout_milliseconds := 300000
--   );
--   $$
-- )
-- where not exists (select 1 from cron.job where jobname = 'lead-growth');
--
-- To stop it:
--   select cron.unschedule('lead-growth');
