-- Reviews (agent F): featured flag on store reviews, imported reviews from other sources, review requests,
-- review source connections (Google Business Profile) and per-store review settings.
-- Additive only. Safe to run more than once.

ALTER TABLE "ProductReview" ADD COLUMN IF NOT EXISTS "featured" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS "ExternalReview" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "importMethod" TEXT NOT NULL DEFAULT 'manual',
    "externalId" TEXT,
    "sourceUrl" TEXT,
    "productId" TEXT,
    "authorName" TEXT NOT NULL,
    "authorPhotoUrl" TEXT,
    "rating" INTEGER,
    "title" TEXT NOT NULL DEFAULT '',
    "body" TEXT NOT NULL DEFAULT '',
    "images" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" TEXT NOT NULL DEFAULT 'approved',
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "verifiedBuyer" BOOLEAN NOT NULL DEFAULT false,
    "orderId" TEXT,
    "reply" TEXT,
    "repliedAt" TIMESTAMP(3),
    "replySyncedAt" TIMESTAMP(3),
    "replyError" TEXT,
    "reviewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ExternalReview_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ExternalReview_storeId_source_externalId_key" ON "ExternalReview"("storeId", "source", "externalId");
CREATE INDEX IF NOT EXISTS "ExternalReview_storeId_createdAt_idx" ON "ExternalReview"("storeId", "createdAt");
CREATE INDEX IF NOT EXISTS "ExternalReview_storeId_status_idx" ON "ExternalReview"("storeId", "status");

CREATE TABLE IF NOT EXISTS "ReviewRequest" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "channel" TEXT NOT NULL,
    "trigger" TEXT NOT NULL DEFAULT 'manual',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "error" TEXT,
    "sentAt" TIMESTAMP(3),
    "openedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ReviewRequest_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ReviewRequest_storeId_createdAt_idx" ON "ReviewRequest"("storeId", "createdAt");
CREATE INDEX IF NOT EXISTS "ReviewRequest_orderId_idx" ON "ReviewRequest"("orderId");

CREATE TABLE IF NOT EXISTS "ReviewSourceConnection" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "expiresAt" TIMESTAMP(3),
    "accountName" TEXT,
    "locationName" TEXT,
    "locationTitle" TEXT,
    "status" TEXT NOT NULL DEFAULT 'connected',
    "lastSyncedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ReviewSourceConnection_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ReviewSourceConnection_storeId_provider_key" ON "ReviewSourceConnection"("storeId", "provider");

CREATE TABLE IF NOT EXISTS "ReviewSettings" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "autoRequest" BOOLEAN NOT NULL DEFAULT false,
    "requestDelayDays" INTEGER NOT NULL DEFAULT 3,
    "requestChannel" TEXT NOT NULL DEFAULT 'email',
    "autoApprove" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ReviewSettings_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ReviewSettings_storeId_key" ON "ReviewSettings"("storeId");

-- The app reads these through Prisma with the service connection; no anon/authenticated access.
ALTER TABLE "ExternalReview" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ReviewRequest" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ReviewSourceConnection" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ReviewSettings" ENABLE ROW LEVEL SECURITY;
