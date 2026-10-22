-- Payment links with saved delivery: the customer's address and either a delivery fee the seller agreed (0 = free)
-- or one of the store's delivery options. With both saved, the pay page is one tap ("Delivery: Doorstep to Wuse 2,
-- Abuja · included" and a Pay button) and checkout uses exactly this address and delivery.
-- Additive and safe to run more than once.
ALTER TABLE "PaymentLink" ADD COLUMN IF NOT EXISTS "deliveryStreet" TEXT;
ALTER TABLE "PaymentLink" ADD COLUMN IF NOT EXISTS "deliveryCity" TEXT;
ALTER TABLE "PaymentLink" ADD COLUMN IF NOT EXISTS "deliveryState" TEXT;
ALTER TABLE "PaymentLink" ADD COLUMN IF NOT EXISTS "deliveryLandmark" TEXT;
ALTER TABLE "PaymentLink" ADD COLUMN IF NOT EXISTS "deliveryFee" DOUBLE PRECISION;
ALTER TABLE "PaymentLink" ADD COLUMN IF NOT EXISTS "deliveryOptionId" TEXT;
