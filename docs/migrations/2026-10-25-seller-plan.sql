-- Free domain with an annual seller plan (src/lib/seller-plan.ts, src/lib/domains/billing.server.ts).
--
--   * "User" gains the plan Paystack's subscription webhooks report: planCode, planInterval (monthly | annual),
--     planStatus (active | non_renewing | cancelled), planPaidUntil (next payment date) and subscriptionCode.
--   * "DomainPurchase" gains coveredByPlan: a domain bought or renewed free because the seller is on an active,
--     paid-up annual Growth or Pro plan. Such rows have amountNgn 0 and no Paystack payment (nothing to refund).
--
-- Additive only, safe to run more than once. Run after 2026-10-24-domain-billing.sql and BEFORE deploying the code.

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "planCode" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "planInterval" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "planStatus" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "planPaidUntil" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "subscriptionCode" TEXT;

ALTER TABLE "DomainPurchase" ADD COLUMN IF NOT EXISTS "coveredByPlan" BOOLEAN NOT NULL DEFAULT false;
