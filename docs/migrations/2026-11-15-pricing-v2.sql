-- October 2026 pricing (shared/plans.ts): plan credits refill monthly; bought, bonus and refunded credits last
-- 12 months each (AiCreditLot). Existing balances become a lot that expires 12 months after the first spend or read
-- (src/lib/ai/credits.server.ts creates it). Plan rows are renamed by src/lib/plans/catalog.server.ts on first load.
ALTER TABLE "AiCreditAccount" ADD COLUMN IF NOT EXISTS "planCredits" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "AiCreditAccount" ADD COLUMN IF NOT EXISTS "planPeriod" TEXT;
ALTER TABLE "AiCreditAccount" ADD COLUMN IF NOT EXISTS "planKey" TEXT;
CREATE TABLE IF NOT EXISTS "AiCreditLot" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "credits" INTEGER NOT NULL,
  "source" TEXT NOT NULL,
  "reference" TEXT,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "AiCreditLot_userId_expiresAt_idx" ON "AiCreditLot" ("userId", "expiresAt");
ALTER TABLE "AiCreditLot" ENABLE ROW LEVEL SECURITY;
