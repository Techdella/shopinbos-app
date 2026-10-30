-- Rex Studio welcome credits and Peggy call minutes.
--
--   * "AiCreditGrant": one-off AI credit grants that may only happen once per person. reason 'rex_studio_welcome': a
--                      FREE seller's usable credits topped up to 20 when Rex finished building their shop (never
--                      reduced; 0 added when they already had 20 or more; nothing on paid plans). The credits
--                      themselves are an "AiCreditLot" row with source 'rex_studio_welcome' that lasts 30 days. The row
--                      is the "already given" marker (unique per user and reason) and counts the reminders sent
--                      (nudges, at most two: day 1 and day 3 while nothing was made with Rex).
--                      Written by src/lib/ai/rex-studio-welcome.server.ts (rules in shared/rex-studio-welcome.ts).
--
--   * "PeggyCallSession": one "Talk to Peggy" voice call. mode 'plan' (paid plan), 'free' (one of a free plan's 3
--                      calls in the Lagos month) or 'credits' (after those: 10 credits a started minute by default).
--                      A credits call holds the full 10 minutes when it starts (heldCredits); when ElevenLabs reports
--                      the real length it is settled once (status open -> settled), chargedCredits kept and
--                      refundedCredits given back. conversationId is ElevenLabs' id for the call.
--                      Written by src/lib/ai/peggy-voice.server.ts (rules in shared/peggy-call-limits.ts).
--
-- Supabase turns on row level security for new tables; the app reads and writes them through Prisma's service
-- connection, so no policies are needed (nothing is readable with the anon key).
--
-- Additive only, safe to run more than once. Run BEFORE deploying the code that uses it (until then the welcome
-- grant is skipped with a log line, free calls still work, and calls paid with credits are refused with "try again"
-- so nobody is charged without a record).

CREATE TABLE IF NOT EXISTS "AiCreditGrant" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "storeId" TEXT,
  "credits" INTEGER NOT NULL DEFAULT 0,
  "balanceBefore" INTEGER NOT NULL DEFAULT 0,
  "expiresAt" TIMESTAMP(3),
  "nudges" INTEGER NOT NULL DEFAULT 0,
  "lastNudgeAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "AiCreditGrant_userId_reason_key" ON "AiCreditGrant" ("userId", "reason");
CREATE INDEX IF NOT EXISTS "AiCreditGrant_reason_createdAt_idx" ON "AiCreditGrant" ("reason", "createdAt");

ALTER TABLE "AiCreditGrant" ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS "PeggyCallSession" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "mode" TEXT NOT NULL,
  "planKey" TEXT NOT NULL,
  "maxSeconds" INTEGER NOT NULL,
  "perMinute" INTEGER NOT NULL DEFAULT 0,
  "heldCredits" INTEGER NOT NULL DEFAULT 0,
  "chargedCredits" INTEGER NOT NULL DEFAULT 0,
  "refundedCredits" INTEGER NOT NULL DEFAULT 0,
  "conversationId" TEXT,
  "seconds" INTEGER,
  "status" TEXT NOT NULL DEFAULT 'open',
  "settledBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "settledAt" TIMESTAMP(3)
);
CREATE UNIQUE INDEX IF NOT EXISTS "PeggyCallSession_conversationId_key" ON "PeggyCallSession" ("conversationId");
CREATE INDEX IF NOT EXISTS "PeggyCallSession_userId_createdAt_idx" ON "PeggyCallSession" ("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "PeggyCallSession_status_createdAt_idx" ON "PeggyCallSession" ("status", "createdAt");

ALTER TABLE "PeggyCallSession" ENABLE ROW LEVEL SECURITY;
