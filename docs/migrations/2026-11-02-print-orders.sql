-- Print orders: sellers order printed packaging from a saved design (/home/labels/order), paid with Paystack and
-- worked by the team at /admin/print-orders. Additive only, safe to run more than once. RLS on with no policies.

CREATE TABLE IF NOT EXISTS "PrintOrder" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "designId" TEXT,
  "title" TEXT NOT NULL,
  "format" TEXT NOT NULL,
  "design" JSONB NOT NULL,
  "previewUrl" TEXT,
  "quantity" INTEGER NOT NULL,
  "material" TEXT NOT NULL,
  "finish" TEXT NOT NULL,
  "unitPrice" INTEGER NOT NULL,
  "setupFee" INTEGER NOT NULL,
  "deliveryFee" INTEGER NOT NULL,
  "total" INTEGER NOT NULL,
  "days" INTEGER NOT NULL,
  "zone" TEXT NOT NULL,
  "contactName" TEXT NOT NULL,
  "contactPhone" TEXT NOT NULL,
  "contactEmail" TEXT,
  "address" TEXT,
  "city" TEXT,
  "state" TEXT,
  "notes" TEXT,
  "paymentRef" TEXT,
  "paidAt" TIMESTAMP(3),
  "status" TEXT NOT NULL DEFAULT 'awaiting_payment',
  "tracking" TEXT,
  "adminNotes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PrintOrder_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "PrintOrder_paymentRef_key" ON "PrintOrder"("paymentRef");
CREATE INDEX IF NOT EXISTS "PrintOrder_storeId_createdAt_idx" ON "PrintOrder"("storeId", "createdAt");
CREATE INDEX IF NOT EXISTS "PrintOrder_status_createdAt_idx" ON "PrintOrder"("status", "createdAt");
ALTER TABLE "PrintOrder" ENABLE ROW LEVEL SECURITY;
