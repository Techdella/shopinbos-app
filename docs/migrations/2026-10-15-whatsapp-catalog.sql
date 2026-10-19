-- WhatsApp catalog (src/lib/whatsapp-catalog). Additive and idempotent: safe to run more than once.
--
-- WhatsAppCatalog: one row per store. Holds the random token in the public Meta feed URL
-- (/api/public/store/<slug>/catalog-feed.csv?token=...), and, when the store's WhatsApp token has
-- catalog_management + business_management, the catalog the Graph API sync pushes to.
-- WhatsAppCatalogItem: per-product sync status and Meta's error for that product.
-- Neither table stores access tokens: those stay encrypted on "InboxChannel".

CREATE TABLE IF NOT EXISTS "WhatsAppCatalog" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "feedToken" TEXT NOT NULL,
  "feedTokenRotatedAt" TIMESTAMP(3),
  "feedFetchedAt" TIMESTAMP(3),
  "catalogId" TEXT,
  "catalogName" TEXT,
  "businessId" TEXT,
  "wabaId" TEXT,
  "wabaLinkedAt" TIMESTAMP(3),
  "commerceSettingsAt" TIMESTAMP(3),
  "cartEnabled" BOOLEAN NOT NULL DEFAULT false,
  "catalogVisible" BOOLEAN NOT NULL DEFAULT false,
  "permissionState" TEXT NOT NULL DEFAULT 'unknown',
  "missingPermissions" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "permissionsCheckedAt" TIMESTAMP(3),
  "dirty" BOOLEAN NOT NULL DEFAULT false,
  "dirtyAt" TIMESTAMP(3),
  "syncStartedAt" TIMESTAMP(3),
  "lastSyncAt" TIMESTAMP(3),
  "lastSyncStatus" TEXT,
  "lastSyncError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WhatsAppCatalog_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "WhatsAppCatalog_storeId_key" ON "WhatsAppCatalog"("storeId");
CREATE INDEX IF NOT EXISTS "WhatsAppCatalog_dirty_idx" ON "WhatsAppCatalog"("dirty");

CREATE TABLE IF NOT EXISTS "WhatsAppCatalogItem" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "catalogId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "method" TEXT,
  "hash" TEXT,
  "remote" BOOLEAN NOT NULL DEFAULT false,
  "handle" TEXT,
  "error" TEXT,
  "syncedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WhatsAppCatalogItem_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "WhatsAppCatalogItem_storeId_productId_key" ON "WhatsAppCatalogItem"("storeId", "productId");
CREATE INDEX IF NOT EXISTS "WhatsAppCatalogItem_storeId_status_idx" ON "WhatsAppCatalogItem"("storeId", "status");
CREATE INDEX IF NOT EXISTS "WhatsAppCatalogItem_handle_idx" ON "WhatsAppCatalogItem"("handle");

-- The app reaches these tables through Prisma (service connection); no client-side Supabase access.
ALTER TABLE "WhatsAppCatalog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WhatsAppCatalogItem" ENABLE ROW LEVEL SECURITY;

-- Incremental sync: product saves only mark the store dirty (markCatalogDirty); /api/cron/whatsapp-catalog pushes
-- the changes for dirty stores (and re-checks every connected catalog every 6 hours, which also picks up stock
-- changes from orders). Opening the WhatsApp catalog page also pushes pending changes.
-- Vercel Hobby only allows daily crons, so call it from pg_cron like the other jobs (reuses the "cron_secret"
-- Vault secret = CRON_SECRET in Vercel). Run once the app is deployed with the route (kept commented out so it is
-- never run by accident):
--
-- select cron.schedule(
--   'whatsapp-catalog-sync',
--   '*/15 * * * *',
--   $$
--   select net.http_get(
--     url := 'https://app.shopinbos.com/api/cron/whatsapp-catalog',
--     headers := jsonb_build_object(
--       'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
--     ),
--     timeout_milliseconds := 120000
--   );
--   $$
-- )
-- where not exists (select 1 from cron.job where jobname = 'whatsapp-catalog-sync');
--
-- To stop it:
--   select cron.unschedule('whatsapp-catalog-sync');
