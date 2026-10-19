-- Follow-ups: shared rate limits.
--
--   * "RateLimitBucket": one row per limiter key and fixed window. src/lib/rate-limit.ts (checkRateLimitShared)
--     counts a request with one atomic
--       INSERT … ON CONFLICT ("key", "windowStart") DO UPDATE SET "count" = "RateLimitBucket"."count" + 1 RETURNING …
--     so a limit holds across every serverless instance instead of per instance. Keys hold a hash of the IP or
--     identifier, never the raw value. Rows expire after two windows (the previous window feeds the sliding
--     estimate) and are deleted opportunistically (about 1% of checks, 500 rows at a time) using the "expiresAt"
--     index.
--
-- Product feed tokens: no schema change. The older feeds (/api/public/feeds/<slug>/<channel>.<xml|csv>) now need
-- ?token=, checked against the store's existing "WhatsAppCatalog"."feedToken" (one private key per store, rotated
-- from Inbox → WhatsApp catalog), created on first view of /channels.
--
-- Additive only (one new table), safe to run more than once. RLS is on with no policies: only the app's server
-- connection (which bypasses RLS) reads or writes it, never the Supabase anon/authenticated keys.
-- Run BEFORE deploying the code that uses it. (Before it runs, the limiter falls back to per-instance memory
-- with a warning, including for the fail-closed sign-in limits, so nobody is locked out by a missing table.)

CREATE TABLE IF NOT EXISTS "RateLimitBucket" (
  "key" TEXT NOT NULL,
  "windowStart" TIMESTAMP(3) NOT NULL,
  "count" INTEGER NOT NULL DEFAULT 0,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RateLimitBucket_pkey" PRIMARY KEY ("key", "windowStart")
);
CREATE INDEX IF NOT EXISTS "RateLimitBucket_expiresAt_idx" ON "RateLimitBucket"("expiresAt");

ALTER TABLE "RateLimitBucket" ENABLE ROW LEVEL SECURITY;
