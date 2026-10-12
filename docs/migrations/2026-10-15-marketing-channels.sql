-- Marketing channels: SMS and WhatsApp campaigns with per-recipient delivery receipts, WhatsApp message
-- templates (submitted to Meta), SMS/WhatsApp opt-outs (STOP), per-store messaging settings, and the log of
-- order/cart messages sent to customers by WhatsApp or SMS.
--
-- Additive only and safe to re-run. Apply staging first, per docs/production-database-safety.md.
-- Depends on: "BroadcastCampaign", "CampaignRecipient" (2026-10-12-marketing.sql and earlier).
-- New tables have RLS on with no policies: only the app's server role (Prisma) reads or writes them.

-- Campaign channel settings: SMS { senderId } | WhatsApp { templateId, variables[], headerImageUrl, productId }.
ALTER TABLE "BroadcastCampaign" ADD COLUMN IF NOT EXISTS "channelConfig" JSONB NOT NULL DEFAULT '{}';

-- Per-recipient delivery receipts for SMS and WhatsApp (status: queued | sent | delivered | read | failed).
ALTER TABLE "CampaignRecipient" ADD COLUMN IF NOT EXISTS "externalId" TEXT;
ALTER TABLE "CampaignRecipient" ADD COLUMN IF NOT EXISTS "deliveredAt" TIMESTAMP(3);
ALTER TABLE "CampaignRecipient" ADD COLUMN IF NOT EXISTS "readAt" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "CampaignRecipient_externalId_idx" ON "CampaignRecipient"("externalId");

-- WhatsApp message templates on the store's WhatsApp Business Account.
CREATE TABLE IF NOT EXISTS "WhatsAppTemplate" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'en',
    "category" TEXT NOT NULL DEFAULT 'MARKETING',
    "components" JSONB NOT NULL DEFAULT '{}',
    "variables" JSONB NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "rejectedReason" TEXT,
    "metaId" TEXT,
    "preset" TEXT,
    "submittedAt" TIMESTAMP(3),
    "syncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WhatsAppTemplate_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "WhatsAppTemplate_storeId_name_language_key" ON "WhatsAppTemplate"("storeId", "name", "language");
CREATE INDEX IF NOT EXISTS "WhatsAppTemplate_storeId_status_idx" ON "WhatsAppTemplate"("storeId", "status");

-- Numbers that texted STOP (or that the seller removed). scope: marketing | all.
CREATE TABLE IF NOT EXISTS "MarketingOptOut" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'all',
    "source" TEXT NOT NULL,
    "keyword" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MarketingOptOut_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "MarketingOptOut_storeId_phone_channel_key" ON "MarketingOptOut"("storeId", "phone", "channel");
CREATE INDEX IF NOT EXISTS "MarketingOptOut_storeId_channel_idx" ON "MarketingOptOut"("storeId", "channel");

-- SMS sender ID, SMS price per segment, and which order messages go out by WhatsApp/SMS.
CREATE TABLE IF NOT EXISTS "StoreMessagingSettings" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "smsSenderId" TEXT,
    "smsCostPerSegment" DOUBLE PRECISION,
    "transactional" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StoreMessagingSettings_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "StoreMessagingSettings_storeId_key" ON "StoreMessagingSettings"("storeId");

-- Order and cart messages sent to customers by WhatsApp or SMS, one per event, order/cart and channel.
CREATE TABLE IF NOT EXISTS "CustomerMessage" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "refId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "error" TEXT,
    "externalId" TEXT,
    "templateId" TEXT,
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CustomerMessage_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "CustomerMessage_storeId_event_refId_channel_key" ON "CustomerMessage"("storeId", "event", "refId", "channel");
CREATE INDEX IF NOT EXISTS "CustomerMessage_storeId_createdAt_idx" ON "CustomerMessage"("storeId", "createdAt");
CREATE INDEX IF NOT EXISTS "CustomerMessage_externalId_idx" ON "CustomerMessage"("externalId");

ALTER TABLE "WhatsAppTemplate" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MarketingOptOut" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StoreMessagingSettings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CustomerMessage" ENABLE ROW LEVEL SECURITY;
