-- Analytics + social selling (agent G). Additive: two new tables, RLS on (the app reaches them through Prisma's
-- server connection only; no anon/authenticated policies, so the Supabase REST API can't read them).

CREATE TABLE IF NOT EXISTS "StoreMetricDaily" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT '',
    "campaign" TEXT NOT NULL DEFAULT '',
    "productId" TEXT NOT NULL DEFAULT '',
    "count" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StoreMetricDaily_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "StoreMetricDaily_storeId_day_metric_channel_campaign_produc_key"
    ON "StoreMetricDaily"("storeId", "day", "metric", "channel", "campaign", "productId");
CREATE INDEX IF NOT EXISTS "StoreMetricDaily_storeId_day_idx" ON "StoreMetricDaily"("storeId", "day");
ALTER TABLE "StoreMetricDaily" ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS "SocialChannelConnection" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "externalId" TEXT,
    "tokenEnc" TEXT,
    "feedAddedAt" TIMESTAMP(3),
    "lastFetchAt" TIMESTAMP(3),
    "lastFetchAgent" TEXT,
    "lastSyncAt" TIMESTAMP(3),
    "lastSyncStatus" TEXT,
    "lastSyncMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SocialChannelConnection_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "SocialChannelConnection_storeId_channel_key" ON "SocialChannelConnection"("storeId", "channel");
CREATE INDEX IF NOT EXISTS "SocialChannelConnection_storeId_idx" ON "SocialChannelConnection"("storeId");
ALTER TABLE "SocialChannelConnection" ENABLE ROW LEVEL SECURITY;
