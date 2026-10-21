-- Logistics marketplace (shared/delivery-market.ts, src/lib/delivery-market): partners publish where they collect
-- from and deliver to, a structured rate card and pickup points; sellers and suppliers say where they sell, connect
-- to partners and choose what customers see at checkout; each paid order becomes a job the partner accepts or
-- declines; customers report delivery problems.
--
--   * "BookingStatus": declined, out_for_delivery, at_pickup_point, returning, returned.
--   * "LogisticsPartner": CAC number, contact person, services, pickup/delivery areas, pay-on-delivery offer.
--   * "DeliveryBooking": service, size band, pickup point, connection, rate card, shipment, accept deadline,
--     accept/decline, ready, out for delivery, at pickup point, returned, failed attempts, replacement, POD record.
--   * "StoreProduct".sizeBand.
--   * New tables: LogisticsRateCard, LogisticsPickupPoint, DeliverySettings, DeliveryConnection, DeliveryIssue.
--
-- Additive only, safe to run more than once. Run BEFORE deploying the code that uses it. ALTER TYPE … ADD VALUE
-- can't run inside a transaction block on older Postgres: run this file as plain statements (the Supabase SQL
-- editor does).

ALTER TYPE "BookingStatus" ADD VALUE IF NOT EXISTS 'declined';
ALTER TYPE "BookingStatus" ADD VALUE IF NOT EXISTS 'out_for_delivery';
ALTER TYPE "BookingStatus" ADD VALUE IF NOT EXISTS 'at_pickup_point';
ALTER TYPE "BookingStatus" ADD VALUE IF NOT EXISTS 'returning';
ALTER TYPE "BookingStatus" ADD VALUE IF NOT EXISTS 'returned';

ALTER TABLE "LogisticsPartner" ADD COLUMN IF NOT EXISTS "cacNumber" TEXT;
ALTER TABLE "LogisticsPartner" ADD COLUMN IF NOT EXISTS "contactName" TEXT;
ALTER TABLE "LogisticsPartner" ADD COLUMN IF NOT EXISTS "contactPhone" TEXT;
ALTER TABLE "LogisticsPartner" ADD COLUMN IF NOT EXISTS "contactEmail" TEXT;
ALTER TABLE "LogisticsPartner" ADD COLUMN IF NOT EXISTS "services" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "LogisticsPartner" ADD COLUMN IF NOT EXISTS "pickupAreas" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "LogisticsPartner" ADD COLUMN IF NOT EXISTS "deliveryAreas" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "LogisticsPartner" ADD COLUMN IF NOT EXISTS "offersPayOnDelivery" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "DeliveryBooking" ADD COLUMN IF NOT EXISTS "service" TEXT;
ALTER TABLE "DeliveryBooking" ADD COLUMN IF NOT EXISTS "sizeBand" TEXT;
ALTER TABLE "DeliveryBooking" ADD COLUMN IF NOT EXISTS "pickupPointId" TEXT;
ALTER TABLE "DeliveryBooking" ADD COLUMN IF NOT EXISTS "connectionId" TEXT;
ALTER TABLE "DeliveryBooking" ADD COLUMN IF NOT EXISTS "rateCardId" TEXT;
ALTER TABLE "DeliveryBooking" ADD COLUMN IF NOT EXISTS "shipmentKey" TEXT;
ALTER TABLE "DeliveryBooking" ADD COLUMN IF NOT EXISTS "acceptBy" TIMESTAMP(3);
ALTER TABLE "DeliveryBooking" ADD COLUMN IF NOT EXISTS "acceptedAt" TIMESTAMP(3);
ALTER TABLE "DeliveryBooking" ADD COLUMN IF NOT EXISTS "declinedAt" TIMESTAMP(3);
ALTER TABLE "DeliveryBooking" ADD COLUMN IF NOT EXISTS "declineReason" TEXT;
ALTER TABLE "DeliveryBooking" ADD COLUMN IF NOT EXISTS "readyAt" TIMESTAMP(3);
ALTER TABLE "DeliveryBooking" ADD COLUMN IF NOT EXISTS "outForDeliveryAt" TIMESTAMP(3);
ALTER TABLE "DeliveryBooking" ADD COLUMN IF NOT EXISTS "atPickupPointAt" TIMESTAMP(3);
ALTER TABLE "DeliveryBooking" ADD COLUMN IF NOT EXISTS "returnedAt" TIMESTAMP(3);
ALTER TABLE "DeliveryBooking" ADD COLUMN IF NOT EXISTS "failedAttempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "DeliveryBooking" ADD COLUMN IF NOT EXISTS "replacedById" TEXT;
ALTER TABLE "DeliveryBooking" ADD COLUMN IF NOT EXISTS "codRemittedAt" TIMESTAMP(3);
ALTER TABLE "DeliveryBooking" ADD COLUMN IF NOT EXISTS "codConfirmedAt" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "DeliveryBooking_orderId_idx" ON "DeliveryBooking"("orderId");
CREATE INDEX IF NOT EXISTS "DeliveryBooking_status_acceptBy_idx" ON "DeliveryBooking"("status", "acceptBy");

ALTER TABLE "StoreProduct" ADD COLUMN IF NOT EXISTS "sizeBand" TEXT;

