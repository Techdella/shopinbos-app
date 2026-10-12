-- Gamification (rewards): spin-the-wheel / scratch-card / post-purchase plays and loyalty points.
-- Settings live in Store.brandSettings.gamification and prize codes are ordinary "Discount" rows, so games,
-- reward progress and tier rewards work before this runs; plays, frequency caps by contact and loyalty points
-- need these tables. Additive only. Safe to run more than once. RLS on: only the server (service role) reads them.

CREATE TABLE IF NOT EXISTS "GamePlay" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "game" TEXT NOT NULL,
    "contactKey" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "outcomeId" TEXT NOT NULL,
    "outcomeKind" TEXT NOT NULL,
    "outcomeLabel" TEXT NOT NULL,
    "discountId" TEXT,
    "code" TEXT,
    "orderId" TEXT,
    "consent" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GamePlay_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "GamePlay_storeId_game_createdAt_idx" ON "GamePlay"("storeId", "game", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "GamePlay_storeId_contactKey_idx" ON "GamePlay"("storeId", "contactKey");
CREATE INDEX IF NOT EXISTS "GamePlay_storeId_orderId_idx" ON "GamePlay"("storeId", "orderId");

CREATE TABLE IF NOT EXISTS "LoyaltyAccount" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "balance" INTEGER NOT NULL DEFAULT 0,
    "lifetimeEarned" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "LoyaltyAccount_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "LoyaltyAccount_storeId_email_key" ON "LoyaltyAccount"("storeId", "email");
CREATE INDEX IF NOT EXISTS "LoyaltyAccount_storeId_phone_idx" ON "LoyaltyAccount"("storeId", "phone");

CREATE TABLE IF NOT EXISTS "LoyaltyLedger" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "points" INTEGER NOT NULL,
    "orderId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LoyaltyLedger_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "LoyaltyLedger_accountId_orderId_kind_key" ON "LoyaltyLedger"("accountId", "orderId", "kind");
CREATE INDEX IF NOT EXISTS "LoyaltyLedger_storeId_createdAt_idx" ON "LoyaltyLedger"("storeId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "LoyaltyLedger_storeId_orderId_idx" ON "LoyaltyLedger"("storeId", "orderId");

ALTER TABLE "GamePlay" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LoyaltyAccount" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LoyaltyLedger" ENABLE ROW LEVEL SECURITY;
