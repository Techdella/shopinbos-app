-- Facebook & Instagram: "Connect with Facebook" for Pages and Instagram, and the post scheduler.
--
--   * "SocialAccount": the Facebook Page and Instagram professional account a store publishes to (one of each),
--     with the Page access token encrypted by the app (INBOX_ENCRYPTION_KEY). Picked after Facebook Login for
--     Business (META_PAGES_CONFIG_ID); the same sign-in also connects Messenger and Instagram DMs to the inbox.
--   * "ScheduledPost": a caption, optional picture and link, the platforms and a time. /api/cron/marketing (every
--     10 minutes, docs/migrations/2026-10-12-marketing.sql) publishes the due ones; no new cron job is needed.
--
-- Additive only, safe to run more than once. RLS is on with no policies: only the app's server connection (which
-- bypasses RLS) reads or writes them. Run BEFORE deploying the code that uses it.

CREATE TABLE IF NOT EXISTS "SocialAccount" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "platform" TEXT NOT NULL,
  "externalId" TEXT NOT NULL,
  "pageId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "tokenEnc" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'connected',
  "lastError" TEXT,
  "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SocialAccount_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "SocialAccount_storeId_platform_key" ON "SocialAccount"("storeId", "platform");
CREATE INDEX IF NOT EXISTS "SocialAccount_storeId_idx" ON "SocialAccount"("storeId");
ALTER TABLE "SocialAccount" ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS "ScheduledPost" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "platforms" TEXT[],
  "caption" TEXT NOT NULL,
  "imageUrl" TEXT,
  "link" TEXT,
  "productId" TEXT,
  "scheduledAt" TIMESTAMP(3) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'scheduled',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "results" JSONB NOT NULL DEFAULT '{}',
  "publishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ScheduledPost_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ScheduledPost_storeId_scheduledAt_idx" ON "ScheduledPost"("storeId", "scheduledAt");
CREATE INDEX IF NOT EXISTS "ScheduledPost_status_scheduledAt_idx" ON "ScheduledPost"("status", "scheduledAt");
ALTER TABLE "ScheduledPost" ENABLE ROW LEVEL SECURITY;
