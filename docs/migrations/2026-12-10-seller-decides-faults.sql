-- The shop is the seller's business (like Shopify): when something goes wrong, Shopinbos works out a suggested outcome
-- (shared/fault-matrix.ts) and the seller accepts it or handles it themselves. Nothing moves until they do.
-- Additive only. Safe to run more than once. Run BEFORE deploying this code.
ALTER TABLE "FaultCase" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'applied';
ALTER TABLE "FaultCase" ADD COLUMN IF NOT EXISTS "decidedAt" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "FaultCase_storeId_status_idx" ON "FaultCase" ("storeId", "status");
