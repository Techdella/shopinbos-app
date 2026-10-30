-- Shoppers: customer records keyed by phone number, for the coming customer app (Shopinbos Plug).
--
--   * "Shopper":      one row per phone number (E.164, e.g. +2348034127790) with the newest name, area and state
--                     the person gave on an order, and an email once one is given. firstSeenAt / lastSeenAt are the
--                     first and latest order times.
--   * "ShopperStore": the person's link to one store: first and latest order, how many orders and what they spent
--                     there (same type as "RetailOrder"."total"). lastOrderId is the newest order counted, so the same
--                     order is never counted twice.
--
-- Written by src/lib/shoppers.server.ts each time a seller's order is created (storefront checkout, payment links,
-- recorded sales); scripts/backfill-shoppers.mjs fills them from past orders. Sellers never see another store's rows.
--
-- Supabase turns on row level security for new tables; the app reads and writes them through Prisma's service
-- connection, so no policies are needed.
--
-- Additive only, safe to run more than once. Run BEFORE deploying the code that uses it.

CREATE TABLE IF NOT EXISTS "Shopper" (
  "id" TEXT PRIMARY KEY,
  "phone" TEXT NOT NULL,
  "name" TEXT,
  "area" TEXT,
  "state" TEXT,
  "email" TEXT,
  "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "Shopper_phone_key" ON "Shopper" ("phone");
CREATE INDEX IF NOT EXISTS "Shopper_lastSeenAt_idx" ON "Shopper" ("lastSeenAt");

CREATE TABLE IF NOT EXISTS "ShopperStore" (
  "id" TEXT PRIMARY KEY,
  "shopperId" TEXT NOT NULL REFERENCES "Shopper" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "storeId" TEXT NOT NULL,
  "firstOrderAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastOrderAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastOrderId" TEXT,
  "orderCount" INTEGER NOT NULL DEFAULT 0,
  "totalSpent" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "ShopperStore_shopperId_storeId_key" ON "ShopperStore" ("shopperId", "storeId");
CREATE INDEX IF NOT EXISTS "ShopperStore_storeId_lastOrderAt_idx" ON "ShopperStore" ("storeId", "lastOrderAt");
