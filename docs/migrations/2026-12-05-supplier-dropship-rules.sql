-- Supplier & dropship rules (shared/dropship-rules.ts): prices per channel and dropship options on supplier products,
-- the supplier's delivery rate card by zone, who pays delivery and the branding on a seller's dropship product, the
-- pack-it-the-seller's-way checklist and sealed-parcel photo on dropship orders, the seller's sticker pack at a
-- supplier, and track-record levels for suppliers (pre-orders at Established) and delivery partners (pay on delivery
-- at Cash trusted). Additive only: new columns with defaults or nulls. No new table, so no new RLS. Safe to run more
-- than once. Run BEFORE deploying: the app reads these columns.

ALTER TABLE "Supplier" ADD COLUMN IF NOT EXISTS "level" TEXT NOT NULL DEFAULT 'new';
ALTER TABLE "Supplier" ADD COLUMN IF NOT EXISTS "levelCheckedAt" TIMESTAMP(3);
ALTER TABLE "Supplier" ADD COLUMN IF NOT EXISTS "missedReadyDates" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Supplier" ADD COLUMN IF NOT EXISTS "brandingOffer" JSONB NOT NULL DEFAULT '{}';

ALTER TABLE "SupplierProduct" ADD COLUMN IF NOT EXISTS "priceMode" TEXT NOT NULL DEFAULT 'same';
ALTER TABLE "SupplierProduct" ADD COLUMN IF NOT EXISTS "dropshipPrice" DOUBLE PRECISION;
ALTER TABLE "SupplierProduct" ADD COLUMN IF NOT EXISTS "preorderPrice" DOUBLE PRECISION;
ALTER TABLE "SupplierProduct" ADD COLUMN IF NOT EXISTS "minRetailPrice" DOUBLE PRECISION;
ALTER TABLE "SupplierProduct" ADD COLUMN IF NOT EXISTS "dropshipMinQty" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "SupplierProduct" ADD COLUMN IF NOT EXISTS "handlingDays" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "SupplierProduct" ADD COLUMN IF NOT EXISTS "sizeBand" TEXT;

ALTER TABLE "StoreProduct" ADD COLUMN IF NOT EXISTS "deliveryPayer" TEXT NOT NULL DEFAULT 'customer';
ALTER TABLE "StoreProduct" ADD COLUMN IF NOT EXISTS "deliveryFlatFee" DOUBLE PRECISION;
ALTER TABLE "StoreProduct" ADD COLUMN IF NOT EXISTS "brandingChoice" TEXT NOT NULL DEFAULT 'blind';

ALTER TABLE "SupplierOrder" ADD COLUMN IF NOT EXISTS "branding" JSONB NOT NULL DEFAULT '{}';
ALTER TABLE "SupplierOrder" ADD COLUMN IF NOT EXISTS "packSteps" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "SupplierOrder" ADD COLUMN IF NOT EXISTS "packPhotoUrl" TEXT;

ALTER TABLE "LogisticsPartner" ADD COLUMN IF NOT EXISTS "level" TEXT NOT NULL DEFAULT 'verified';
ALTER TABLE "LogisticsPartner" ADD COLUMN IF NOT EXISTS "levelCheckedAt" TIMESTAMP(3);
ALTER TABLE "LogisticsPartner" ADD COLUMN IF NOT EXISTS "codCashCap" DOUBLE PRECISION NOT NULL DEFAULT 100000;

ALTER TABLE "DeliverySettings" ADD COLUMN IF NOT EXISTS "rateSource" TEXT NOT NULL DEFAULT 'partners';
ALTER TABLE "DeliverySettings" ADD COLUMN IF NOT EXISTS "zoneRates" JSONB NOT NULL DEFAULT '{}';

ALTER TABLE "SupplierAgreement" ADD COLUMN IF NOT EXISTS "stickerPackLeft" INTEGER;

-- Pay on delivery is now only for Cash trusted partners. Every partner starts at "verified", so switch it off until
-- refreshPartnerLevel (src/lib/logistics/partner-levels.server.ts) finds they've earned it. Their shop connections'
-- pay-on-delivery switch goes off with it, as savePartnerMarketCoverage does when a partner turns it off.
UPDATE "LogisticsPartner" SET "offersPayOnDelivery" = false WHERE "offersPayOnDelivery" = true AND "level" <> 'cash_trusted';
UPDATE "DeliveryConnection" c SET "partnerPod" = false
  FROM "LogisticsPartner" p WHERE c."logisticsPartnerId" = p."id" AND c."partnerPod" = true AND p."offersPayOnDelivery" = false;

-- Pre-orders are now only for Established suppliers. Existing pre-order listings stay as they are (shops may have
-- ordered); new ones are refused by the API until refreshSupplierLevel finds the supplier Established.
