-- Dropship agreements, and pausing businesses for money long overdue. Run AFTER 2026-11-10-money-owed.sql.
--
--   * "SupplierAgreement": before a seller lists a supplier's products to dropship, the seller calls the supplier,
--     checks the stock (a visit or a video call) and accepts the Dropship agreement; the supplier accepts it too
--     (src/lib/marketplace/agreements.server.ts, shared/supplier-trust.ts). One per seller and supplier (unique).
--     status: requested | active | declined. Listings that already exist keep working; new dropship listings and
--     automatic switches to another supplier need an active agreement.
--   * "User".debtPausedAt: set by /api/cron/money-owed (and lifted as soon as it's paid) when something the business
--     owes is 7 days overdue. A paused supplier is hidden from sellers looking for products, a paused delivery
--     partner from sellers looking for delivery (shops already working with them can still book them), and a paused
--     seller can't list new supplier products or place wholesale orders. Orders they already have carry on.
--
-- Additive only, safe to run more than once. RLS is on with no policies for the new table: only the app's server
-- connection (which bypasses RLS) reads or writes it. Run BEFORE deploying the code that uses it.

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "debtPausedAt" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "SupplierAgreement" (
  "id" TEXT NOT NULL,
  "sellerId" TEXT NOT NULL,
  "supplierId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'requested',
  "version" TEXT NOT NULL,
  "stockCheck" TEXT NOT NULL,
  "calledAt" TIMESTAMP(3) NOT NULL,
  "sellerNote" TEXT,
  "sellerAgreedAt" TIMESTAMP(3) NOT NULL,
  "supplierAgreedAt" TIMESTAMP(3),
  "supplierNote" TEXT,
  "declinedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SupplierAgreement_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "SupplierAgreement_sellerId_supplierId_key" ON "SupplierAgreement"("sellerId", "supplierId");
CREATE INDEX IF NOT EXISTS "SupplierAgreement_supplierId_status_idx" ON "SupplierAgreement"("supplierId", "status");

DO $$ BEGIN
  ALTER TABLE "SupplierAgreement" ADD CONSTRAINT "SupplierAgreement_sellerId_fkey"
    FOREIGN KEY ("sellerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "SupplierAgreement" ADD CONSTRAINT "SupplierAgreement_supplierId_fkey"
    FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "SupplierAgreement" ENABLE ROW LEVEL SECURITY;
