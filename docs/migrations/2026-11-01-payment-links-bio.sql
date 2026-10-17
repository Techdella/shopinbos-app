-- Payment links (https://<store>/pay/<code>) and the store's link in bio page (https://<store>/links).
--
--   * "PaymentLink":   a link a seller or Peggy shares so a customer can pay for exact products. Paying goes through
--                      the normal checkout and creates a normal "RetailOrder" (with "paymentLinkId" set).
--   * "BioPage":       one per store: profile, theme and ordered blocks (products, links, socials, WhatsApp, sign-up).
--   * "BioPageClick":  taps per block, a small counter.
--   * "RetailOrder"."paymentLinkId": the link an order was paid through.
--
-- Additive only, safe to run more than once. Run BEFORE deploying the code that uses it (Prisma reads every column
-- of "RetailOrder").

ALTER TABLE "RetailOrder" ADD COLUMN IF NOT EXISTS "paymentLinkId" TEXT;
CREATE INDEX IF NOT EXISTS "RetailOrder_paymentLinkId_idx" ON "RetailOrder" ("paymentLinkId");

CREATE TABLE IF NOT EXISTS "PaymentLink" (
  "id"             TEXT NOT NULL,
  "storeId"        TEXT NOT NULL,
  "code"           TEXT NOT NULL,
  "title"          TEXT,
  "items"          JSONB NOT NULL DEFAULT '[]',
  "customAmount"   DOUBLE PRECISION,
  "note"           TEXT,
  "buyerName"      TEXT,
  "buyerPhone"     TEXT,
  "buyerEmail"     TEXT,
  "oneTime"        BOOLEAN NOT NULL DEFAULT true,
  "maxQuantity"    INTEGER NOT NULL DEFAULT 10,
  "expiresAt"      TIMESTAMP(3),
  "status"         TEXT NOT NULL DEFAULT 'active',
  "orderId"        TEXT,
  "paidCount"      INTEGER NOT NULL DEFAULT 0,
  "paidAt"         TIMESTAMP(3),
  "cancelledAt"    TIMESTAMP(3),
  "createdBy"      TEXT NOT NULL DEFAULT 'seller',
  "conversationId" TEXT,
  "customerRef"    TEXT,
  "channel"        TEXT,
  "views"          INTEGER NOT NULL DEFAULT 0,
  "lastViewedAt"   TIMESTAMP(3),
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PaymentLink_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "PaymentLink_code_key" ON "PaymentLink" ("code");
CREATE INDEX IF NOT EXISTS "PaymentLink_storeId_createdAt_idx" ON "PaymentLink" ("storeId", "createdAt");
CREATE INDEX IF NOT EXISTS "PaymentLink_storeId_status_idx" ON "PaymentLink" ("storeId", "status");
CREATE INDEX IF NOT EXISTS "PaymentLink_conversationId_createdAt_idx" ON "PaymentLink" ("conversationId", "createdAt");

CREATE TABLE IF NOT EXISTS "BioPage" (
  "id"        TEXT NOT NULL,
  "storeId"   TEXT NOT NULL,
  "published" BOOLEAN NOT NULL DEFAULT true,
  "title"     TEXT,
  "bio"       TEXT,
  "avatarUrl" TEXT,
  "theme"     JSONB NOT NULL DEFAULT '{}',
  "blocks"    JSONB NOT NULL DEFAULT '[]',
  "views"     INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BioPage_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "BioPage_storeId_key" ON "BioPage" ("storeId");

CREATE TABLE IF NOT EXISTS "BioPageClick" (
  "id"        TEXT NOT NULL,
  "bioPageId" TEXT NOT NULL,
  "blockId"   TEXT NOT NULL,
  "count"     INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BioPageClick_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "BioPageClick_bioPageId_blockId_key" ON "BioPageClick" ("bioPageId", "blockId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PaymentLink_storeId_fkey') THEN
    ALTER TABLE "PaymentLink" ADD CONSTRAINT "PaymentLink_storeId_fkey"
      FOREIGN KEY ("storeId") REFERENCES "Store" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'BioPage_storeId_fkey') THEN
    ALTER TABLE "BioPage" ADD CONSTRAINT "BioPage_storeId_fkey"
      FOREIGN KEY ("storeId") REFERENCES "Store" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'BioPageClick_bioPageId_fkey') THEN
    ALTER TABLE "BioPageClick" ADD CONSTRAINT "BioPageClick_bioPageId_fkey"
      FOREIGN KEY ("bioPageId") REFERENCES "BioPage" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- Row level security like the other app tables: the app connects as the table owner; the public API keys get nothing.
ALTER TABLE "PaymentLink" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BioPage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BioPageClick" ENABLE ROW LEVEL SECURITY;
