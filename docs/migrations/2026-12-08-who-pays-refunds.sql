-- Who pays when things go wrong, first batch (shared/order-refunds.ts): customers' refunds the seller sends from their
-- own bank (Shopinbos never holds money), and the supplier's ship-by deadline for late handling.
-- Additive only: one new table and two nullable columns; nothing changed or removed. Safe to run more than once.
-- Run BEFORE deploying this code (order pages, the seller's order page and the supplier cron read these).

CREATE TABLE IF NOT EXISTS "OrderRefund" (
  "id" TEXT NOT NULL,
  "sourceKey" TEXT NOT NULL,
  "retailOrderId" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "sellerId" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "fault" TEXT NOT NULL DEFAULT 'seller',
  "supplierOrderId" TEXT,
  "amountKobo" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'NGN',
  "status" TEXT NOT NULL DEFAULT 'awaiting_account',
  "note" TEXT,
  "bankName" TEXT,
  "accountNumber" TEXT,
  "accountName" TEXT,
  "accountGivenAt" TIMESTAMP(3),
  "sentAt" TIMESTAMP(3),
  "sentReference" TEXT,
  "confirmedAt" TIMESTAMP(3),
  "disputedAt" TIMESTAMP(3),
  "disputeNote" TEXT,
  "remindedAt" TIMESTAMP(3),
  "debtId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OrderRefund_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "OrderRefund_sourceKey_key" ON "OrderRefund" ("sourceKey");
CREATE INDEX IF NOT EXISTS "OrderRefund_retailOrderId_idx" ON "OrderRefund" ("retailOrderId");
CREATE INDEX IF NOT EXISTS "OrderRefund_storeId_status_idx" ON "OrderRefund" ("storeId", "status");
CREATE INDEX IF NOT EXISTS "OrderRefund_status_updatedAt_idx" ON "OrderRefund" ("status", "updatedAt");

ALTER TABLE "SupplierOrder" ADD COLUMN IF NOT EXISTS "shipBy" TIMESTAMP(3);
ALTER TABLE "SupplierOrder" ADD COLUMN IF NOT EXISTS "lateAt" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "SupplierOrder_status_shipBy_idx" ON "SupplierOrder" ("status", "shipBy");
