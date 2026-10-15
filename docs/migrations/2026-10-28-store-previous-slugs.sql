-- Store web addresses that keep working after a change (src/lib/store-address.server.ts).
--
--   * "previousSlugs": addresses the store had before, newest first. <old>.mybos.store (and /s/<old>) redirect to
--                      the current address, and no other store can claim them.
--   * "slugChangedAt": when the address last changed; a store can change it at most once every 30 days.
--
-- Renaming a store no longer changes its address; only an explicit address change does.
-- Additive only, safe to run more than once. Run BEFORE deploying the code that uses it (Prisma reads every column
-- of "Store").

ALTER TABLE "Store" ADD COLUMN IF NOT EXISTS "previousSlugs" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Store" ADD COLUMN IF NOT EXISTS "slugChangedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "Store_previousSlugs_idx" ON "Store" USING GIN ("previousSlugs");
