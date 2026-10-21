-- Rewards for sellers, suppliers and delivery partners (phone app: levels, weekly challenges, badges, points → AI
-- credits). prisma/schema.prisma "Rewards" section, src/lib/rewards. Additive only. Safe to run more than once.
-- RLS on: only the server (service role) reads them. Points are never turned into cash.

CREATE TABLE IF NOT EXISTS "RewardAccount" (
    "userId" TEXT NOT NULL,
    "xp" INTEGER NOT NULL DEFAULT 0,
    "points" INTEGER NOT NULL DEFAULT 0,
    "streak" INTEGER NOT NULL DEFAULT 0,
    "lastActiveDay" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "RewardAccount_pkey" PRIMARY KEY ("userId")
);

CREATE TABLE IF NOT EXISTS "RewardEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "ref" TEXT NOT NULL,
    "xp" INTEGER NOT NULL DEFAULT 0,
    "points" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RewardEvent_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "RewardEvent_userId_kind_ref_key" ON "RewardEvent"("userId", "kind", "ref");
CREATE INDEX IF NOT EXISTS "RewardEvent_userId_kind_createdAt_idx" ON "RewardEvent"("userId", "kind", "createdAt");

CREATE TABLE IF NOT EXISTS "ChallengeClaim" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "weekStart" TIMESTAMP(3) NOT NULL,
    "points" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ChallengeClaim_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ChallengeClaim_userId_key_weekStart_key" ON "ChallengeClaim"("userId", "key", "weekStart");

CREATE TABLE IF NOT EXISTS "UserBadge" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "earnedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserBadge_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "UserBadge_userId_key_key" ON "UserBadge"("userId", "key");

ALTER TABLE "RewardAccount" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RewardEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ChallengeClaim" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "UserBadge" ENABLE ROW LEVEL SECURITY;
