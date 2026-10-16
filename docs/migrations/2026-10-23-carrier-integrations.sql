-- Delivery companies booked through their own API (src/lib/logistics/carriers), starting with Kwik.
--
--   * "LogisticsPartner".carrier: "kwik" marks the partner profile that stands for the carrier in the marketplace.
--     Sellers pick it like any partner; its jobs are priced live (POST /api/app/logistics/live-quote), sent to the
--     carrier when booked, and moved by GET /api/cron/carrier-sync from the carrier's own status.
--   * "DeliveryBooking".external*: the carrier's order reference (Kwik unique_order_id), its job ids, tracking link,
--     raw status and when it was last read.
--
-- Additive only, safe to run more than once. Run BEFORE deploying the code that uses it. Then mark the Kwik profile:
--   UPDATE "LogisticsPartner" SET carrier = 'kwik' WHERE slug = 'kwik';

ALTER TABLE "LogisticsPartner" ADD COLUMN IF NOT EXISTS "carrier" TEXT;

ALTER TABLE "DeliveryBooking" ADD COLUMN IF NOT EXISTS "externalCarrier" TEXT;
ALTER TABLE "DeliveryBooking" ADD COLUMN IF NOT EXISTS "externalRef" TEXT;
ALTER TABLE "DeliveryBooking" ADD COLUMN IF NOT EXISTS "externalJobIds" JSONB;
ALTER TABLE "DeliveryBooking" ADD COLUMN IF NOT EXISTS "externalTrackingUrl" TEXT;
ALTER TABLE "DeliveryBooking" ADD COLUMN IF NOT EXISTS "externalStatus" TEXT;
ALTER TABLE "DeliveryBooking" ADD COLUMN IF NOT EXISTS "externalSyncedAt" TIMESTAMP(3);

-- The sync cron reads the open jobs of each carrier.
CREATE INDEX IF NOT EXISTS "DeliveryBooking_externalCarrier_status_idx" ON "DeliveryBooking"("externalCarrier", "status");

-- /api/cron/carrier-sync every 10 minutes: reads each open carrier job's status and moves the job (and the seller's
-- order) with it. Reuses the "cron_secret" Vault secret (= CRON_SECRET in Vercel). Kept commented out so it is never
-- scheduled by accident; run it once the app is deployed with the route:
--
-- select cron.schedule(
--   'carrier-sync',
--   '*/10 * * * *',
--   $$
--   select net.http_get(
--     url := 'https://shopinbos-app.vercel.app/api/cron/carrier-sync',
--     headers := jsonb_build_object(
--       'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
--     ),
--     timeout_milliseconds := 60000
--   );
--   $$
-- )
-- where not exists (select 1 from cron.job where jobname = 'carrier-sync');
--
-- To stop it: select cron.unschedule('carrier-sync');
