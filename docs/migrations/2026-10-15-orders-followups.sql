-- Orders follow-ups: bank-transfer payment window, automatic refunds for late payments, discount uses given back,
-- wholesale stock reservations, and supplier payouts marked paid.
--
--   * "RetailOrder"."paymentDueAt": when an unpaid order lets its stock go (card 30 min, bank transfer 24 h or the
--     seller's own time). Set at checkout; null on older orders, whose window is worked out from "createdAt".
--   * "RetailOrder"."discountReleasedAt": the discount/coupon use the order took was given back (it expired or was
--     cancelled before payment), so it's only ever given back once.
--   * "RetailOrder"."refundStatus" / "refundId" / "refundedAt": the automatic Paystack refund of a payment that
--     arrived after the order expired and its stock sold (src/lib/commerce/refunds*.ts).
--   * "WholesaleOrder"."stockReserved" / "stockReleasedAt": supplier stock taken when the order is placed and given
--     back once when it's declined or cancelled. Older orders reserved nothing (0) and give nothing back.
--   * "WholesaleOrder"."paidOutAt" / "SupplierOrder"."paidOutAt": the supplier confirmed they were paid.
--
-- Additive only, no new tables (RLS is already on for "RetailOrder", "WholesaleOrder" and "SupplierOrder"; the
-- statements below make sure). Safe to run more than once. Run BEFORE deploying the code that uses it (Prisma
-- selects every column).

ALTER TABLE "RetailOrder" ADD COLUMN IF NOT EXISTS "paymentDueAt" TIMESTAMP(3);
ALTER TABLE "RetailOrder" ADD COLUMN IF NOT EXISTS "discountReleasedAt" TIMESTAMP(3);
ALTER TABLE "RetailOrder" ADD COLUMN IF NOT EXISTS "refundStatus" TEXT;
ALTER TABLE "RetailOrder" ADD COLUMN IF NOT EXISTS "refundId" TEXT;
ALTER TABLE "RetailOrder" ADD COLUMN IF NOT EXISTS "refundedAt" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "RetailOrder_refundId_idx" ON "RetailOrder"("refundId");

ALTER TABLE "WholesaleOrder" ADD COLUMN IF NOT EXISTS "stockReserved" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "WholesaleOrder" ADD COLUMN IF NOT EXISTS "stockReleasedAt" TIMESTAMP(3);
ALTER TABLE "WholesaleOrder" ADD COLUMN IF NOT EXISTS "paidOutAt" TIMESTAMP(3);

ALTER TABLE "SupplierOrder" ADD COLUMN IF NOT EXISTS "paidOutAt" TIMESTAMP(3);

ALTER TABLE "RetailOrder" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WholesaleOrder" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SupplierOrder" ENABLE ROW LEVEL SECURITY;
