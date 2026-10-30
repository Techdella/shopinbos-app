-- Resell (pilot feature "resell"; shared/resell.ts, src/lib/resell/service.server.ts). A shop lets resellers sell a
-- product for a commission; each reseller gets a short link (app.shopinbos.com/rs/<code>); sales through it are
-- recorded so the shop knows who to pay. Shopinbos never holds or moves this money: the COMMISSION IS OWED BY THE
-- SHOP, these tables only record it. Payouts are marked later from an admin ledger (status "paid").
--
--   * "ResellSetting": one row per product the shop has set (productId = StoreProduct.id): enabled = "Let resellers
--                      sell this"; commissionPct = 1–50 (two decimals).
--   * "ResellLink":    one link per reseller per product (resellerUserId = User.id; product-level only). code is
--                      the short code in /rs/<code>; clicks counts taps (link previews left out).
--   * "ResellSale":    a product of an order credited to a link (one row per order and link): quantity, what the
--                      buyer paid for that product after discounts (lineTotal, whole naira, delivery excluded), the
--                      commission percent at the time and the commission (whole naira). status: awaiting_payment
--                      (order placed, not paid; not counted) | pending (paid) | approved (delivered) | paid (the shop
--                      paid the reseller) | void (cancelled, refunded or returned).
--
-- No foreign keys to existing tables (rows outlive deleted products and orders as a record of what was owed).
-- Supabase turns on row level security for new tables; the app reads and writes them through Prisma's service
-- connection, so no policies are needed.
--
-- Additive only, safe to run more than once. Run BEFORE deploying the code that uses it (until then the resell
-- screens say it isn't ready and checkout simply records nothing).

CREATE TABLE IF NOT EXISTS "ResellSetting" (
  "id" TEXT PRIMARY KEY,
  "productId" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "commissionPct" NUMERIC(5,2) NOT NULL DEFAULT 10,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ResellSetting_commissionPct_range" CHECK ("commissionPct" >= 1 AND "commissionPct" <= 50)
);
CREATE UNIQUE INDEX IF NOT EXISTS "ResellSetting_productId_key" ON "ResellSetting" ("productId");
CREATE INDEX IF NOT EXISTS "ResellSetting_storeId_enabled_idx" ON "ResellSetting" ("storeId", "enabled");
CREATE INDEX IF NOT EXISTS "ResellSetting_enabled_updatedAt_idx" ON "ResellSetting" ("enabled", "updatedAt");

CREATE TABLE IF NOT EXISTS "ResellLink" (
  "id" TEXT PRIMARY KEY,
  "code" TEXT NOT NULL,
  "resellerUserId" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "clicks" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "ResellLink_code_key" ON "ResellLink" ("code");
CREATE UNIQUE INDEX IF NOT EXISTS "ResellLink_resellerUserId_productId_key" ON "ResellLink" ("resellerUserId", "productId");
CREATE INDEX IF NOT EXISTS "ResellLink_storeId_idx" ON "ResellLink" ("storeId");
CREATE INDEX IF NOT EXISTS "ResellLink_resellerUserId_createdAt_idx" ON "ResellLink" ("resellerUserId", "createdAt");

CREATE TABLE IF NOT EXISTS "ResellSale" (
  "id" TEXT PRIMARY KEY,
  "linkId" TEXT NOT NULL REFERENCES "ResellLink" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "orderId" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "resellerUserId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL DEFAULT 0,
  "lineTotal" INTEGER NOT NULL DEFAULT 0,
  "commissionPct" NUMERIC(5,2) NOT NULL,
  "commissionAmount" INTEGER NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'awaiting_payment',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ResellSale_status_check" CHECK ("status" IN ('awaiting_payment', 'pending', 'approved', 'paid', 'void'))
);
CREATE UNIQUE INDEX IF NOT EXISTS "ResellSale_orderId_linkId_key" ON "ResellSale" ("orderId", "linkId");
CREATE INDEX IF NOT EXISTS "ResellSale_storeId_createdAt_idx" ON "ResellSale" ("storeId", "createdAt");
CREATE INDEX IF NOT EXISTS "ResellSale_resellerUserId_createdAt_idx" ON "ResellSale" ("resellerUserId", "createdAt");
CREATE INDEX IF NOT EXISTS "ResellSale_status_idx" ON "ResellSale" ("status");

ALTER TABLE "ResellSetting" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ResellLink" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ResellSale" ENABLE ROW LEVEL SECURITY;
