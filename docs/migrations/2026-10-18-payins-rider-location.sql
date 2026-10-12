-- Delivery partners' own pay-in accounts (Paystack Dedicated Virtual Accounts) with automatic matching, rider
-- locations for "closest rider", and pickup coordinates on jobs.
--
--   * "PartnerPayInAccount": one Paystack customer + dedicated account per delivery partner
--     (src/lib/logistics/paystack-dva.ts). status: pending | assigned | failed | unavailable.
--   * "PartnerPayIn": every transfer into a pay-in account, unique on the Paystack reference so a replayed
--     webhook is ignored. Matched rows point at the "CodRemittance" they created; unmatched rows wait for the
--     team (Admin → Delivery partners → Pay-ins to check).
--   * "CodRemittance".covered / creditAfter / outcome: what each pay-in settled (exact | over | under).
--   * "LogisticsPartner".payInCredit: money paid in beyond the cash jobs it could settle, used by the next pay-in.
--   * "LogisticsTeamMember".lastLat / lastLng / lastAccuracy / lastLocationAt: the rider's latest location only.
--   * "RiderLocationPoint": a short trail per job for live tracking; deleted 7 days after delivery
--     (opportunistically by the location report route, and by the pg_cron job below once scheduled).
--   * "DeliveryBooking".pickupLat / pickupLng / pickupGeoSource / pickupGeocodedAt: pickup coordinates.
--   * "GeocodeCache": addresses already looked up, so OpenStreetMap is asked at most once per address.
--
-- Additive only, safe to run more than once. RLS is on with no policies for the new tables: only the app's server
-- connection (which bypasses RLS) reads or writes them, never the Supabase anon/authenticated keys.
-- Run BEFORE deploying the code that uses it.

ALTER TABLE "LogisticsPartner" ADD COLUMN IF NOT EXISTS "payInCredit" DOUBLE PRECISION NOT NULL DEFAULT 0;

ALTER TABLE "LogisticsTeamMember" ADD COLUMN IF NOT EXISTS "lastLat" DOUBLE PRECISION;
ALTER TABLE "LogisticsTeamMember" ADD COLUMN IF NOT EXISTS "lastLng" DOUBLE PRECISION;
ALTER TABLE "LogisticsTeamMember" ADD COLUMN IF NOT EXISTS "lastAccuracy" DOUBLE PRECISION;
ALTER TABLE "LogisticsTeamMember" ADD COLUMN IF NOT EXISTS "lastLocationAt" TIMESTAMP(3);

ALTER TABLE "DeliveryBooking" ADD COLUMN IF NOT EXISTS "pickupLat" DOUBLE PRECISION;
ALTER TABLE "DeliveryBooking" ADD COLUMN IF NOT EXISTS "pickupLng" DOUBLE PRECISION;
ALTER TABLE "DeliveryBooking" ADD COLUMN IF NOT EXISTS "pickupGeoSource" TEXT;
ALTER TABLE "DeliveryBooking" ADD COLUMN IF NOT EXISTS "pickupGeocodedAt" TIMESTAMP(3);

ALTER TABLE "CodRemittance" ADD COLUMN IF NOT EXISTS "covered" DOUBLE PRECISION;
ALTER TABLE "CodRemittance" ADD COLUMN IF NOT EXISTS "creditAfter" DOUBLE PRECISION;
ALTER TABLE "CodRemittance" ADD COLUMN IF NOT EXISTS "outcome" TEXT;

