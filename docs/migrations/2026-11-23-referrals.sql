-- Refer & earn (shared/referrals.ts, src/lib/referrals/service.server.ts).
CREATE TABLE IF NOT EXISTS "ReferralCode" (
  "code" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "rewardChoice" TEXT NOT NULL DEFAULT 'months',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "ReferralCode_userId_key" ON "ReferralCode"("userId");

CREATE TABLE IF NOT EXISTS "Referral" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "code" TEXT NOT NULL,
  "referrerId" TEXT NOT NULL,
  "refereeId" TEXT NOT NULL,
  "refereeRole" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'signed_up',
  "reason" TEXT,
  "welcomeReward" JSONB,
  "referrerReward" JSONB,
  "qualifiedAt" TIMESTAMP(3),
  "rewardedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "Referral_refereeId_key" ON "Referral"("refereeId");
CREATE INDEX IF NOT EXISTS "Referral_referrerId_status_idx" ON "Referral"("referrerId", "status");
CREATE INDEX IF NOT EXISTS "Referral_status_createdAt_idx" ON "Referral"("status", "createdAt");

-- Free paid-plan time outside Paystack (referral rewards and welcome gifts).
CREATE TABLE IF NOT EXISTS "PlanGrant" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "tier" TEXT NOT NULL,
  "startsAt" TIMESTAMP(3) NOT NULL,
  "endsAt" TIMESTAMP(3) NOT NULL,
  "source" TEXT NOT NULL,
  "reference" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "PlanGrant_reference_key" ON "PlanGrant"("reference");
CREATE INDEX IF NOT EXISTS "PlanGrant_userId_endsAt_idx" ON "PlanGrant"("userId", "endsAt");
CREATE INDEX IF NOT EXISTS "PlanGrant_endsAt_idx" ON "PlanGrant"("endsAt");

ALTER TABLE "ReferralCode" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Referral" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PlanGrant" ENABLE ROW LEVEL SECURITY;

-- The hourly referrals job (/api/cron/referrals): rewards invites that now count and applies free plan time.
select cron.schedule(
  'referrals',
  '41 * * * *',
  $$
  select net.http_get(
    url := 'https://app.shopinbos.com/api/cron/referrals',
    headers := jsonb_build_object('Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')),
    timeout_milliseconds := 120000
  );
  $$
)
where not exists (select 1 from cron.job where jobname = 'referrals');
