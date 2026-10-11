-- Email campaigns (per-recipient sends, tracking, attribution) and single-use payment receipts.
--
-- Additive only and safe to re-run. Apply after 2026-10-10-schema-alignment.sql, staging first,
-- per docs/production-database-safety.md.
--
-- Prerequisite: the "Subscriber" table from prisma/schema.prisma. The live database checked on
-- 2026-10-10 did not have it; generate the full reviewed diff with:
--   npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script

-- BroadcastCampaign columns in the Prisma schema that older databases lack.
ALTER TABLE "BroadcastCampaign"
  ADD COLUMN IF NOT EXISTS "preheader" TEXT,
  ADD COLUMN IF NOT EXISTS "senderName" TEXT,
  ADD COLUMN IF NOT EXISTS "senderEmail" TEXT,
  ADD COLUMN IF NOT EXISTS "replyTo" TEXT,
  ADD COLUMN IF NOT EXISTS "campaignType" TEXT NOT NULL DEFAULT 'newsletter',
  ADD COLUMN IF NOT EXISTS "segmentId" TEXT,
  ADD COLUMN IF NOT EXISTS "deliveredCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "unsubscribeCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "bounceCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "revenueGenerated" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "conversionCount" INTEGER NOT NULL DEFAULT 0;

-- One row per email a campaign sends; the token appears in tracking and unsubscribe links.
CREATE TABLE IF NOT EXISTS "CampaignRecipient" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "token" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "error" TEXT,
    "sentAt" TIMESTAMP(3),
    "openedAt" TIMESTAMP(3),
    "clickedAt" TIMESTAMP(3),
    "convertedAt" TIMESTAMP(3),
    "orderId" TEXT,
    "revenue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CampaignRecipient_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "CampaignRecipient_token_key" ON "CampaignRecipient"("token");
CREATE UNIQUE INDEX IF NOT EXISTS "CampaignRecipient_campaignId_email_key" ON "CampaignRecipient"("campaignId", "email");
CREATE INDEX IF NOT EXISTS "CampaignRecipient_storeId_idx" ON "CampaignRecipient"("storeId");
CREATE INDEX IF NOT EXISTS "CampaignRecipient_campaignId_status_idx" ON "CampaignRecipient"("campaignId", "status");
DO $$ BEGIN
  ALTER TABLE "CampaignRecipient" ADD CONSTRAINT "CampaignRecipient_campaignId_fkey"
    FOREIGN KEY ("campaignId") REFERENCES "BroadcastCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Campaign email that brought the buyer; credited to the campaign once the order is paid.
ALTER TABLE "RetailOrder" ADD COLUMN IF NOT EXISTS "campaignToken" TEXT;

-- Redeemed plan payments, so one Paystack reference can't unlock a plan twice.
CREATE TABLE IF NOT EXISTS "PaymentReceipt" (
    "reference" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'paystack',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PaymentReceipt_pkey" PRIMARY KEY ("reference")
);
CREATE INDEX IF NOT EXISTS "PaymentReceipt_userId_idx" ON "PaymentReceipt"("userId");
DO $$ BEGIN
  ALTER TABLE "PaymentReceipt" ADD CONSTRAINT "PaymentReceipt_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
