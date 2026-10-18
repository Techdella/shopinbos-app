-- Paystack split at checkout (src/lib/commerce/payment-split.ts, docs/paystack-split.md).
--
--   * "RetailOrder"."paymentSplit": how a card order was paid: { mode: "split", subaccount, sellerShare,
--     platformShare, fee, supplierCost, deliveryHeld, affiliate, balanceApplied } or { mode: "held", reason }.
--   * "SellerBalanceEntry": the seller's running balance with Shopinbos. A refunded split order adds what the seller
--     owes ("refund", +); later split orders that take it back add "recovered" (-). One entry per order and kind.
--
-- Additive only, safe to run more than once. Run BEFORE deploying. Splits stay off until PAYSTACK_SPLITS=on.

ALTER TABLE "RetailOrder" ADD COLUMN IF NOT EXISTS "paymentSplit" JSONB;

CREATE TABLE IF NOT EXISTS "SellerBalanceEntry" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "amount" DOUBLE PRECISION NOT NULL,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SellerBalanceEntry_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "SellerBalanceEntry_orderId_kind_key" ON "SellerBalanceEntry"("orderId", "kind");
CREATE INDEX IF NOT EXISTS "SellerBalanceEntry_storeId_idx" ON "SellerBalanceEntry"("storeId");

-- Server-only: no policies, so the anon and authenticated roles can't read it through the Supabase API.
ALTER TABLE "SellerBalanceEntry" ENABLE ROW LEVEL SECURITY;
