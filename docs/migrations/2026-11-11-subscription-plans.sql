-- Subscription plans managed from Admin › Pricing › Plans (shared/plan-catalog.ts, src/lib/plans/catalog.server.ts).
-- "SubscriptionPlanVersion" lists every Paystack plan code Shopinbos sells or has sold; a price change adds a row.
-- Seeded with today's six plans so nothing changes on deploy. Monthly AI credits per tier are PlatformSetting rows
-- ("plan.<tier>.credits"), created when an admin first saves them; until then the built-in numbers apply.
--
-- Additive only, safe to run more than once. Run BEFORE deploying.

CREATE TABLE IF NOT EXISTS "SubscriptionPlanVersion" (
  "code" TEXT NOT NULL,
  "tier" TEXT NOT NULL,
  "billing" TEXT NOT NULL,
  "amountNgn" INTEGER,
  "current" BOOLEAN NOT NULL DEFAULT false,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "retiredAt" TIMESTAMP(3),
  CONSTRAINT "SubscriptionPlanVersion_pkey" PRIMARY KEY ("code")
);
CREATE INDEX IF NOT EXISTS "SubscriptionPlanVersion_tier_billing_current_idx" ON "SubscriptionPlanVersion"("tier", "billing", "current");
DO $$ BEGIN
  ALTER TABLE "SubscriptionPlanVersion" ADD CONSTRAINT "SubscriptionPlanVersion_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

INSERT INTO "SubscriptionPlanVersion" ("code", "tier", "billing", "amountNgn", "current") VALUES
  ('PLN_8ou289e71czicvm', 'seller_growth', 'monthly', 8000, true),
  ('PLN_q1k3ssxpx7rxxuz', 'seller_growth', 'annual', 80000, true),
  ('PLN_2gph11w3yd0250y', 'seller_pro', 'monthly', 18000, true),
  ('PLN_9gma70ofldhbj4r', 'seller_pro', 'annual', 180000, true),
  ('PLN_q78304vgj7p35o6', 'supplier_max', 'monthly', 25000, true),
  ('PLN_0a6z6ns429ohli1', 'supplier_max', 'annual', NULL, false)
ON CONFLICT ("code") DO NOTHING;

-- Server-only: no policies, so the anon and authenticated roles can't read it through the Supabase API.
ALTER TABLE "SubscriptionPlanVersion" ENABLE ROW LEVEL SECURITY;
