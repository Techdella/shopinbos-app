-- Late cash pay-ins from delivery partners (src/lib/logistics/payin-deadline.ts, payin-standing.server.ts).
--
-- Cash a rider collects on a pay-when-it-arrives job is due by 6pm Lagos the same day (cash collected after 6pm:
-- 6pm the next day). PARTNER_PAYIN_CUTOFF_HOUR (default 18) and PARTNER_PAYIN_GRACE_MINUTES (default 60) change it.
--
--   * "LogisticsPartner".codPaused: paused from new pay-when-it-arrives jobs only (prepaid jobs and jobs they
--     already have carry on). Set and cleared by the system or the team, never by the "Taking new jobs" switch
--     ("status" = active | paused), so the partner can't switch it off themselves.
--   * payInOverdueSince / payInOverdueAmount: the missed deadline and the cash still owed past it (after credit).
--   * payInEscalatedAt (24 hours late, high priority), payInReviewAt (72 hours late, for the team to review; no
--     automatic suspension), payInPauseWaived (the team pressed "Unpause" for this late period), payInStrikes
--     (days late; each also takes 5 points off "reliabilityScore").
--   * "PartnerPayInEvent": history and de-duplication. dedupeKey is unique (e.g. "overdue:<partner>:<deadline>"),
--     so the cron and the pay-in hooks never send the same message twice.
--
-- Additive only, safe to run more than once. RLS is on with no policies for the new table: only the app's server
-- connection (which bypasses RLS) reads or writes it. Run BEFORE deploying the code that uses it.

ALTER TABLE "LogisticsPartner" ADD COLUMN IF NOT EXISTS "codPaused" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "LogisticsPartner" ADD COLUMN IF NOT EXISTS "payInOverdueSince" TIMESTAMP(3);
ALTER TABLE "LogisticsPartner" ADD COLUMN IF NOT EXISTS "payInOverdueAmount" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "LogisticsPartner" ADD COLUMN IF NOT EXISTS "payInEscalatedAt" TIMESTAMP(3);
ALTER TABLE "LogisticsPartner" ADD COLUMN IF NOT EXISTS "payInReviewAt" TIMESTAMP(3);
ALTER TABLE "LogisticsPartner" ADD COLUMN IF NOT EXISTS "payInPauseWaived" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "LogisticsPartner" ADD COLUMN IF NOT EXISTS "payInStrikes" INTEGER NOT NULL DEFAULT 0;

-- The cron looks up late partners and partners holding unpaid cash.
CREATE INDEX IF NOT EXISTS "LogisticsPartner_payInOverdueSince_idx" ON "LogisticsPartner"("payInOverdueSince");
CREATE INDEX IF NOT EXISTS "DeliveryBooking_unpaid_cash_idx" ON "DeliveryBooking"("logisticsPartnerId", "codCollectedAt")
  WHERE "codMethod" = 'cash' AND "remittanceId" IS NULL;

CREATE TABLE IF NOT EXISTS "PartnerPayInEvent" (
  "id" TEXT NOT NULL,
  "logisticsPartnerId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "dedupeKey" TEXT NOT NULL,
  "amount" DOUBLE PRECISION,
  "deadline" TIMESTAMP(3),
  "note" TEXT,
  "adminUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PartnerPayInEvent_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "PartnerPayInEvent_dedupeKey_key" ON "PartnerPayInEvent"("dedupeKey");
CREATE INDEX IF NOT EXISTS "PartnerPayInEvent_logisticsPartnerId_createdAt_idx" ON "PartnerPayInEvent"("logisticsPartnerId", "createdAt");
CREATE INDEX IF NOT EXISTS "PartnerPayInEvent_kind_createdAt_idx" ON "PartnerPayInEvent"("kind", "createdAt");

DO $$ BEGIN
  ALTER TABLE "PartnerPayInEvent" ADD CONSTRAINT "PartnerPayInEvent_logisticsPartnerId_fkey"
    FOREIGN KEY ("logisticsPartnerId") REFERENCES "LogisticsPartner"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "PartnerPayInEvent" ENABLE ROW LEVEL SECURITY;

-- /api/cron/partner-payins every 15 minutes: the 4pm reminder, flagging and pausing after 6pm plus grace,
-- escalation at 24 and 72 hours, strikes, and clearing anyone whose late cash is paid in. Reuses the "cron_secret"
-- Vault secret (= CRON_SECRET in Vercel). Kept commented out so it is never scheduled by accident; run it once the
-- app is deployed with the route:
--
-- select cron.schedule(
--   'partner-payins',
--   '*/15 * * * *',
--   $$
--   select net.http_get(
--     url := 'https://shopinbos-app.vercel.app/api/cron/partner-payins',
--     headers := jsonb_build_object(
--       'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
--     ),
--     timeout_milliseconds := 60000
--   );
--   $$
-- )
-- where not exists (select 1 from cron.job where jobname = 'partner-payins');
--
-- To stop it:
--   select cron.unschedule('partner-payins');
