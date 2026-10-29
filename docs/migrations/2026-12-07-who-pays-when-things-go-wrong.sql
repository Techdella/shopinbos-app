-- Who pays when things go wrong (shared/fault-matrix.ts, src/lib/faults): the evidence photos (the supplier's photo of
-- the item in the open box and of the sealed parcel, on dropship and wholesale orders; the rider's photo of the sealed
-- parcel at pickup), the ship-by deadline and supplier strikes (3 in 90 days: the team reviews them), the store's
-- returns switch, customers' return requests and photos on "Report a problem", return and replacement trips, and the
-- record of each outcome (FaultCase). Money still moves only through refunds and money owed (BusinessDebt).
-- Additive only: new columns with defaults or nulls, three new tables with RLS on and no policies (the app reads them
-- with the service role). Safe to run more than once. Run BEFORE deploying: the app reads these columns.

-- Evidence at packing (dropship and wholesale) and at pickup.
ALTER TABLE "SupplierOrder" ADD COLUMN IF NOT EXISTS "contentsPhotoUrl" TEXT;
ALTER TABLE "WholesaleOrder" ADD COLUMN IF NOT EXISTS "contentsPhotoUrl" TEXT;
ALTER TABLE "WholesaleOrder" ADD COLUMN IF NOT EXISTS "packPhotoUrl" TEXT;
ALTER TABLE "DeliveryBooking" ADD COLUMN IF NOT EXISTS "pickupPhotoUrl" TEXT;
ALTER TABLE "DeliveryBooking" ADD COLUMN IF NOT EXISTS "pickupPhotoAt" TIMESTAMP(3);

-- Return and replacement trips, linked to the delivery they come from.
ALTER TABLE "DeliveryBooking" ADD COLUMN IF NOT EXISTS "tripKind" TEXT;
ALTER TABLE "DeliveryBooking" ADD COLUMN IF NOT EXISTS "returnOfId" TEXT;
CREATE INDEX IF NOT EXISTS "DeliveryBooking_returnOfId_idx" ON "DeliveryBooking"("returnOfId");

-- Ship-by: accepted + the products' handling days (working days, 6pm Lagos). Late once it passes unsent.
ALTER TABLE "SupplierOrder" ADD COLUMN IF NOT EXISTS "shipBy" TIMESTAMP(3);
ALTER TABLE "SupplierOrder" ADD COLUMN IF NOT EXISTS "lateAt" TIMESTAMP(3);
ALTER TABLE "SupplierOrder" ADD COLUMN IF NOT EXISTS "cancelledByCustomerAt" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "SupplierOrder_status_shipBy_idx" ON "SupplierOrder"("status", "shipBy");

-- Three strikes in 90 days: flagged for the team (never an automatic suspension).
ALTER TABLE "Supplier" ADD COLUMN IF NOT EXISTS "reviewFlaggedAt" TIMESTAMP(3);
ALTER TABLE "Supplier" ADD COLUMN IF NOT EXISTS "reviewNote" TEXT;

-- The store's returns switch.
ALTER TABLE "Store" ADD COLUMN IF NOT EXISTS "returnsAllowed" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Store" ADD COLUMN IF NOT EXISTS "returnWindowDays" INTEGER NOT NULL DEFAULT 7;
ALTER TABLE "Store" ADD COLUMN IF NOT EXISTS "returnShippingPayer" TEXT NOT NULL DEFAULT 'customer';

-- The customer's photos on "Report a problem", and the outcome the team chose.
ALTER TABLE "DeliveryIssue" ADD COLUMN IF NOT EXISTS "photos" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "DeliveryIssue" ADD COLUMN IF NOT EXISTS "faultCaseId" TEXT;

CREATE TABLE IF NOT EXISTS "SupplierStrike" (
  "id" TEXT NOT NULL,
  "supplierId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "supplierOrderId" TEXT,
  "retailOrderId" TEXT,
  "note" TEXT,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SupplierStrike_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "SupplierStrike_kind_supplierOrderId_key" ON "SupplierStrike"("kind", "supplierOrderId");
CREATE INDEX IF NOT EXISTS "SupplierStrike_supplierId_expiresAt_idx" ON "SupplierStrike"("supplierId", "expiresAt");
DO $$ BEGIN
  ALTER TABLE "SupplierStrike" ADD CONSTRAINT "SupplierStrike_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE "SupplierStrike" ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS "FaultCase" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "retailOrderId" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "event" TEXT NOT NULL,
  "remedy" TEXT NOT NULL DEFAULT 'refund',
  "partKeys" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "source" TEXT NOT NULL,
  "outcome" JSONB NOT NULL DEFAULT '{}',
  "refundKobo" INTEGER NOT NULL DEFAULT 0,
  "refundStatus" TEXT,
  "note" TEXT,
  "decidedByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FaultCase_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "FaultCase_key_key" ON "FaultCase"("key");
CREATE INDEX IF NOT EXISTS "FaultCase_retailOrderId_idx" ON "FaultCase"("retailOrderId");
CREATE INDEX IF NOT EXISTS "FaultCase_storeId_createdAt_idx" ON "FaultCase"("storeId", "createdAt");
ALTER TABLE "FaultCase" ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS "ReturnRequest" (
  "id" TEXT NOT NULL,
  "retailOrderId" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "message" TEXT,
  "photos" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "status" TEXT NOT NULL DEFAULT 'requested',
  "returnPayer" TEXT NOT NULL DEFAULT 'customer',
  "refundKobo" INTEGER NOT NULL DEFAULT 0,
  "declineReason" TEXT,
  "returnBookingId" TEXT,
  "faultCaseId" TEXT,
  "decidedAt" TIMESTAMP(3),
  "receivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReturnRequest_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ReturnRequest_storeId_status_idx" ON "ReturnRequest"("storeId", "status");
CREATE INDEX IF NOT EXISTS "ReturnRequest_retailOrderId_idx" ON "ReturnRequest"("retailOrderId");
ALTER TABLE "ReturnRequest" ENABLE ROW LEVEL SECURITY;
