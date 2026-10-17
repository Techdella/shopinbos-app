-- Delivery companies booked through their own API (src/lib/logistics/carriers), starting with Kwik.
--
--   * "LogisticsPartner".carrier: "kwik" marks the partner profile that stands for the carrier in the marketplace.
--     Sellers pick it like any partner; its jobs are priced live (POST /api/app/logistics/live-quote), sent to the
--     carrier when booked, and moved by GET /api/cron/carrier-sync from the carrier's own status.
--   * "DeliveryBooking".external*: the carrier's order reference (Kwik unique_order_id), its job ids, tracking link,
--     raw status and when it was last read.
--
-- Additive only, safe to run more than once. Run BEFORE deploying the code that uses it.
--
-- Carriers: kwik, fez, sendstack, sendbox (src/lib/logistics/carriers/index.ts). Each needs a partner profile
-- marked with its id. The profile needs a User row; a system user with a supabaseId that matches no Supabase account
-- (so nobody can sign in as it) does. Applied on production 2026-10-16 for Kwik:
--
--   with u as (
--     insert into "User" (id, "supabaseId", name, role, country, city, "verificationStatus", "updatedAt")
--     values ('carrier_kwik_user', 'carrier:kwik', 'Kwik', 'logistics_partner', 'Nigeria', 'Lagos', 'verified', now())
--     on conflict ("supabaseId") do update set name = excluded.name returning id)
--   insert into "LogisticsPartner" (id, "userId", "companyName", slug, "displayName", country, city, description,
--     "coverageZones", "vehicleTypes", "deliveryTypes", "pricingModel", "estimatedSpeed", "verificationStatus", status,
--     carrier, "updatedAt")
--   select 'carrier_kwik', u.id, 'Kwik Delivery', 'kwik', 'Kwik', 'Nigeria', 'Lagos', '...', array['Lagos (Intrastate)'],
--     array['bike','car','van','truck'], array['same_day','express'], 'live', 'Same day', 'verified', 'active', 'kwik', now()
--   from u on conflict (slug) do update set carrier = 'kwik', "updatedAt" = now();
--
-- Fez, Sendstack and Sendbox: the same with their own ids, names and coverage, once their keys are set.
-- Their status webhooks go to /api/webhooks/carriers/{fez|sendstack|sendbox}; the cron below covers missed ones.

ALTER TABLE "LogisticsPartner" ADD COLUMN IF NOT EXISTS "carrier" TEXT;

ALTER TABLE "DeliveryBooking" ADD COLUMN IF NOT EXISTS "externalCarrier" TEXT;
ALTER TABLE "DeliveryBooking" ADD COLUMN IF NOT EXISTS "externalRef" TEXT;
ALTER TABLE "DeliveryBooking" ADD COLUMN IF NOT EXISTS "externalJobIds" JSONB;
ALTER TABLE "DeliveryBooking" ADD COLUMN IF NOT EXISTS "externalTrackingUrl" TEXT;
ALTER TABLE "DeliveryBooking" ADD COLUMN IF NOT EXISTS "externalStatus" TEXT;
ALTER TABLE "DeliveryBooking" ADD COLUMN IF NOT EXISTS "externalSyncedAt" TIMESTAMP(3);

-- Delivery networks: sellers' own network accounts, paid checkouts on Shopinbos's account, and which account a
-- booking used (src/lib/logistics/networks.server.ts).
ALTER TABLE "DeliveryBooking" ADD COLUMN IF NOT EXISTS "networkAccountId" TEXT;

CREATE TABLE IF NOT EXISTS "DeliveryNetworkAccount" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "network" TEXT NOT NULL,
  "credentials" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'connected',
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "DeliveryNetworkAccount_userId_network_key" ON "DeliveryNetworkAccount"("userId", "network");

CREATE TABLE IF NOT EXISTS "DeliveryNetworkCheckout" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "sellerId" TEXT NOT NULL,
  "network" TEXT NOT NULL,
  "logisticsPartnerId" TEXT NOT NULL,
  "request" JSONB NOT NULL,
  "networkPrice" DOUBLE PRECISION NOT NULL,
  "fee" DOUBLE PRECISION NOT NULL,
  "total" DOUBLE PRECISION NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'NGN',
  "paymentRef" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "bookingId" TEXT,
  "error" TEXT,
  "refundStatus" TEXT,
  "paidAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "DeliveryNetworkCheckout_paymentRef_key" ON "DeliveryNetworkCheckout"("paymentRef");
CREATE UNIQUE INDEX IF NOT EXISTS "DeliveryNetworkCheckout_bookingId_key" ON "DeliveryNetworkCheckout"("bookingId");
CREATE INDEX IF NOT EXISTS "DeliveryNetworkCheckout_sellerId_createdAt_idx" ON "DeliveryNetworkCheckout"("sellerId", "createdAt");
CREATE INDEX IF NOT EXISTS "DeliveryNetworkCheckout_status_idx" ON "DeliveryNetworkCheckout"("status");

-- Server-only tables (credentials, payments): RLS on with no policies, like the other server-only tables.
ALTER TABLE "DeliveryNetworkAccount" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DeliveryNetworkCheckout" ENABLE ROW LEVEL SECURITY;

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
