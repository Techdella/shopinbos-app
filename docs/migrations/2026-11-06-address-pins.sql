-- Address pins and NIPOST digital postcodes (Google Maps + postcode.gov.ng integration).
--
--   * "Supplier" and "LogisticsPartner" gain addressLat / addressLng / postcode: the pickup or depot address's pin and
--     postcode, set from "Find your address" on the profile pages and supplier onboarding.
--   * "DeliveryBooking" gains pickupPostcode, dropoffLat / dropoffLng / dropoffPostcode and dropoffGeoSource
--     (pin | nipost | google | nominatim), so riders and partner systems get the exact drop-off point.
--
-- Additive only, safe to run more than once. Run BEFORE deploying the code that uses it.

ALTER TABLE "Supplier" ADD COLUMN IF NOT EXISTS "addressLat" DOUBLE PRECISION;
ALTER TABLE "Supplier" ADD COLUMN IF NOT EXISTS "addressLng" DOUBLE PRECISION;
ALTER TABLE "Supplier" ADD COLUMN IF NOT EXISTS "postcode" TEXT;

ALTER TABLE "LogisticsPartner" ADD COLUMN IF NOT EXISTS "addressLat" DOUBLE PRECISION;
ALTER TABLE "LogisticsPartner" ADD COLUMN IF NOT EXISTS "addressLng" DOUBLE PRECISION;
ALTER TABLE "LogisticsPartner" ADD COLUMN IF NOT EXISTS "postcode" TEXT;

ALTER TABLE "DeliveryBooking" ADD COLUMN IF NOT EXISTS "pickupPostcode" TEXT;
ALTER TABLE "DeliveryBooking" ADD COLUMN IF NOT EXISTS "dropoffLat" DOUBLE PRECISION;
ALTER TABLE "DeliveryBooking" ADD COLUMN IF NOT EXISTS "dropoffLng" DOUBLE PRECISION;
ALTER TABLE "DeliveryBooking" ADD COLUMN IF NOT EXISTS "dropoffPostcode" TEXT;
ALTER TABLE "DeliveryBooking" ADD COLUMN IF NOT EXISTS "dropoffGeoSource" TEXT;
