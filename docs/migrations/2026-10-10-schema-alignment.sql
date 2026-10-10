-- Schema alignment for the 2026-10-10 typecheck/launch-QA pass.
--
-- Additive only: no DROP TABLE, DROP COLUMN or destructive ALTER.
-- Follow docs/production-database-safety.md: back up first, run on staging, then production.
--
-- This file covers only the columns the app code now depends on. The live database
-- is behind prisma/schema.prisma in other places too (for example Collection,
-- Subscriber, ShippingZone and StoreForm tables). Generate and review the full diff with:
--   npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script

-- Logistics partner verification documents (written by /api/logistics/verification/*,
-- read by /api/logistics/me and /admin/logistics-partners/[id]).
ALTER TABLE "LogisticsPartner"
  ADD COLUMN IF NOT EXISTS "verificationDocuments" JSONB NOT NULL DEFAULT '[]';

-- Seller fulfilment choice saved from the order detail page (PATCH /api/app/orders/[id]).
ALTER TABLE "RetailOrder"
  ADD COLUMN IF NOT EXISTS "logisticsDetails" JSONB;

-- NotificationType values present in the Prisma schema but missing from the database.
-- ADD VALUE cannot run inside a transaction block on some setups; run these statements on their own.
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'inventory';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'logistics';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'products';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'customers';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'suppliers';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'store_builder';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'marketing';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'rexai';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'checkout';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'category';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'health';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'activity';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'dropshipping';

-- NotificationPreference channel columns and the (userId, eventKey, category) key.
DO $$ BEGIN
  CREATE TYPE "DigestFrequency" AS ENUM ('immediate', 'hourly', 'daily', 'weekly', 'disabled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Existing rows are message preferences, which notify with type "marketplace".
ALTER TABLE "NotificationPreference"
  ADD COLUMN IF NOT EXISTS "category" "NotificationType" NOT NULL DEFAULT 'marketplace',
  ADD COLUMN IF NOT EXISTS "whatsapp" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "push" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "browser" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "digestFrequency" "DigestFrequency" NOT NULL DEFAULT 'immediate';
ALTER TABLE "NotificationPreference" ALTER COLUMN "category" DROP DEFAULT;

CREATE INDEX IF NOT EXISTS "NotificationPreference_category_idx" ON "NotificationPreference"("category");
CREATE UNIQUE INDEX IF NOT EXISTS "NotificationPreference_userId_eventKey_category_key"
  ON "NotificationPreference"("userId", "eventKey", "category");
-- The old two-column key is superseded by the three-column key above.
DROP INDEX IF EXISTS "NotificationPreference_userId_eventKey_key";
