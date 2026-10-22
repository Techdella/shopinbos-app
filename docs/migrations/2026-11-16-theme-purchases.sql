-- Single themes bought outright instead of upgrading the plan (src/lib/themes/purchase.server.ts).
CREATE TABLE IF NOT EXISTS "ThemePurchase" (
  "reference" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "themeId" TEXT NOT NULL,
  "tier" TEXT NOT NULL,
  "amountKobo" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "error" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "paidAt" TIMESTAMP(3),
  CONSTRAINT "ThemePurchase_pkey" PRIMARY KEY ("reference")
);
CREATE INDEX IF NOT EXISTS "ThemePurchase_userId_status_idx" ON "ThemePurchase"("userId", "status");
-- Only the server (Prisma) reads it, like the other tables.
ALTER TABLE "ThemePurchase" ENABLE ROW LEVEL SECURITY;
