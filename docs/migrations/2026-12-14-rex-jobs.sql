-- Rex jobs: a durable record of each paid Rex generation (logos and logo edits, Rex Studio pictures and creative
-- flyers, Create with Rex posts, statuses and flyers, premium packaging, store banners, video scripts, reel shots and
-- voiceovers), so a seller who loses signal, presses back or closes the app while Rex works gets the result when
-- they come back, and is never charged twice for the same tap.
--
--   * "RexJob": one row per (userId, clientKey). clientKey is the idempotency key the app or browser makes for one
--               "Generate" tap and sends again on a retry. status queued | running | done | failed. input is a short
--               copy of the ask (no photos, audio or long text); result is what the route answered with (stored
--               picture and audio URLs, words). creditsCharged is what the job holds now (charges minus refunds), so
--               a job that fails or is cut off gives exactly that back. seenAt is set once the seller has seen the
--               result ("Rex finished your logo while you were away").
--
-- Written by src/lib/ai/rex-jobs.server.ts (rules in shared/rex-jobs.ts); read by GET /api/app/rex-jobs.
--
-- Supabase turns on row level security for new tables; the app reads and writes them through Prisma's service
-- connection, so no policies are needed.
--
-- Additive only, safe to run more than once. Run BEFORE deploying the code that uses it (until then the routes run
-- the old way, without resume).

CREATE TABLE IF NOT EXISTS "RexJob" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "storeId" TEXT,
  "kind" TEXT NOT NULL,
  "clientKey" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'queued',
  "input" JSONB,
  "result" JSONB,
  "creditsCharged" INTEGER NOT NULL DEFAULT 0,
  "error" TEXT,
  "seenAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "RexJob_userId_clientKey_key" ON "RexJob" ("userId", "clientKey");
CREATE INDEX IF NOT EXISTS "RexJob_userId_status_updatedAt_idx" ON "RexJob" ("userId", "status", "updatedAt");

ALTER TABLE "RexJob" ENABLE ROW LEVEL SECURITY;
