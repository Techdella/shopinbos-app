-- Push center (Admin › Push center, /admin/push; shared/push-campaigns.ts, src/lib/push-campaigns/campaigns.server.ts):
-- admins write a push, pick who gets it, test it on their own phone, then send it now or schedule it, and see how
-- it did. Each campaign goes through notify() (bell + push in the new "Shopinbos news" category, which people can
-- switch off), so nothing here changes how existing notifications work.
--
-- Additive only, safe to run more than once. Run BEFORE deploying (until then /admin/push says the update is
-- needed and nothing else is affected). The pg_cron block at the end is applied by the owner (or use the QStash
-- schedule "push-campaigns" from scripts/qstash-schedules.mjs instead).

CREATE TABLE IF NOT EXISTS "PushCampaign" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "linkKey" TEXT NOT NULL DEFAULT 'home',
  "link" TEXT NOT NULL,
  "appLink" TEXT,
  "audience" JSONB NOT NULL,
  "urgent" BOOLEAN NOT NULL DEFAULT false,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "scheduledAt" TIMESTAMP(3),
  "startedAt" TIMESTAMP(3),
  "sentAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "testedHash" TEXT,
  "testedAt" TIMESTAMP(3),
  "overrideLimit" BOOLEAN NOT NULL DEFAULT false,
  "targetedCount" INTEGER NOT NULL DEFAULT 0,
  "deviceCount" INTEGER NOT NULL DEFAULT 0,
  "notifiedCount" INTEGER NOT NULL DEFAULT 0,
  "failedCount" INTEGER NOT NULL DEFAULT 0,
  "pushSent" INTEGER NOT NULL DEFAULT 0,
  "pushOk" INTEGER NOT NULL DEFAULT 0,
  "pushErrors" INTEGER NOT NULL DEFAULT 0,
  "openedCount" INTEGER NOT NULL DEFAULT 0,
  "resentAt" TIMESTAMP(3),
  "lastError" TEXT,
  "createdById" TEXT NOT NULL,
  "sentById" TEXT,
  "cancelledById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PushCampaign_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "PushCampaign_status_scheduledAt_idx" ON "PushCampaign"("status", "scheduledAt");
CREATE INDEX IF NOT EXISTS "PushCampaign_createdAt_idx" ON "PushCampaign"("createdAt");

-- One row per person (userId) or rider (riderId) a campaign goes to: queued → sending → sent | failed.
CREATE TABLE IF NOT EXISTS "PushCampaignRecipient" (
  "id" TEXT NOT NULL,
  "campaignId" TEXT NOT NULL,
  "userId" TEXT,
  "riderId" TEXT,
  "notificationId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'queued',
  "error" TEXT,
  "sentAt" TIMESTAMP(3),
  "claimedAt" TIMESTAMP(3),
  "openedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PushCampaignRecipient_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "PushCampaignRecipient_campaignId_userId_key" ON "PushCampaignRecipient"("campaignId", "userId");
CREATE UNIQUE INDEX IF NOT EXISTS "PushCampaignRecipient_campaignId_riderId_key" ON "PushCampaignRecipient"("campaignId", "riderId");
CREATE INDEX IF NOT EXISTS "PushCampaignRecipient_campaignId_status_idx" ON "PushCampaignRecipient"("campaignId", "status");
CREATE INDEX IF NOT EXISTS "PushCampaignRecipient_notificationId_idx" ON "PushCampaignRecipient"("notificationId");
DO $$ BEGIN
  ALTER TABLE "PushCampaignRecipient" ADD CONSTRAINT "PushCampaignRecipient_campaignId_fkey"
    FOREIGN KEY ("campaignId") REFERENCES "PushCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Audit log: who created, tested, scheduled, sent, cancelled or resent a campaign.
CREATE TABLE IF NOT EXISTS "PushCampaignEvent" (
  "id" TEXT NOT NULL,
  "campaignId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "byId" TEXT,
  "detail" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PushCampaignEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "PushCampaignEvent_campaignId_createdAt_idx" ON "PushCampaignEvent"("campaignId", "createdAt");
DO $$ BEGIN
  ALTER TABLE "PushCampaignEvent" ADD CONSTRAINT "PushCampaignEvent_campaignId_fkey"
    FOREIGN KEY ("campaignId") REFERENCES "PushCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- A campaign's push results are its deliveries with collapseKey 'push-campaign:<id>'.
CREATE INDEX IF NOT EXISTS "NotificationDelivery_collapseKey_status_idx" ON "NotificationDelivery"("collapseKey", "status");

-- Server-only: no policies, so the anon and authenticated roles can't read them through the Supabase API.
ALTER TABLE "PushCampaign" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PushCampaignRecipient" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PushCampaignEvent" ENABLE ROW LEVEL SECURITY;

-- Scheduled campaigns and big sends: every 5 minutes. Applied by the owner in the Supabase SQL editor (needs the
-- Vault secret 'cron_secret' = CRON_SECRET). Skip it if the QStash schedule "push-campaigns" runs instead.
select cron.schedule(
  'push-campaigns',
  '*/5 * * * *',
  $$
  select net.http_get(
    url := 'https://app.shopinbos.com/api/cron/push-campaigns',
    headers := jsonb_build_object('Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')),
    timeout_milliseconds := 300000
  );
  $$
)
where not exists (select 1 from cron.job where jobname = 'push-campaigns');
