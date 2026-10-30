-- Pay small small, ajo and group buy (pilot features "pay_small_small", "ajo", "group_buy"; all OFF by default in
-- Admin › Pilot features). Rules: shared/instalments.ts, shared/ajo.ts, shared/group-buy.ts. Server:
-- src/lib/pay-together/*.server.ts, Paystack calls in src/lib/paystack/plans.server.ts.
--
-- THE RULE: SHOPINBOS NEVER HOLDS MONEY. Holding savings or contributions is deposit-taking and needs a CBN licence.
-- Every naira a shopper pays here is its own Paystack transaction, SPLIT AT THE MOMENT IT IS PAID: the seller's share
-- settles straight to the seller's own bank through their Paystack subaccount, and Shopinbos's fee is the split's
-- transaction_charge (the same rule as store checkout, src/lib/wallet/rules.ts paystackSplitParams). Even
-- group buy's small card check (₦50) is split to the seller too (no fee): it comes off the group price, or the shop sends it back.
--
--   * "ProductPayOption":  a product's other ways to buy, set by the seller (Pay small small on/off, allowed weeks,
--                          price lock, refund rule; Group buy on/off, group price in kobo, size, hours open).
--   * "InstalmentPlan":    one shopper paying for one product in 4/6/8 weekly parts (kobo). status pending | active |
--                          completed | cancelled | defaulted. authorizationCode is Paystack's reusable authorization
--                          code (a token, not card data), sealed when INTEGRATIONS_ENCRYPTION_KEY is set, kept only
--                          when the shopper ticked "Pay automatically each week".
--   * "InstalmentPayment": each part's payment (reference PSS-…, unique: the webhook is idempotent on it).
--   * "AjoGroup", "AjoMember", "AjoContribution": a product ajo run by a seller; each contribution is its own split
--                          payment (reference AJO-…, unique).
--   * "GroupBuy", "GroupBuyMember": a group buy; members' card checks (GBV-…) and group-price charges (GBC-…).
--
-- PILOT NOTES FOR THE TEAM (not shown in the app):
--   * GET A LAWYER TO CHECK THESE RULES BEFORE LAUNCH: the ajo default rules (2 days' grace then removed and lose
--     their turn; what happens to a removed member's paid weeks is the seller's call), the Pay small small refund
--     rule preset ("Money back within 7 days, minus ₦1,000"), and the group buy card check.
--   * Ask Paystack support to confirm charge_authorization with a subaccount + transaction_charge (split) is enabled
--     on the live account (autopay and group-buy charges use it), and that a ₦50 card check can be split to a subaccount with no transaction_charge.
--   * Members are verified by phone code only. BVN / NIN checks are not available in this pilot.
--
-- No foreign keys to existing tables (rows outlive deleted products and orders as a record of what was paid).
-- Supabase turns on row level security for new tables; the app reads and writes them through Prisma's service
-- connection, so no policies are needed.
--
-- Additive only, safe to run more than once. Run BEFORE switching the pilot features on (until then the screens say
-- they aren't ready and the storefront shows nothing new).

CREATE TABLE IF NOT EXISTS "ProductPayOption" (
  "id" TEXT PRIMARY KEY,
  "productId" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "paySmallOn" BOOLEAN NOT NULL DEFAULT false,
  "paySmallWeeks" INTEGER[] NOT NULL DEFAULT ARRAY[4, 6, 8]::INTEGER[],
  "priceLock" BOOLEAN NOT NULL DEFAULT true,
  "refundRule" TEXT NOT NULL DEFAULT 'Money back within 7 days, minus ₦1,000',
  "groupBuyOn" BOOLEAN NOT NULL DEFAULT false,
  "groupPriceKobo" INTEGER,
  "groupSize" INTEGER,
  "groupHours" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProductPayOption_groupSize_range" CHECK ("groupSize" IS NULL OR ("groupSize" >= 2 AND "groupSize" <= 20))
);
CREATE UNIQUE INDEX IF NOT EXISTS "ProductPayOption_productId_key" ON "ProductPayOption" ("productId");
CREATE INDEX IF NOT EXISTS "ProductPayOption_storeId_idx" ON "ProductPayOption" ("storeId");

CREATE TABLE IF NOT EXISTS "InstalmentPlan" (
  "id" TEXT PRIMARY KEY,
  "storeId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "variantId" TEXT,
  "variantLabel" TEXT,
  "productName" TEXT NOT NULL,
  "productImage" TEXT,
  "quantity" INTEGER NOT NULL DEFAULT 1,
  "buyerName" TEXT NOT NULL,
  "buyerEmail" TEXT NOT NULL,
  "buyerPhone" TEXT,
  "deliveryAddress" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "shopperId" TEXT,
  "weeks" INTEGER NOT NULL,
  "weeklyKobo" INTEGER NOT NULL,
  "totalKobo" INTEGER NOT NULL,
  "amountsKobo" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
  "feeKobo" INTEGER NOT NULL DEFAULT 0,
  "paidCount" INTEGER NOT NULL DEFAULT 0,
  "paidKobo" INTEGER NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "priceLock" BOOLEAN NOT NULL DEFAULT true,
  "refundRule" TEXT NOT NULL,
  "startedAt" TIMESTAMP(3),
  "nextDueAt" TIMESTAMP(3),
  "autopay" BOOLEAN NOT NULL DEFAULT false,
  "authorizationCode" TEXT,
  "authorizationEmail" TEXT,
  "cardLast4" TEXT,
  "remindedN" INTEGER NOT NULL DEFAULT 0,
  "autopayTriedN" INTEGER NOT NULL DEFAULT 0,
  "stockHeld" INTEGER NOT NULL DEFAULT 0,
  "orderId" TEXT,
  "defaultedAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "refundStatus" TEXT,
  "refundNote" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InstalmentPlan_weeks_check" CHECK ("weeks" IN (4, 6, 8)),
  CONSTRAINT "InstalmentPlan_status_check" CHECK ("status" IN ('pending', 'active', 'completed', 'cancelled', 'defaulted'))
);
CREATE UNIQUE INDEX IF NOT EXISTS "InstalmentPlan_orderId_key" ON "InstalmentPlan" ("orderId");
CREATE INDEX IF NOT EXISTS "InstalmentPlan_storeId_status_idx" ON "InstalmentPlan" ("storeId", "status");
CREATE INDEX IF NOT EXISTS "InstalmentPlan_status_nextDueAt_idx" ON "InstalmentPlan" ("status", "nextDueAt");
CREATE INDEX IF NOT EXISTS "InstalmentPlan_productId_status_idx" ON "InstalmentPlan" ("productId", "status");

CREATE TABLE IF NOT EXISTS "InstalmentPayment" (
  "id" TEXT PRIMARY KEY,
  "planId" TEXT NOT NULL REFERENCES "InstalmentPlan" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "n" INTEGER NOT NULL,
  "amountKobo" INTEGER NOT NULL,
  "feeKobo" INTEGER NOT NULL DEFAULT 0,
  "sellerKobo" INTEGER NOT NULL DEFAULT 0,
  "reference" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "via" TEXT NOT NULL DEFAULT 'card',
  "extra" BOOLEAN NOT NULL DEFAULT false,
  "paidAt" TIMESTAMP(3),
  "split" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InstalmentPayment_status_check" CHECK ("status" IN ('pending', 'paid', 'failed'))
);
CREATE UNIQUE INDEX IF NOT EXISTS "InstalmentPayment_reference_key" ON "InstalmentPayment" ("reference");
CREATE INDEX IF NOT EXISTS "InstalmentPayment_planId_n_idx" ON "InstalmentPayment" ("planId", "n");
CREATE INDEX IF NOT EXISTS "InstalmentPayment_status_createdAt_idx" ON "InstalmentPayment" ("status", "createdAt");

CREATE TABLE IF NOT EXISTS "AjoGroup" (
  "id" TEXT PRIMARY KEY,
  "storeId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "variantId" TEXT,
  "variantLabel" TEXT,
  "productName" TEXT NOT NULL,
  "productImage" TEXT,
  "itemPriceKobo" INTEGER NOT NULL,
  "size" INTEGER NOT NULL,
  "weeklyKobo" INTEGER NOT NULL,
  "depositKobo" INTEGER NOT NULL DEFAULT 0,
  "rules" TEXT NOT NULL,
  "startDay" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'forming',
  "drawSeed" TEXT,
  "drawnAt" TIMESTAMP(3),
  "orderSetBy" TEXT,
  "shippedWeeks" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  CONSTRAINT "AjoGroup_size_range" CHECK ("size" >= 2 AND "size" <= 20),
  CONSTRAINT "AjoGroup_status_check" CHECK ("status" IN ('forming', 'running', 'completed', 'cancelled'))
);
CREATE INDEX IF NOT EXISTS "AjoGroup_storeId_status_idx" ON "AjoGroup" ("storeId", "status");
CREATE INDEX IF NOT EXISTS "AjoGroup_status_startDay_idx" ON "AjoGroup" ("status", "startDay");

CREATE TABLE IF NOT EXISTS "AjoMember" (
  "id" TEXT PRIMARY KEY,
  "groupId" TEXT NOT NULL REFERENCES "AjoGroup" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "name" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "deliveryAddress" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "shopperId" TEXT,
  "isNew" BOOLEAN NOT NULL DEFAULT true,
  "position" INTEGER,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "phoneVerifiedAt" TIMESTAMP(3),
  "rulesAcceptedAt" TIMESTAMP(3),
  "autopay" BOOLEAN NOT NULL DEFAULT false,
  "authorizationCode" TEXT,
  "authorizationEmail" TEXT,
  "cardLast4" TEXT,
  "remindedWeek" INTEGER NOT NULL DEFAULT 0,
  "autopayTriedWeek" INTEGER NOT NULL DEFAULT 0,
  "collectedWeek" INTEGER,
  "orderId" TEXT,
  "removedAt" TIMESTAMP(3),
  "removedReason" TEXT,
  "settlement" TEXT,
  "joinedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AjoMember_status_check" CHECK ("status" IN ('pending', 'active', 'collected', 'removed', 'left'))
);
CREATE UNIQUE INDEX IF NOT EXISTS "AjoMember_groupId_phone_key" ON "AjoMember" ("groupId", "phone");
CREATE INDEX IF NOT EXISTS "AjoMember_groupId_status_idx" ON "AjoMember" ("groupId", "status");

CREATE TABLE IF NOT EXISTS "AjoContribution" (
  "id" TEXT PRIMARY KEY,
  "groupId" TEXT NOT NULL REFERENCES "AjoGroup" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "memberId" TEXT NOT NULL REFERENCES "AjoMember" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "week" INTEGER NOT NULL,
  "amountKobo" INTEGER NOT NULL,
  "depositKobo" INTEGER NOT NULL DEFAULT 0,
  "feeKobo" INTEGER NOT NULL DEFAULT 0,
  "sellerKobo" INTEGER NOT NULL DEFAULT 0,
  "reference" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "via" TEXT NOT NULL DEFAULT 'card',
  "extra" BOOLEAN NOT NULL DEFAULT false,
  "paidAt" TIMESTAMP(3),
  "split" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AjoContribution_status_check" CHECK ("status" IN ('pending', 'paid', 'failed'))
);
CREATE UNIQUE INDEX IF NOT EXISTS "AjoContribution_reference_key" ON "AjoContribution" ("reference");
CREATE INDEX IF NOT EXISTS "AjoContribution_groupId_week_status_idx" ON "AjoContribution" ("groupId", "week", "status");
CREATE INDEX IF NOT EXISTS "AjoContribution_memberId_week_idx" ON "AjoContribution" ("memberId", "week");

CREATE TABLE IF NOT EXISTS "GroupBuy" (
  "id" TEXT PRIMARY KEY,
  "storeId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "variantId" TEXT,
  "variantLabel" TEXT,
  "productName" TEXT NOT NULL,
  "productImage" TEXT,
  "retailKobo" INTEGER NOT NULL,
  "priceKobo" INTEGER NOT NULL,
  "size" INTEGER NOT NULL,
  "endsAt" TIMESTAMP(3) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'open',
  "filledAt" TIMESTAMP(3),
  "chargedAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GroupBuy_size_range" CHECK ("size" >= 2 AND "size" <= 20),
  CONSTRAINT "GroupBuy_status_check" CHECK ("status" IN ('open', 'filled', 'charged', 'cancelled'))
);
CREATE INDEX IF NOT EXISTS "GroupBuy_storeId_status_idx" ON "GroupBuy" ("storeId", "status");
CREATE INDEX IF NOT EXISTS "GroupBuy_productId_status_idx" ON "GroupBuy" ("productId", "status");
CREATE INDEX IF NOT EXISTS "GroupBuy_status_endsAt_idx" ON "GroupBuy" ("status", "endsAt");

CREATE TABLE IF NOT EXISTS "GroupBuyMember" (
  "id" TEXT PRIMARY KEY,
  "groupId" TEXT NOT NULL REFERENCES "GroupBuy" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "name" TEXT NOT NULL,
  "phone" TEXT,
  "email" TEXT NOT NULL,
  "deliveryAddress" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "verifyReference" TEXT NOT NULL,
  "verifyRefundStatus" TEXT,
  "authorizationCode" TEXT,
  "authorizationEmail" TEXT,
  "cardLast4" TEXT,
  "chargeReference" TEXT,
  "chargeSplit" JSONB,
  "payDeadline" TIMESTAMP(3),
  "orderId" TEXT,
  "joinedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GroupBuyMember_status_check" CHECK ("status" IN ('pending', 'joined', 'charged', 'pay_link', 'dropped', 'cancelled'))
);
CREATE UNIQUE INDEX IF NOT EXISTS "GroupBuyMember_verifyReference_key" ON "GroupBuyMember" ("verifyReference");
CREATE UNIQUE INDEX IF NOT EXISTS "GroupBuyMember_chargeReference_key" ON "GroupBuyMember" ("chargeReference");
CREATE INDEX IF NOT EXISTS "GroupBuyMember_groupId_status_idx" ON "GroupBuyMember" ("groupId", "status");

ALTER TABLE "ProductPayOption" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "InstalmentPlan" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "InstalmentPayment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AjoGroup" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AjoMember" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AjoContribution" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "GroupBuy" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "GroupBuyMember" ENABLE ROW LEVEL SECURITY;

-- /api/cron/pay-together every hour: reminders the day before (8am–9pm Lagos), autopay charges on the due day (with
-- the same split), missed payments after 2 days' grace (plans defaulted, ajo members removed), group buys past their
-- deadline cancelled (nobody charged) and pay links past 2 hours dropped. Idempotent. Reuses the "cron_secret" Vault
-- secret (= CRON_SECRET in Vercel). Kept commented out so it is never scheduled by accident; run it once the app is
-- deployed with the route:
--
-- select cron.schedule(
--   'pay-together',
--   '23 * * * *',
--   $$
--   select net.http_get(
--     url := 'https://app.shopinbos.com/api/cron/pay-together',
--     headers := jsonb_build_object(
--       'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
--     ),
--     timeout_milliseconds := 60000
--   );
--   $$
-- )
-- where not exists (select 1 from cron.job where jobname = 'pay-together');
--
-- To stop it:
--   select cron.unschedule('pay-together');