CREATE TABLE IF NOT EXISTS "LogisticsRateCard" (
  "id" TEXT NOT NULL,
  "logisticsPartnerId" TEXT NOT NULL,
  "ownerUserId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'active',
  "rows" JSONB NOT NULL DEFAULT '[]',
  "failedAttemptFee" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "returnFee" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "notes" TEXT,
  "respondedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "LogisticsRateCard_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "LogisticsRateCard_logisticsPartnerId_fkey" FOREIGN KEY ("logisticsPartnerId") REFERENCES "LogisticsPartner"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "LogisticsRateCard_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "LogisticsRateCard_logisticsPartnerId_status_idx" ON "LogisticsRateCard"("logisticsPartnerId", "status");
CREATE INDEX IF NOT EXISTS "LogisticsRateCard_ownerUserId_status_idx" ON "LogisticsRateCard"("ownerUserId", "status");

CREATE TABLE IF NOT EXISTS "LogisticsPickupPoint" (
  "id" TEXT NOT NULL,
  "logisticsPartnerId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "address" TEXT NOT NULL,
  "state" TEXT NOT NULL,
  "area" TEXT,
  "hours" TEXT,
  "phone" TEXT,
  "lat" DOUBLE PRECISION,
  "lng" DOUBLE PRECISION,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "LogisticsPickupPoint_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "LogisticsPickupPoint_logisticsPartnerId_fkey" FOREIGN KEY ("logisticsPartnerId") REFERENCES "LogisticsPartner"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "LogisticsPickupPoint_logisticsPartnerId_active_idx" ON "LogisticsPickupPoint"("logisticsPartnerId", "active");
CREATE INDEX IF NOT EXISTS "LogisticsPickupPoint_state_idx" ON "LogisticsPickupPoint"("state");

CREATE TABLE IF NOT EXISTS "DeliverySettings" (
  "userId" TEXT NOT NULL,
  "checkoutMode" TEXT NOT NULL DEFAULT 'zones',
  "sellArea" TEXT NOT NULL DEFAULT 'nationwide',
  "sellStates" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "originState" TEXT,
  "originArea" TEXT,
  "originAddress" TEXT,
  "selfPickup" BOOLEAN NOT NULL DEFAULT false,
  "pickupAddress" TEXT,
  "pickupHours" TEXT,
  "pickupInstructions" TEXT,
  "fallback" TEXT NOT NULL DEFAULT 'pickup_only',
  "fallbackFee" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "defaultSizeBand" TEXT NOT NULL DEFAULT 'small',
  "failedFeePayer" TEXT NOT NULL DEFAULT 'seller',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DeliverySettings_pkey" PRIMARY KEY ("userId"),
  CONSTRAINT "DeliverySettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "DeliveryConnection" (
  "id" TEXT NOT NULL,
  "ownerUserId" TEXT NOT NULL,
  "ownerRole" TEXT NOT NULL,
  "logisticsPartnerId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'active',
  "endedBy" TEXT,
  "services" TEXT[] NOT NULL DEFAULT ARRAY['doorstep', 'pickup_point']::TEXT[],
  "showPartnerName" BOOLEAN NOT NULL DEFAULT true,
  "label" TEXT,
  "ownerPod" BOOLEAN NOT NULL DEFAULT false,
  "partnerPod" BOOLEAN NOT NULL DEFAULT false,
  "podAcceptedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "endedAt" TIMESTAMP(3),
  CONSTRAINT "DeliveryConnection_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DeliveryConnection_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "DeliveryConnection_logisticsPartnerId_fkey" FOREIGN KEY ("logisticsPartnerId") REFERENCES "LogisticsPartner"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "DeliveryConnection_ownerUserId_logisticsPartnerId_key" ON "DeliveryConnection"("ownerUserId", "logisticsPartnerId");
CREATE INDEX IF NOT EXISTS "DeliveryConnection_logisticsPartnerId_status_idx" ON "DeliveryConnection"("logisticsPartnerId", "status");

CREATE TABLE IF NOT EXISTS "DeliveryIssue" (
  "id" TEXT NOT NULL,
  "retailOrderId" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "bookingId" TEXT,
  "logisticsPartnerId" TEXT,
  "kind" TEXT NOT NULL,
  "message" TEXT,
  "reporterName" TEXT,
  "status" TEXT NOT NULL DEFAULT 'open',
  "resolvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DeliveryIssue_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DeliveryIssue_logisticsPartnerId_fkey" FOREIGN KEY ("logisticsPartnerId") REFERENCES "LogisticsPartner"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "DeliveryIssue_storeId_status_idx" ON "DeliveryIssue"("storeId", "status");
CREATE INDEX IF NOT EXISTS "DeliveryIssue_logisticsPartnerId_createdAt_idx" ON "DeliveryIssue"("logisticsPartnerId", "createdAt");
CREATE INDEX IF NOT EXISTS "DeliveryIssue_retailOrderId_idx" ON "DeliveryIssue"("retailOrderId");

-- Like every app table: row-level security on with no policies, so only the server (Prisma, service role) reads
-- them and the public anon/authenticated API keys can't.
ALTER TABLE "LogisticsRateCard" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LogisticsPickupPoint" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DeliverySettings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DeliveryConnection" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DeliveryIssue" ENABLE ROW LEVEL SECURITY;
