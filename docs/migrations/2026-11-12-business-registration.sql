-- Businesses register their business name with CAC through Shopinbos (src/lib/business-registration, CAC's VAS
-- Business Name Registration API).
--
--   * "BusinessRegistration": one row per application. The owner checks the name (free), fills in their details and
--     uploads a passport photo, signature and ID (private bucket), pays through Paystack, and only a verified payment
--     is filed with CAC (paid → submitting, one caller). CAC's status is read every 30 minutes
--     (/api/cron/business-registrations): pending → approved (BN number + certificate) or queried (the owner answers
--     in the app). If CAC refuses the filing outright, the payment is refunded.
--
-- Additive only, safe to run more than once. RLS is on with no policies: only the app's server connection (which
-- bypasses RLS) reads or writes it. Run BEFORE deploying the code that uses it.

CREATE TABLE IF NOT EXISTS "BusinessRegistration" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "proposedName" TEXT NOT NULL,
  "lineOfBusiness" TEXT NOT NULL,
  "form" JSONB NOT NULL,
  "filePaths" JSONB NOT NULL DEFAULT '{}',
  "nameCheck" JSONB,
  "amountNgn" INTEGER NOT NULL,
  "reference" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "payerEmail" TEXT,
  "transactionRef" TEXT,
  "rcNumber" TEXT,
  "queries" JSONB NOT NULL DEFAULT '[]',
  "paidAt" TIMESTAMP(3),
  "submittedAt" TIMESTAMP(3),
  "approvedAt" TIMESTAMP(3),
  "checkedAt" TIMESTAMP(3),
  "error" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BusinessRegistration_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "BusinessRegistration_reference_key" ON "BusinessRegistration"("reference");
CREATE UNIQUE INDEX IF NOT EXISTS "BusinessRegistration_transactionRef_key" ON "BusinessRegistration"("transactionRef");
CREATE INDEX IF NOT EXISTS "BusinessRegistration_userId_idx" ON "BusinessRegistration"("userId");
CREATE INDEX IF NOT EXISTS "BusinessRegistration_status_idx" ON "BusinessRegistration"("status");

ALTER TABLE "BusinessRegistration" ENABLE ROW LEVEL SECURITY;

-- Status checks every 30 minutes, for applications with CAC. QStash runs it once docs/qstash.md is done; until then:
-- select cron.schedule(
--   'business-registrations',
--   '*/30 * * * *',
--   $$
--   select net.http_get(
--     url := 'https://app.shopinbos.com/api/cron/business-registrations',
--     headers := jsonb_build_object('Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')),
--     timeout_milliseconds := 120000
--   );
--   $$
-- )
-- where not exists (select 1 from cron.job where jobname = 'business-registrations');
