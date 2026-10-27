-- Preorder deposits and "Stock is ready" (shared/preorder.ts). A supplier can ask shops for part of a preorder up
-- front (SupplierProduct.preorderDepositPct); the bulk order keeps the deposit asked, when it was paid and its
-- Paystack reference, and when the supplier said the stock is ready (the rest is due from then).
-- Additive only: new columns with defaults or nulls, and a unique index on the new reference. No new table, so no
-- new RLS. Safe to run more than once. Run BEFORE deploying: the app reads these columns.

ALTER TABLE "SupplierProduct" ADD COLUMN IF NOT EXISTS "preorderDepositPct" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "WholesaleOrder" ADD COLUMN IF NOT EXISTS "preorderReadyAt" TIMESTAMP(3);
ALTER TABLE "WholesaleOrder" ADD COLUMN IF NOT EXISTS "depositKobo" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "WholesaleOrder" ADD COLUMN IF NOT EXISTS "depositPaidAt" TIMESTAMP(3);
ALTER TABLE "WholesaleOrder" ADD COLUMN IF NOT EXISTS "depositRef" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "WholesaleOrder_depositRef_key" ON "WholesaleOrder"("depositRef");
