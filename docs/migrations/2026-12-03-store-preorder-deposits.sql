-- Store preorder deposits (shared/preorder.ts storeOrderDeposit; src/lib/commerce/store-balance.server.ts). A seller
-- can ask shoppers for part of a preorder at checkout (StoreProduct.preorderDepositPct) and the rest once the stock is
-- ready. The store order keeps what was charged first (depositKobo) and what's left (balanceKobo), when each part was
-- paid, the balance's own Paystack reference and split, and when the shopper was asked for it / it's due.
-- Additive only: new columns with defaults or nulls, and a unique index on the new reference. No new table, so no
-- new RLS. Safe to run more than once. Run BEFORE deploying: the app reads these columns.

ALTER TABLE "StoreProduct" ADD COLUMN IF NOT EXISTS "preorderDepositPct" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "RetailOrder" ADD COLUMN IF NOT EXISTS "depositKobo" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "RetailOrder" ADD COLUMN IF NOT EXISTS "balanceKobo" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "RetailOrder" ADD COLUMN IF NOT EXISTS "depositPaidAt" TIMESTAMP(3);
ALTER TABLE "RetailOrder" ADD COLUMN IF NOT EXISTS "balanceSplit" JSONB;
ALTER TABLE "RetailOrder" ADD COLUMN IF NOT EXISTS "balanceRef" TEXT;
ALTER TABLE "RetailOrder" ADD COLUMN IF NOT EXISTS "balancePaidAt" TIMESTAMP(3);
ALTER TABLE "RetailOrder" ADD COLUMN IF NOT EXISTS "balancePaidVia" TEXT;
ALTER TABLE "RetailOrder" ADD COLUMN IF NOT EXISTS "balanceRequestedAt" TIMESTAMP(3);
ALTER TABLE "RetailOrder" ADD COLUMN IF NOT EXISTS "balanceDueAt" TIMESTAMP(3);
CREATE UNIQUE INDEX IF NOT EXISTS "RetailOrder_balanceRef_key" ON "RetailOrder"("balanceRef");
