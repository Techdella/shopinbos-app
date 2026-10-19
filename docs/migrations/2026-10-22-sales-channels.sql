-- Sell everywhere, simplified (/channels): one "Connect" per platform that signs in with the platform (OAuth),
-- creates or picks the seller's catalog there, registers our product feed and keeps a product count
-- (src/lib/sales-channels).
--
--   * "SocialChannelConnection" gains the connect state: status (syncing | connected | error | reauth |
--     needs_account), accountId (Meta business / Google Merchant Center account / TikTok Business Center),
--     feedId (the scheduled feed registered there), tokenExpiresAt, productCount and connectedAt. tokenEnc keeps
--     the encrypted tokens (AES-256-GCM, INBOX_ENCRYPTION_KEY) as JSON { token, refreshToken? }.
--   * "SalesChannelInterest": "Tell me when it's ready" taps on coming-soon platforms (Amazon, Jumia, Konga…),
--     one row per store and platform.
--
-- Additive only, safe to run more than once. RLS is on with no policies for the new table: only the app's server
-- connection (which bypasses RLS) reads or writes it. Run BEFORE deploying the code that uses it.

ALTER TABLE "SocialChannelConnection" ADD COLUMN IF NOT EXISTS "status" TEXT;
ALTER TABLE "SocialChannelConnection" ADD COLUMN IF NOT EXISTS "accountId" TEXT;
ALTER TABLE "SocialChannelConnection" ADD COLUMN IF NOT EXISTS "feedId" TEXT;
ALTER TABLE "SocialChannelConnection" ADD COLUMN IF NOT EXISTS "tokenExpiresAt" TIMESTAMP(3);
ALTER TABLE "SocialChannelConnection" ADD COLUMN IF NOT EXISTS "productCount" INTEGER;
ALTER TABLE "SocialChannelConnection" ADD COLUMN IF NOT EXISTS "connectedAt" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "SocialChannelConnection_status_lastSyncAt_idx" ON "SocialChannelConnection"("status", "lastSyncAt");

CREATE TABLE IF NOT EXISTS "SalesChannelInterest" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "platform" TEXT NOT NULL,
  "userId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SalesChannelInterest_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "SalesChannelInterest_storeId_platform_key" ON "SalesChannelInterest"("storeId", "platform");
CREATE INDEX IF NOT EXISTS "SalesChannelInterest_platform_idx" ON "SalesChannelInterest"("platform");

ALTER TABLE "SalesChannelInterest" ENABLE ROW LEVEL SECURITY;

-- Product counts and token refresh: /api/cron/sales-channels re-syncs each connected platform that hasn't synced
-- for 6 hours (Google access tokens are refreshed then; Meta tokens past their expiry turn into "Connect again").
-- The platforms also fetch our feed daily by themselves, so this only keeps counts and instant pushes fresh.
-- Vercel Hobby only allows daily crons, so call it from pg_cron like the other jobs (reuses the "cron_secret"
-- Vault secret = CRON_SECRET in Vercel). Run once the app is deployed with the route (kept commented out so it is
-- never run by accident):
--
-- select cron.schedule(
--   'sales-channels-sync',
--   '23 */2 * * *',
--   $$
--   select net.http_get(
--     url := 'https://app.shopinbos.com/api/cron/sales-channels',
--     headers := jsonb_build_object(
--       'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
--     ),
--     timeout_milliseconds := 120000
--   );
--   $$
-- )
-- where not exists (select 1 from cron.job where jobname = 'sales-channels-sync');
--
-- To stop it:
--   select cron.unschedule('sales-channels-sync');
