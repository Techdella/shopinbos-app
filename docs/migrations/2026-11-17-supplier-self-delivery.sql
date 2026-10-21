-- Suppliers that deliver their own parcels ("I deliver myself"): offered at checkout, fee paid to the supplier in
-- the order's split, delivered with the customer's 4-digit code. Additive and safe to run more than once.
ALTER TABLE "DeliverySettings" ADD COLUMN IF NOT EXISTS "selfDelivery" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "DeliverySettings" ADD COLUMN IF NOT EXISTS "selfDeliveryFee" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "DeliverySettings" ADD COLUMN IF NOT EXISTS "selfDeliveryStates" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "SupplierOrder" ADD COLUMN IF NOT EXISTS "selfDelivery" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "SupplierOrder" ADD COLUMN IF NOT EXISTS "deliveryFee" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "SupplierOrder" ADD COLUMN IF NOT EXISTS "deliveryCode" TEXT;
