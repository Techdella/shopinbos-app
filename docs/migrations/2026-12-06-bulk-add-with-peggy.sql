-- Add many with Peggy (shared/bulk-products.ts, src/lib/products/bulk/): a seller or supplier uploads many product
-- photos at once, Peggy drafts each one and they price them by chatting; kept server-side so they can come back.
-- Additive only: two new tables, nothing changed or removed. Safe to run more than once. Run BEFORE deploying the
-- "Add many with Peggy" screens (the endpoints read these tables).

CREATE TABLE IF NOT EXISTS "BulkProductSession" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'open',
  "thread" JSONB NOT NULL DEFAULT '[]',
  "dismissed" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "nextNumber" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BulkProductSession_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "BulkProductSession_userId_status_updatedAt_idx" ON "BulkProductSession" ("userId", "status", "updatedAt");

CREATE TABLE IF NOT EXISTS "BulkProductItem" (
  "id" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "number" INTEGER NOT NULL,
  "clientKey" TEXT NOT NULL,
  "fileName" TEXT,
  "photos" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "name" TEXT NOT NULL DEFAULT '',
  "description" TEXT NOT NULL DEFAULT '',
  "category" TEXT NOT NULL DEFAULT '',
  "priceKobo" INTEGER,
  "hintLowKobo" INTEGER,
  "hintHighKobo" INTEGER,
  "stock" INTEGER,
  "colours" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "lookKey" TEXT,
  "colour" TEXT,
  "aiState" TEXT NOT NULL DEFAULT 'pending',
  "aiClaimedAt" TIMESTAMP(3),
  "removed" BOOLEAN NOT NULL DEFAULT false,
  "productId" TEXT,
  "publishError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BulkProductItem_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BulkProductItem_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "BulkProductSession"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "BulkProductItem_sessionId_clientKey_key" ON "BulkProductItem" ("sessionId", "clientKey");
CREATE UNIQUE INDEX IF NOT EXISTS "BulkProductItem_sessionId_number_key" ON "BulkProductItem" ("sessionId", "number");
CREATE INDEX IF NOT EXISTS "BulkProductItem_sessionId_aiState_idx" ON "BulkProductItem" ("sessionId", "aiState");

-- Server-only tables: no browser access through the Supabase API.
ALTER TABLE "BulkProductSession" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BulkProductItem" ENABLE ROW LEVEL SECURITY;
