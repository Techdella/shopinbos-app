-- Suppliers receive orders (dropship + wholesale) and unpaid orders stop holding stock forever.
--
--   * "SupplierOrder": what a supplier ships for a seller's store order (one per store order and supplier),
--     created when the order is paid (or placed, for pay on delivery). src/lib/supplier-orders/*.
--   * "RetailOrder": the stock checkout took while the order waits for payment ("stockHold"), when it was given
--     back ("stockReleasedAt"), when an unpaid order expired ("expiredAt") and a payment problem to look at
--     ("paymentIssue", e.g. paid after it expired and the stock was gone, so the buyer needs a refund).
--   * "WholesaleOrder": the supplier's reason for declining, and when it shipped / was delivered.
--
-- Additive only. Safe to run more than once. RLS on for the new table with no policies: only the server
-- (Prisma, service role) reads it. Run BEFORE deploying the code that uses it (Prisma selects every column).

CREATE TABLE IF NOT EXISTS "SupplierOrder" (
    "id" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "retailOrderId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "items" JSONB NOT NULL DEFAULT '[]',
    "costTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'NGN',
    "shippingAddress" JSONB NOT NULL DEFAULT '{}',
    "recipientName" TEXT NOT NULL,
    "recipientPhone" TEXT,
    "trackingCode" TEXT,
    "carrier" TEXT,
    "rejectReason" TEXT,
    "acceptedAt" TIMESTAMP(3),
    "shippedAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SupplierOrder_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "SupplierOrder_idempotencyKey_key" ON "SupplierOrder"("idempotencyKey");
CREATE INDEX IF NOT EXISTS "SupplierOrder_supplierId_status_idx" ON "SupplierOrder"("supplierId", "status");
CREATE INDEX IF NOT EXISTS "SupplierOrder_retailOrderId_idx" ON "SupplierOrder"("retailOrderId");
CREATE INDEX IF NOT EXISTS "SupplierOrder_storeId_idx" ON "SupplierOrder"("storeId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SupplierOrder_supplierId_fkey') THEN
    ALTER TABLE "SupplierOrder" ADD CONSTRAINT "SupplierOrder_supplierId_fkey"
      FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SupplierOrder_retailOrderId_fkey') THEN
    ALTER TABLE "SupplierOrder" ADD CONSTRAINT "SupplierOrder_retailOrderId_fkey"
      FOREIGN KEY ("retailOrderId") REFERENCES "RetailOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

ALTER TABLE "SupplierOrder" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "RetailOrder" ADD COLUMN IF NOT EXISTS "stockHold" JSONB;
ALTER TABLE "RetailOrder" ADD COLUMN IF NOT EXISTS "stockReleasedAt" TIMESTAMP(3);
ALTER TABLE "RetailOrder" ADD COLUMN IF NOT EXISTS "expiredAt" TIMESTAMP(3);
ALTER TABLE "RetailOrder" ADD COLUMN IF NOT EXISTS "paymentIssue" TEXT;
CREATE INDEX IF NOT EXISTS "RetailOrder_status_createdAt_idx" ON "RetailOrder"("status", "createdAt");

ALTER TABLE "WholesaleOrder" ADD COLUMN IF NOT EXISTS "rejectReason" TEXT;
ALTER TABLE "WholesaleOrder" ADD COLUMN IF NOT EXISTS "shippedAt" TIMESTAMP(3);
ALTER TABLE "WholesaleOrder" ADD COLUMN IF NOT EXISTS "deliveredAt" TIMESTAMP(3);
