-- Video projects and ad campaigns.
--
--   * "VideoProject": the video studio's drafts, saved and published reels (/home/video).
--   * "AdCampaign": campaign columns (several products, audience, creatives, Meta Marketing API ids and stats,
--     mode manual | meta | managed). Older rows keep working as "manual" single-product ads.
--   * "AdServiceRequest": "Shopinbos runs it for me" requests for TikTok or Meta, with the setup fee (Paystack).
--
-- Additive only, safe to run more than once. RLS on with no policies (only the app's server connection reads or
-- writes). Run BEFORE deploying the code that uses it (Prisma reads every column of "AdCampaign").

CREATE TABLE IF NOT EXISTS "VideoProject" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "purpose" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "productId" TEXT,
  "config" JSONB NOT NULL,
  "videoUrl" TEXT,
  "posterUrl" TEXT,
  "seconds" DOUBLE PRECISION,
  "publishedTo" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "VideoProject_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "VideoProject_storeId_status_updatedAt_idx" ON "VideoProject"("storeId", "status", "updatedAt");
ALTER TABLE "VideoProject" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "AdCampaign" ADD COLUMN IF NOT EXISTS "name" TEXT;
ALTER TABLE "AdCampaign" ADD COLUMN IF NOT EXISTS "mode" TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE "AdCampaign" ADD COLUMN IF NOT EXISTS "objective" TEXT;
ALTER TABLE "AdCampaign" ADD COLUMN IF NOT EXISTS "productIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "AdCampaign" ADD COLUMN IF NOT EXISTS "audience" JSONB;
ALTER TABLE "AdCampaign" ADD COLUMN IF NOT EXISTS "creatives" JSONB;
ALTER TABLE "AdCampaign" ADD COLUMN IF NOT EXISTS "currency" TEXT NOT NULL DEFAULT 'NGN';
ALTER TABLE "AdCampaign" ADD COLUMN IF NOT EXISTS "startAt" TIMESTAMP(3);
ALTER TABLE "AdCampaign" ADD COLUMN IF NOT EXISTS "endAt" TIMESTAMP(3);
ALTER TABLE "AdCampaign" ADD COLUMN IF NOT EXISTS "external" JSONB;
ALTER TABLE "AdCampaign" ADD COLUMN IF NOT EXISTS "impressions" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "AdCampaign" ADD COLUMN IF NOT EXISTS "reach" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "AdCampaign" ADD COLUMN IF NOT EXISTS "lastSyncAt" TIMESTAMP(3);
ALTER TABLE "AdCampaign" ADD COLUMN IF NOT EXISTS "syncError" TEXT;

CREATE TABLE IF NOT EXISTS "AdServiceRequest" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "campaignId" TEXT,
  "platform" TEXT NOT NULL,
  "contactName" TEXT NOT NULL,
  "contactPhone" TEXT NOT NULL,
  "contactEmail" TEXT,
  "businessName" TEXT NOT NULL,
  "handle" TEXT,
  "pageUrl" TEXT,
  "website" TEXT,
  "adAccountId" TEXT,
  "dailyBudget" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "days" INTEGER NOT NULL DEFAULT 7,
  "goals" TEXT,
  "audience" TEXT,
  "notes" TEXT,
  "setupFee" INTEGER NOT NULL,
  "paymentRef" TEXT,
  "paidAt" TIMESTAMP(3),
  "status" TEXT NOT NULL DEFAULT 'awaiting_payment',
  "adminNotes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AdServiceRequest_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "AdServiceRequest_paymentRef_key" ON "AdServiceRequest"("paymentRef");
CREATE INDEX IF NOT EXISTS "AdServiceRequest_storeId_createdAt_idx" ON "AdServiceRequest"("storeId", "createdAt");
CREATE INDEX IF NOT EXISTS "AdServiceRequest_status_createdAt_idx" ON "AdServiceRequest"("status", "createdAt");
ALTER TABLE "AdServiceRequest" ENABLE ROW LEVEL SECURITY;
