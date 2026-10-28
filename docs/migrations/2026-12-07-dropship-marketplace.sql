-- Dropshipper marketplace fixes (spec gap analysis Part C, WP-3):
--   * supplier price rises on 7 days' notice (shared/price-notice.ts): the new prices wait on the supplier product
--     until the daily /api/cron/price-notices job applies them; a seller listing that would then lose money is paused
--     (StoreProduct.pausedReason = 'price_loss') instead of selling at a loss;
--   * one sample per seller per product at the dropship price (shared/samples.ts), as a wholesale order flagged
--     "sample" with a unique key while it's live.
-- Seller reviews of suppliers use the existing "SupplierReview" table (targetRole 'supplier'), nothing new.
-- Additive only: new nullable columns or columns with defaults, plus indexes. No new table, so no new RLS.
-- Safe to run more than once. Run BEFORE deploying: the app reads these columns.

ALTER TABLE "SupplierProduct" ADD COLUMN IF NOT EXISTS "pendingPrice" JSONB;
ALTER TABLE "SupplierProduct" ADD COLUMN IF NOT EXISTS "pendingPriceAt" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "SupplierProduct_pendingPriceAt_idx" ON "SupplierProduct" ("pendingPriceAt");

ALTER TABLE "StoreProduct" ADD COLUMN IF NOT EXISTS "pausedReason" TEXT;
ALTER TABLE "StoreProduct" ADD COLUMN IF NOT EXISTS "pausedAt" TIMESTAMP(3);

ALTER TABLE "WholesaleOrder" ADD COLUMN IF NOT EXISTS "sample" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "WholesaleOrder" ADD COLUMN IF NOT EXISTS "sampleKey" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "WholesaleOrder_sampleKey_key" ON "WholesaleOrder" ("sampleKey");

-- The QStash schedule for the daily job is created by scripts/qstash-schedules.mjs ("shopinbos-price-notices",
-- 05:13 UTC). Where pg_cron still runs the jobs instead, the same call is:
--   SELECT cron.schedule('price-notices', '13 5 * * *', $$ SELECT net.http_get(
--     url := 'https://app.shopinbos.com/api/cron/price-notices',
--     headers := jsonb_build_object('Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret'))) $$);
