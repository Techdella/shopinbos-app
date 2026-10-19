-- Sellers' and suppliers' own riders ("My riders") and the delivery companies they invite
-- (src/lib/logistics/fleet.server.ts, src/lib/logistics/invites.server.ts).
--
--   * "LogisticsPartner"."ownerId": a private fleet, owned by that seller or supplier (their user id). Never listed as
--     a partner; its riders use the Riders app like a partner's riders.
--   * "SellerLogisticsInvite": an invite link for a delivery company; once accepted, the company is linked to the
--     seller or supplier who sent it.
--
-- Additive only, safe to run more than once. Applied on production 2026-10-17.

ALTER TABLE "LogisticsPartner" ADD COLUMN IF NOT EXISTS "ownerId" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "LogisticsPartner_ownerId_key" ON "LogisticsPartner"("ownerId");

CREATE TABLE IF NOT EXISTS "SellerLogisticsInvite" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "sellerId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "companyName" TEXT NOT NULL,
  "contact" TEXT,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "logisticsPartnerId" TEXT,
  "acceptedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "SellerLogisticsInvite_code_key" ON "SellerLogisticsInvite"("code");
CREATE INDEX IF NOT EXISTS "SellerLogisticsInvite_sellerId_status_idx" ON "SellerLogisticsInvite"("sellerId", "status");
CREATE INDEX IF NOT EXISTS "SellerLogisticsInvite_logisticsPartnerId_idx" ON "SellerLogisticsInvite"("logisticsPartnerId");
ALTER TABLE "SellerLogisticsInvite" ENABLE ROW LEVEL SECURITY;

-- Removing the delivery network APIs (Kwik, Fez, Sendstack, Sendbox, Shipbubble).
-- Done on production 2026-10-19: the carrier-sync cron is unscheduled, and the two hidden network partner rows
-- (carrier_kwik, carrier_shipbubble) are suspended and rejected, so they can never be listed or booked.
-- Then the rows, tables and columns only they used were removed (run in the Supabase SQL editor, 2026-10-19):
--
-- delete from "DeliveryQuoteRequest" where "logisticsPartnerId" in ('carrier_kwik', 'carrier_shipbubble');
-- delete from "Notification" where "userId" in ('carrier_kwik_user', 'carrier_shipbubble_user');
-- delete from "LogisticsPartner" where id in ('carrier_kwik', 'carrier_shipbubble');
-- delete from "User" where "supabaseId" like 'carrier:%';
-- drop table if exists "DeliveryNetworkAccount";
-- drop table if exists "DeliveryNetworkCheckout";
-- drop index if exists "DeliveryBooking_externalCarrier_status_idx";
-- alter table "DeliveryBooking" drop column if exists "externalCarrier", drop column if exists "externalRef",
--   drop column if exists "externalJobIds", drop column if exists "externalTrackingUrl",
--   drop column if exists "externalStatus", drop column if exists "externalSyncedAt",
--   drop column if exists "networkAccountId";
-- alter table "LogisticsPartner" drop column if exists "carrier";
