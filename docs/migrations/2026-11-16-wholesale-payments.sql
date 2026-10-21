-- Wholesale orders paid in Shopinbos (src/lib/supplier-orders/wholesale-payments.server.ts): once the supplier
-- accepts, the seller can pay by card; Paystack splits it all to the supplier's Shopinbos Wallet subaccount (less
-- any overdue money the supplier owes), so it settles straight to the supplier's bank. Paying them directly still
-- works as before.
--
-- Additive only, safe to run more than once. Run BEFORE deploying the code that uses it.

ALTER TABLE "WholesaleOrder" ADD COLUMN IF NOT EXISTS "paidAt" TIMESTAMP(3);
ALTER TABLE "WholesaleOrder" ADD COLUMN IF NOT EXISTS "paymentRef" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "WholesaleOrder_paymentRef_key" ON "WholesaleOrder"("paymentRef");
