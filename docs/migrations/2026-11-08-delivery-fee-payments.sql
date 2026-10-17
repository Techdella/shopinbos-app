-- Delivery-fee payments: a seller pays a delivery partner's fee by card in Shopinbos, split by Paystack straight to
-- the partner's own bank through their Shopinbos Wallet (src/lib/logistics/delivery-fee-payments.server.ts).
--
--   * "DeliveryBooking".feePaidAt / feePaymentRef: when the fee was paid, and the Paystack reference (unique, so a
--     replayed webhook or the popup and the webhook together record it once).
--
-- Additive only, safe to run more than once. Run BEFORE deploying the code that uses it.

ALTER TABLE "DeliveryBooking" ADD COLUMN IF NOT EXISTS "feePaidAt" TIMESTAMP(3);
ALTER TABLE "DeliveryBooking" ADD COLUMN IF NOT EXISTS "feePaymentRef" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "DeliveryBooking_feePaymentRef_key" ON "DeliveryBooking"("feePaymentRef");
