-- Store traffic + connections. Run BEFORE deploying the code that ships with it (the storefront traffic beacon
-- writes to StoreTrafficDaily; until then it logs and carries on, and /home/analytics/traffic shows no data).
-- Additive only, safe to run more than once. RLS on with no policies: the app reaches these tables through
-- Prisma's server connection only, so the Supabase REST API can't read them.

-- Daily counters per store: page views by path, sessions by source / referrer host / device / country / city /
-- utm, shop searches and engaged seconds. No personal data (no IP, user agent, visitor id or full URL).
CREATE TABLE IF NOT EXISTS "StoreTrafficDaily" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "dim" TEXT NOT NULL DEFAULT '',
    "value" TEXT NOT NULL DEFAULT '',
    "count" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StoreTrafficDaily_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "StoreTrafficDaily_storeId_day_metric_dim_value_key"
    ON "StoreTrafficDaily"("storeId", "day", "metric", "dim", "value");
CREATE INDEX IF NOT EXISTS "StoreTrafficDaily_storeId_day_idx" ON "StoreTrafficDaily"("storeId", "day");
ALTER TABLE "StoreTrafficDaily" ENABLE ROW LEVEL SECURITY;

-- Optional "Connect with Google" for Search Console numbers. Tokens are encrypted by the app
-- (INTEGRATIONS_ENCRYPTION_KEY) before they are written here.
CREATE TABLE IF NOT EXISTS "SearchConsoleConnection" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "expiresAt" TIMESTAMP(3),
    "siteUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'needs_site',
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SearchConsoleConnection_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "SearchConsoleConnection_storeId_key" ON "SearchConsoleConnection"("storeId");
ALTER TABLE "SearchConsoleConnection" ENABLE ROW LEVEL SECURITY;
