-- The payout and rewards ledger (Admin › Payouts; shared/payout-ledger.ts, src/lib/payouts/ledger.server.ts) and the
-- shop link / QR visit counter for Pilot numbers (shared/pilot-numbers.ts, src/lib/pilot-numbers.server.ts).
--
-- Shopinbos never holds this money. A resell commission is owed BY THE SHOP to the reseller; the ledger only records
-- who is owed what by whom, and an admin marks a line paid once the money has moved (the shop paid its reseller, or
-- the founder paid by hand on Friday), with how and the reference. Airtime rewards are lines too.
--
--   * "PayoutBatch": one weekly list, named by its payday: "weekStart" is the Friday (Africa/Lagos) the list is paid
--                    on. status open | paid; closedAt / closedBy (User.id) when an admin closes it. Unpaid lines on
--                    a closed list carry over to the next Friday's.
--   * "PayoutLine":  one amount owed to one earner (earnerUserId = User.id). sourceKind resell | creator_brief |
--                    personal_shopper | airtime_reward | adjustment; sourceId = the row it came from (ResellSale.id for
--                    resell; null for hand-added lines); storeId = the shop that owes it (null: Shopinbos's own
--                    reward). amount in whole naira. status owed | paid | void; method bank_transfer | shop_paid |
--                    airtime | cash | other, reference, note, paidAt, paidBy (User.id). phone / network: where airtime
--                    goes. One line per (sourceKind, sourceId): Postgres treats NULLs as distinct, so this unique
--                    index only binds lines that have a sourceId (hand-added lines never clash) and makes the resell
--                    sync idempotent.
--   * "ShopLinkHit": visits to a shop's short link (app.shopinbos.com/@handle) per Lagos day and source: link | qr
--                    (the QR code carries ?src=qr). Link previews and crawlers are not counted.
--
-- No foreign keys to existing tables (lines outlive deleted users, shops and sales as a record of what was paid).
-- RLS is on; the app reads and writes through Prisma's service connection, so no policies are needed.
--
-- Additive only, safe to run more than once. Run BEFORE deploying the code that uses it (until then Admin › Payouts
-- and the seller's Pilot numbers say it isn't set up yet, and the short link just doesn't count visits).

CREATE TABLE IF NOT EXISTS "PayoutBatch" (
  "id" TEXT PRIMARY KEY,
  "weekStart" DATE NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'open',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "closedAt" TIMESTAMP(3),
  "closedBy" TEXT,
  CONSTRAINT "PayoutBatch_status_check" CHECK ("status" IN ('open', 'paid')),
  CONSTRAINT "PayoutBatch_weekStart_friday" CHECK (EXTRACT(ISODOW FROM "weekStart") = 5)
);
CREATE UNIQUE INDEX IF NOT EXISTS "PayoutBatch_weekStart_key" ON "PayoutBatch" ("weekStart");

CREATE TABLE IF NOT EXISTS "PayoutLine" (
  "id" TEXT PRIMARY KEY,
  "batchId" TEXT REFERENCES "PayoutBatch" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "earnerUserId" TEXT NOT NULL,
  "sourceKind" TEXT NOT NULL,
  "sourceId" TEXT,
  "storeId" TEXT,
  "amount" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'owed',
  "method" TEXT,
  "reference" TEXT,
  "note" TEXT,
  "phone" TEXT,
  "network" TEXT,
  "paidAt" TIMESTAMP(3),
  "paidBy" TEXT,
  "createdBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PayoutLine_sourceKind_check" CHECK ("sourceKind" IN ('resell', 'creator_brief', 'personal_shopper', 'airtime_reward', 'adjustment')),
  CONSTRAINT "PayoutLine_status_check" CHECK ("status" IN ('owed', 'paid', 'void')),
  CONSTRAINT "PayoutLine_method_check" CHECK ("method" IS NULL OR "method" IN ('bank_transfer', 'shop_paid', 'airtime', 'cash', 'other')),
  CONSTRAINT "PayoutLine_amount_check" CHECK ("amount" >= 0)
);
CREATE UNIQUE INDEX IF NOT EXISTS "PayoutLine_sourceKind_sourceId_key" ON "PayoutLine" ("sourceKind", "sourceId");
CREATE INDEX IF NOT EXISTS "PayoutLine_batchId_earnerUserId_idx" ON "PayoutLine" ("batchId", "earnerUserId");
CREATE INDEX IF NOT EXISTS "PayoutLine_earnerUserId_status_idx" ON "PayoutLine" ("earnerUserId", "status");
CREATE INDEX IF NOT EXISTS "PayoutLine_status_createdAt_idx" ON "PayoutLine" ("status", "createdAt");
CREATE INDEX IF NOT EXISTS "PayoutLine_storeId_idx" ON "PayoutLine" ("storeId");

CREATE TABLE IF NOT EXISTS "ShopLinkHit" (
  "id" TEXT PRIMARY KEY,
  "storeId" TEXT NOT NULL,
  "day" DATE NOT NULL,
  "source" TEXT NOT NULL,
  "count" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ShopLinkHit_source_check" CHECK ("source" IN ('link', 'qr'))
);
CREATE UNIQUE INDEX IF NOT EXISTS "ShopLinkHit_storeId_day_source_key" ON "ShopLinkHit" ("storeId", "day", "source");
CREATE INDEX IF NOT EXISTS "ShopLinkHit_day_idx" ON "ShopLinkHit" ("day");

ALTER TABLE "PayoutBatch" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PayoutLine" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ShopLinkHit" ENABLE ROW LEVEL SECURITY;
