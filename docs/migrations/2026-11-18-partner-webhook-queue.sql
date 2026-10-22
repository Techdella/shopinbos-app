-- Retry queue for delivery partner webhooks (src/lib/logistics/webhooks.ts, /api/cron/partner-webhooks):
--
--   * "PartnerWebhookDelivery": one row per event per webhook, saved before the first attempt. A delivery that still
--     fails after the in-request retries (2s, 10s, 30s) is retried by the cron after 5 minutes, 30 minutes, 2 hours,
--     6 hours and 24 hours, then given up ("failedAt"). Delivered rows are cleared after 30 days.
--
-- Additive only, safe to run more than once. Run BEFORE deploying the code that uses it. RLS is on with no policies:
-- only the app's server connection (which bypasses RLS) reads or writes it.
--
-- Schedule: the last statement adds the "partner-webhooks" pg_cron job (every 5 minutes, reusing the "cron_secret"
-- Vault secret); scripts/qstash-schedules.mjs has the same job for QStash. Run it after deploying the route.

CREATE TABLE IF NOT EXISTS "PartnerWebhookDelivery" (
  "id" TEXT NOT NULL,
  "webhookId" TEXT NOT NULL,
  "event" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "lastStatus" INTEGER,
  "nextAttemptAt" TIMESTAMP(3),
  "deliveredAt" TIMESTAMP(3),
  "failedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PartnerWebhookDelivery_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "PartnerWebhookDelivery_nextAttemptAt_idx" ON "PartnerWebhookDelivery"("nextAttemptAt");
CREATE INDEX IF NOT EXISTS "PartnerWebhookDelivery_webhookId_createdAt_idx" ON "PartnerWebhookDelivery"("webhookId", "createdAt");

DO $$ BEGIN
  ALTER TABLE "PartnerWebhookDelivery" ADD CONSTRAINT "PartnerWebhookDelivery_webhookId_fkey"
    FOREIGN KEY ("webhookId") REFERENCES "PartnerWebhook"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "PartnerWebhookDelivery" ENABLE ROW LEVEL SECURITY;

select cron.schedule(
  'partner-webhooks',
  '*/5 * * * *',
  $$
  select net.http_get(
    url := 'https://app.shopinbos.com/api/cron/partner-webhooks',
    headers := jsonb_build_object('Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')),
    timeout_milliseconds := 300000
  );
  $$
)
where not exists (select 1 from cron.job where jobname = 'partner-webhooks');
