-- Auth security (agent: auth hardening): sign-in/security event log and rate-limit/lockout counters.
-- Additive only. Safe to run more than once. RLS on with no policies: only the server (Prisma, service role)
-- reads or writes these tables; the anon key cannot.
-- Until this runs, the app falls back to in-memory limits (per server instance) and skips event logging,
-- new-device emails and the "Recent activity" list.

CREATE TABLE IF NOT EXISTS "AuthEvent" (
    "id" TEXT NOT NULL,
    "supabaseId" TEXT,
    "type" TEXT NOT NULL,
    "method" TEXT,
    "ipHash" TEXT,
    "userAgent" TEXT,
    "deviceId" TEXT,
    "detail" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuthEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "AuthEvent_supabaseId_createdAt_idx" ON "AuthEvent"("supabaseId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "AuthEvent_supabaseId_deviceId_idx" ON "AuthEvent"("supabaseId", "deviceId");
CREATE INDEX IF NOT EXISTS "AuthEvent_type_createdAt_idx" ON "AuthEvent"("type", "createdAt" DESC);

CREATE TABLE IF NOT EXISTS "AuthThrottle" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "windowStart" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "failures" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuthThrottle_pkey" PRIMARY KEY ("key")
);
CREATE INDEX IF NOT EXISTS "AuthThrottle_updatedAt_idx" ON "AuthThrottle"("updatedAt");

ALTER TABLE "AuthEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AuthThrottle" ENABLE ROW LEVEL SECURITY;

-- Optional housekeeping (run from a cron if wanted): old counters and events.
-- DELETE FROM "AuthThrottle" WHERE "updatedAt" < now() - interval '2 days';
-- DELETE FROM "AuthEvent" WHERE "createdAt" < now() - interval '400 days';
