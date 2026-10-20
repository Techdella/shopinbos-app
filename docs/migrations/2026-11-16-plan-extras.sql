-- October 2026 pricing, part 2 (shared/plans.ts): add-ons and boosts bought through Paystack, SMS/WhatsApp pack
-- balances, seller staff, delivery partners' pickup points, private rate cards and pay-on-delivery choice, and
-- sellers following suppliers. Run once in Supabase (SQL editor); every statement is safe to re-run.
CREATE TABLE IF NOT EXISTS "PlanExtraPurchase" (
  "reference" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL DEFAULT 1,
  "targetId" TEXT,
  "amountKobo" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "included" BOOLEAN NOT NULL DEFAULT false,
  "startsAt" TIMESTAMP(3),
  "endsAt" TIMESTAMP(3),
  "error" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "paidAt" TIMESTAMP(3)
);
CREATE INDEX IF NOT EXISTS "PlanExtraPurchase_userId_kind_status_idx" ON "PlanExtraPurchase" ("userId", "kind", "status");
CREATE INDEX IF NOT EXISTS "PlanExtraPurchase_kind_status_endsAt_idx" ON "PlanExtraPurchase" ("kind", "status", "endsAt");

CREATE TABLE IF NOT EXISTS "MessageBalance" (
  "userId" TEXT PRIMARY KEY,
  "sms" INTEGER NOT NULL DEFAULT 0,
  "whatsapp" INTEGER NOT NULL DEFAULT 0,
  "period" TEXT,
  "used" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "StoreStaff" (
  "id" TEXT PRIMARY KEY,
  "storeId" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "memberUserId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'invited',
  "token" TEXT NOT NULL,
  "invitedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "acceptedAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "StoreStaff_token_key" ON "StoreStaff" ("token");
CREATE UNIQUE INDEX IF NOT EXISTS "StoreStaff_storeId_email_key" ON "StoreStaff" ("storeId", "email");
CREATE INDEX IF NOT EXISTS "StoreStaff_memberUserId_status_idx" ON "StoreStaff" ("memberUserId", "status");
CREATE INDEX IF NOT EXISTS "StoreStaff_ownerId_idx" ON "StoreStaff" ("ownerId");

CREATE TABLE IF NOT EXISTS "LogisticsPickupPoint" (
  "id" TEXT PRIMARY KEY,
  "logisticsPartnerId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "address" TEXT NOT NULL,
  "city" TEXT NOT NULL,
  "state" TEXT NOT NULL,
  "phone" TEXT,
  "hours" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "LogisticsPickupPoint_logisticsPartnerId_idx" ON "LogisticsPickupPoint" ("logisticsPartnerId");
CREATE INDEX IF NOT EXISTS "LogisticsPickupPoint_state_idx" ON "LogisticsPickupPoint" ("state");

CREATE TABLE IF NOT EXISTS "PrivateRateCard" (
  "id" TEXT PRIMARY KEY,
  "logisticsPartnerId" TEXT NOT NULL,
  "customerUserId" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "price" INTEGER NOT NULL,
  "states" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "notes" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "PrivateRateCard_logisticsPartnerId_customerUserId_key" ON "PrivateRateCard" ("logisticsPartnerId", "customerUserId");
CREATE INDEX IF NOT EXISTS "PrivateRateCard_customerUserId_idx" ON "PrivateRateCard" ("customerUserId");

CREATE TABLE IF NOT EXISTS "SupplierFollow" (
  "supplierId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("supplierId", "userId")
);
CREATE INDEX IF NOT EXISTS "SupplierFollow_userId_idx" ON "SupplierFollow" ("userId");

CREATE TABLE IF NOT EXISTS "SupplierBroadcast" (
  "id" TEXT PRIMARY KEY,
  "supplierId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "recipients" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "SupplierBroadcast_supplierId_createdAt_idx" ON "SupplierBroadcast" ("supplierId", "createdAt");

ALTER TABLE "LogisticsPartner" ADD COLUMN IF NOT EXISTS "acceptsCod" BOOLEAN NOT NULL DEFAULT true;

-- The app reaches these through Prisma (service role); nothing is exposed to the public API.
ALTER TABLE "PlanExtraPurchase" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MessageBalance" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StoreStaff" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LogisticsPickupPoint" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PrivateRateCard" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SupplierFollow" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SupplierBroadcast" ENABLE ROW LEVEL SECURITY;
