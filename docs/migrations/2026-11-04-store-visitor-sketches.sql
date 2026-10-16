-- Unique visitors for store traffic. Run BEFORE deploying the code that ships with it (the storefront traffic
-- beacon adds each day's visitors to StoreVisitorSketch; until then it logs and carries on, and
-- /home/analytics/traffic shows 0 unique visitors). Additive only, safe to run more than once. RLS on with no
-- policies: the app reaches this table through Prisma's server connection only, so the Supabase REST API can't
-- read it.

-- One HyperLogLog sketch per store per Lagos day (src/lib/analytics/hll.ts): register bytes only. No visitor
-- token, hash, IP or user agent is stored; days are merged register by register to count unique visitors over a
-- range without counting the same person once per day.
CREATE TABLE IF NOT EXISTS "StoreVisitorSketch" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "sketch" BYTEA NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StoreVisitorSketch_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "StoreVisitorSketch_storeId_day_key" ON "StoreVisitorSketch"("storeId", "day");
ALTER TABLE "StoreVisitorSketch" ENABLE ROW LEVEL SECURITY;
