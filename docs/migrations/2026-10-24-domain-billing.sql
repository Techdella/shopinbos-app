-- Sellers buy and renew domains through Shopinbos, paying first (src/lib/domains/billing.server.ts).
--
--   * "DomainPurchase": one row per checkout (a new domain or a yearly renewal). The seller pays through Paystack;
--     only a verified payment moves it paid → buying (one caller, conditional UPDATE) → bought on Vercel's
--     registrar, otherwise the payment is refunded (refunded, or refund_failed for the team to handle by hand).
--     The latest bought row per domain holds expiresAt, the reminders sent (remindersSent) and the reusable card
--     authorization for the renewal charge 7 days before expiry.
--
-- Additive only, safe to run more than once. RLS is on with no policies: only the app's server connection (which
-- bypasses RLS) reads or writes it. Run BEFORE deploying the code that uses it.

CREATE TABLE IF NOT EXISTS "DomainPurchase" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "domain" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "years" INTEGER NOT NULL DEFAULT 1,
  "costUsd" DOUBLE PRECISION NOT NULL,
  "amountNgn" INTEGER NOT NULL,
  "reference" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending_payment',
  "payerEmail" TEXT,
  "vercelOrderId" TEXT,
  "contactInformation" JSONB,
  "paystackAuthorization" JSONB,
  "remindersSent" JSONB NOT NULL DEFAULT '[]',
  "paidAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3),
  "error" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DomainPurchase_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "DomainPurchase_reference_key" ON "DomainPurchase"("reference");
CREATE INDEX IF NOT EXISTS "DomainPurchase_storeId_idx" ON "DomainPurchase"("storeId");
CREATE INDEX IF NOT EXISTS "DomainPurchase_status_idx" ON "DomainPurchase"("status");
CREATE INDEX IF NOT EXISTS "DomainPurchase_expiresAt_idx" ON "DomainPurchase"("expiresAt");

ALTER TABLE "DomainPurchase" ENABLE ROW LEVEL SECURITY;

-- Renewals: /api/cron/domain-renewals runs once a day. It finishes registrar orders still in progress, reminds
-- sellers 30, 7 and 1 days before a bought domain expires (bell + email, "Renew for ₦X"), tries the saved card 7
-- days before, and 3 days after an unrenewed expiry takes the domain off the store and the Vercel project.
-- Call it from pg_cron like the other jobs (reuses the "cron_secret" Vault secret = CRON_SECRET in Vercel). Run once
-- the app is deployed with the route (kept commented out so it is never run by accident):
--
-- select cron.schedule(
--   'domain-renewals',
--   '17 7 * * *',
--   $$
--   select net.http_get(
--     url := 'https://shopinbos-app.vercel.app/api/cron/domain-renewals',
--     headers := jsonb_build_object(
--       'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
--     ),
--     timeout_milliseconds := 120000
--   );
--   $$
-- )
-- where not exists (select 1 from cron.job where jobname = 'domain-renewals');
--
-- To stop it:
--   select cron.unschedule('domain-renewals');
