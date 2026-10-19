-- Orders sent in more than one parcel, and sending an order to another supplier when one doesn't accept in time
-- (build spec 7.2: "REROUTED to next supplier with same product (max 2)").
--
--   * "RetailOrder": "ownShippedAt" / "ownDeliveredAt" (the seller's own-stock part of a mixed order was sent /
--     delivered) and "partlySentAt" (the first parcel left; the customer is told "part of your order is on its
--     way" once). The order moves to shipped only when every part has left, delivered when every part arrived.
--   * "SupplierOrder": "replacesId" (the expired order an automatic switch took over; kept for history) and
--     "undoneAt" (the seller pressed Undo before the new supplier accepted).
--   * "SupplierSwitch" (new): one row per expired supplier order saying what happened (switched | undone | none |
--     off | limit). Unique on the expired order, so a cron re-run never switches twice.
--   * "SupplierProduct": "familyKey" (the same product from several suppliers) and "variants" (sizes and colours).
--   * "Store": "autoSwitchSupplier" (default on) and the cost limit for a switch: "switchCostRule" ('cost' = at
--     most "switchMaxIncreasePct" (10) above the original cost; 'margin' = the seller keeps at least
--     "switchMinMarginPct" (20) of their price).
--
-- Additive only. Safe to run more than once. RLS on for the new table with no policies: only the server (Prisma,
-- service role) reads it. Run BEFORE deploying the code that uses it (Prisma selects every column).

ALTER TABLE "RetailOrder" ADD COLUMN IF NOT EXISTS "ownShippedAt" TIMESTAMP(3);
ALTER TABLE "RetailOrder" ADD COLUMN IF NOT EXISTS "ownDeliveredAt" TIMESTAMP(3);
ALTER TABLE "RetailOrder" ADD COLUMN IF NOT EXISTS "partlySentAt" TIMESTAMP(3);

ALTER TABLE "SupplierOrder" ADD COLUMN IF NOT EXISTS "replacesId" TEXT;
ALTER TABLE "SupplierOrder" ADD COLUMN IF NOT EXISTS "undoneAt" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "SupplierOrder_replacesId_idx" ON "SupplierOrder"("replacesId");

ALTER TABLE "SupplierProduct" ADD COLUMN IF NOT EXISTS "familyKey" TEXT;
ALTER TABLE "SupplierProduct" ADD COLUMN IF NOT EXISTS "variants" JSONB NOT NULL DEFAULT '[]';
CREATE INDEX IF NOT EXISTS "SupplierProduct_familyKey_idx" ON "SupplierProduct"("familyKey");

ALTER TABLE "Store" ADD COLUMN IF NOT EXISTS "autoSwitchSupplier" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Store" ADD COLUMN IF NOT EXISTS "switchCostRule" TEXT NOT NULL DEFAULT 'cost';
ALTER TABLE "Store" ADD COLUMN IF NOT EXISTS "switchMaxIncreasePct" INTEGER NOT NULL DEFAULT 10;
ALTER TABLE "Store" ADD COLUMN IF NOT EXISTS "switchMinMarginPct" INTEGER NOT NULL DEFAULT 20;

CREATE TABLE IF NOT EXISTS "SupplierSwitch" (
    "id" TEXT NOT NULL,
    "retailOrderId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "fromSupplierOrderId" TEXT NOT NULL,
    "fromSupplierId" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "toSupplierOrderId" TEXT,
    "toSupplierId" TEXT,
    "costBefore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "costAfter" DOUBLE PRECISION,
    "note" TEXT,
    "undoneAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SupplierSwitch_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "SupplierSwitch_fromSupplierOrderId_key" ON "SupplierSwitch"("fromSupplierOrderId");
CREATE UNIQUE INDEX IF NOT EXISTS "SupplierSwitch_toSupplierOrderId_key" ON "SupplierSwitch"("toSupplierOrderId");
CREATE INDEX IF NOT EXISTS "SupplierSwitch_retailOrderId_idx" ON "SupplierSwitch"("retailOrderId");
CREATE INDEX IF NOT EXISTS "SupplierSwitch_storeId_createdAt_idx" ON "SupplierSwitch"("storeId", "createdAt");

ALTER TABLE "SupplierSwitch" ENABLE ROW LEVEL SECURITY;

-- Supplier orders that expired before this shipped keep the seller's choices ("Find another supplier", "Cancel and
-- refund"): mark them decided so the cron's catch-up sweep never switches an old order.
INSERT INTO "SupplierSwitch" ("id", "retailOrderId", "storeId", "fromSupplierOrderId", "fromSupplierId", "outcome", "costBefore", "note")
SELECT 'sw_' || so."id", so."retailOrderId", so."storeId", so."id", so."supplierId", 'none', so."costTotal", 'Expired before automatic switching existed.'
FROM "SupplierOrder" so
WHERE so."status" = 'expired'
ON CONFLICT ("fromSupplierOrderId") DO NOTHING;