CREATE TABLE IF NOT EXISTS "PartnerPayInAccount" (
  "id" TEXT NOT NULL,
  "logisticsPartnerId" TEXT NOT NULL,
  "provider" TEXT NOT NULL DEFAULT 'paystack',
  "customerCode" TEXT,
  "customerId" TEXT,
  "providerAccountId" TEXT,
  "accountNumber" TEXT,
  "accountName" TEXT,
  "bankName" TEXT,
  "bankSlug" TEXT,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PartnerPayInAccount_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "PartnerPayInAccount_logisticsPartnerId_key" ON "PartnerPayInAccount"("logisticsPartnerId");
CREATE UNIQUE INDEX IF NOT EXISTS "PartnerPayInAccount_accountNumber_key" ON "PartnerPayInAccount"("accountNumber");
CREATE INDEX IF NOT EXISTS "PartnerPayInAccount_customerCode_idx" ON "PartnerPayInAccount"("customerCode");

CREATE TABLE IF NOT EXISTS "PartnerPayIn" (
  "id" TEXT NOT NULL,
  "provider" TEXT NOT NULL DEFAULT 'paystack',
  "reference" TEXT NOT NULL,
  "amount" DOUBLE PRECISION NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'NGN',
  "accountNumber" TEXT,
  "customerCode" TEXT,
  "senderName" TEXT,
  "senderBank" TEXT,
  "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "status" TEXT NOT NULL DEFAULT 'unmatched',
  "matchedBy" TEXT,
  "matchedByUserId" TEXT,
  "matchedAt" TIMESTAMP(3),
  "logisticsPartnerId" TEXT,
  "remittanceId" TEXT,
  "raw" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PartnerPayIn_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "PartnerPayIn_reference_key" ON "PartnerPayIn"("reference");
CREATE UNIQUE INDEX IF NOT EXISTS "PartnerPayIn_remittanceId_key" ON "PartnerPayIn"("remittanceId");
CREATE INDEX IF NOT EXISTS "PartnerPayIn_status_createdAt_idx" ON "PartnerPayIn"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "PartnerPayIn_logisticsPartnerId_createdAt_idx" ON "PartnerPayIn"("logisticsPartnerId", "createdAt");

CREATE TABLE IF NOT EXISTS "RiderLocationPoint" (
  "id" TEXT NOT NULL,
  "riderId" TEXT NOT NULL,
  "bookingId" TEXT NOT NULL,
  "lat" DOUBLE PRECISION NOT NULL,
  "lng" DOUBLE PRECISION NOT NULL,
  "accuracy" DOUBLE PRECISION,
  "at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RiderLocationPoint_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "RiderLocationPoint_bookingId_at_idx" ON "RiderLocationPoint"("bookingId", "at");
CREATE INDEX IF NOT EXISTS "RiderLocationPoint_at_idx" ON "RiderLocationPoint"("at");

CREATE TABLE IF NOT EXISTS "GeocodeCache" (
  "key" TEXT NOT NULL,
  "query" TEXT NOT NULL,
  "lat" DOUBLE PRECISION,
  "lng" DOUBLE PRECISION,
  "source" TEXT NOT NULL,
  "label" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GeocodeCache_pkey" PRIMARY KEY ("key")
);

DO $$ BEGIN
  ALTER TABLE "PartnerPayInAccount" ADD CONSTRAINT "PartnerPayInAccount_logisticsPartnerId_fkey"
    FOREIGN KEY ("logisticsPartnerId") REFERENCES "LogisticsPartner"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "PartnerPayIn" ADD CONSTRAINT "PartnerPayIn_logisticsPartnerId_fkey"
    FOREIGN KEY ("logisticsPartnerId") REFERENCES "LogisticsPartner"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "PartnerPayIn" ADD CONSTRAINT "PartnerPayIn_remittanceId_fkey"
    FOREIGN KEY ("remittanceId") REFERENCES "CodRemittance"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "RiderLocationPoint" ADD CONSTRAINT "RiderLocationPoint_riderId_fkey"
    FOREIGN KEY ("riderId") REFERENCES "LogisticsTeamMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "RiderLocationPoint" ADD CONSTRAINT "RiderLocationPoint_bookingId_fkey"
    FOREIGN KEY ("bookingId") REFERENCES "DeliveryBooking"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "PartnerPayInAccount" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PartnerPayIn" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RiderLocationPoint" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "GeocodeCache" ENABLE ROW LEVEL SECURITY;

-- Trails are deleted 7 days after delivery (or after the job is cancelled / failed). The location report route
-- does this opportunistically; once pg_cron is on, this keeps it tidy even when no rider is reporting.
-- Kept commented out so it is never scheduled by accident:
--
-- select cron.schedule(
--   'rider-trail-cleanup',
--   '23 3 * * *',
--   $$
--   delete from "RiderLocationPoint" p
--   using "DeliveryBooking" b
--   where p."bookingId" = b."id"
--     and b."status" in ('delivered', 'cancelled', 'failed')
--     and coalesce(b."deliveredAt", b."updatedAt") < now() - interval '7 days';
--   delete from "RiderLocationPoint" where "at" < now() - interval '30 days';
--   $$
-- )
-- where not exists (select 1 from cron.job where jobname = 'rider-trail-cleanup');
--
-- To stop it:
--   select cron.unschedule('rider-trail-cleanup');
