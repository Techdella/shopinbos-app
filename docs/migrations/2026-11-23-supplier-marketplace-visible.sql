-- Admin › Suppliers: show or hide a supplier in the marketplace (src/lib/marketplace/agreements.server.ts VISIBLE_SUPPLIER).
-- Additive and safe to re-run. Run it before deploying.
ALTER TABLE "Supplier" ADD COLUMN IF NOT EXISTS "marketplaceVisible" BOOLEAN NOT NULL DEFAULT true;
