-- Preorders (shared/preorder.ts): suppliers take preorders for stock on marketplace listings, and sellers take
-- preorders from shoppers on store products. Additive only: new columns with defaults, nothing changed or removed.
-- Safe to run more than once. Run BEFORE deploying: the app reads these columns.

ALTER TABLE "SupplierProduct" ADD COLUMN IF NOT EXISTS "preorderEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "SupplierProduct" ADD COLUMN IF NOT EXISTS "preorderShipsAt" TIMESTAMP(3);
ALTER TABLE "SupplierProduct" ADD COLUMN IF NOT EXISTS "preorderLimit" INTEGER;
ALTER TABLE "SupplierProduct" ADD COLUMN IF NOT EXISTS "preorderTaken" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "SupplierProduct" ADD COLUMN IF NOT EXISTS "preorderNote" TEXT;

ALTER TABLE "StoreProduct" ADD COLUMN IF NOT EXISTS "preorderEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "StoreProduct" ADD COLUMN IF NOT EXISTS "preorderShipsAt" TIMESTAMP(3);
ALTER TABLE "StoreProduct" ADD COLUMN IF NOT EXISTS "preorderLimit" INTEGER;
ALTER TABLE "StoreProduct" ADD COLUMN IF NOT EXISTS "preorderTaken" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "StoreProduct" ADD COLUMN IF NOT EXISTS "preorderNote" TEXT;

ALTER TABLE "WholesaleOrder" ADD COLUMN IF NOT EXISTS "preorder" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "WholesaleOrder" ADD COLUMN IF NOT EXISTS "preorderShipsAt" TIMESTAMP(3);
