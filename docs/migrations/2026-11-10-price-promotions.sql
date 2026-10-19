-- Price promotions (Admin › Pricing › Promotions, shared/price-promotions.ts): Black Friday and seasonal price
-- drops that override some prices for a while and announce themselves by email, in-app notice and push.
--
-- Additive only, safe to run more than once. Run BEFORE deploying.

CREATE TABLE IF NOT EXISTS "PricePromotion" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "headline" TEXT NOT NULL,
  "message" TEXT,
  "prices" JSONB NOT NULL,
  "startsAt" TIMESTAMP(3) NOT NULL,
  "endsAt" TIMESTAMP(3) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'scheduled',
  "audience" TEXT[],
  "announceEmail" BOOLEAN NOT NULL DEFAULT true,
  "announceNotice" BOOLEAN NOT NULL DEFAULT true,
  "broadcastId" TEXT,
  "noticeStatus" TEXT NOT NULL DEFAULT 'pending',
  "noticeCursor" TEXT,
  "noticeCount" INTEGER NOT NULL DEFAULT 0,
  "createdById" TEXT,
  "cancelledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PricePromotion_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "PricePromotion_status_startsAt_idx" ON "PricePromotion"("status", "startsAt");
CREATE INDEX IF NOT EXISTS "PricePromotion_endsAt_idx" ON "PricePromotion"("endsAt");
DO $$ BEGIN
  ALTER TABLE "PricePromotion" ADD CONSTRAINT "PricePromotion_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Server-only: no policies, so the anon and authenticated roles can't read it through the Supabase API.
ALTER TABLE "PricePromotion" ENABLE ROW LEVEL SECURITY;
