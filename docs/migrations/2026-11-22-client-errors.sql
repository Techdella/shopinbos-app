-- Admin › App errors (src/app/admin/errors): errors people hit in the browser, with the page, browser and account.
CREATE TABLE IF NOT EXISTS "ClientError" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "fingerprint" TEXT NOT NULL,
  "userId" TEXT,
  "role" TEXT,
  "kind" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "shown" TEXT,
  "stack" TEXT,
  "digest" TEXT,
  "path" TEXT NOT NULL,
  "pagePattern" TEXT NOT NULL,
  "userAgent" TEXT,
  "browser" TEXT NOT NULL,
  "count" INTEGER NOT NULL DEFAULT 1,
  "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedAt" TIMESTAMP(3)
);
CREATE INDEX IF NOT EXISTS "ClientError_resolvedAt_lastSeenAt_idx" ON "ClientError"("resolvedAt", "lastSeenAt" DESC);
CREATE INDEX IF NOT EXISTS "ClientError_userId_lastSeenAt_idx" ON "ClientError"("userId", "lastSeenAt" DESC);
CREATE INDEX IF NOT EXISTS "ClientError_fingerprint_idx" ON "ClientError"("fingerprint");
-- Only the server (service role / Prisma) reads and writes it.
ALTER TABLE "ClientError" ENABLE ROW LEVEL SECURITY;
-- What they did just before the error (pages opened, buttons tapped).
ALTER TABLE "ClientError" ADD COLUMN IF NOT EXISTS "trail" TEXT;
