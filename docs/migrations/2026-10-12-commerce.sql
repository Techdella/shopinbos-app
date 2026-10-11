-- Commerce (agent B): abandoned-cart capture at checkout, recovery links and recovery tracking.
-- Additive only: nullable / defaulted columns, one unique index, one index. Email becomes optional so a
-- cart can be captured from a phone number before the shopper types an email.

ALTER TABLE "AbandonedCartEvent" ALTER COLUMN "email" DROP NOT NULL;

ALTER TABLE "AbandonedCartEvent" ADD COLUMN IF NOT EXISTS "phone" TEXT;
ALTER TABLE "AbandonedCartEvent" ADD COLUMN IF NOT EXISTS "recoveryToken" TEXT;
ALTER TABLE "AbandonedCartEvent" ADD COLUMN IF NOT EXISTS "checkoutStep" TEXT;
ALTER TABLE "AbandonedCartEvent" ADD COLUMN IF NOT EXISTS "discountCode" TEXT;
ALTER TABLE "AbandonedCartEvent" ADD COLUMN IF NOT EXISTS "remindersSent" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "AbandonedCartEvent" ADD COLUMN IF NOT EXISTS "lastReminderAt" TIMESTAMP(3);
ALTER TABLE "AbandonedCartEvent" ADD COLUMN IF NOT EXISTS "restoredAt" TIMESTAMP(3);
ALTER TABLE "AbandonedCartEvent" ADD COLUMN IF NOT EXISTS "recoveredAt" TIMESTAMP(3);
ALTER TABLE "AbandonedCartEvent" ADD COLUMN IF NOT EXISTS "orderId" TEXT;
ALTER TABLE "AbandonedCartEvent" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE UNIQUE INDEX IF NOT EXISTS "AbandonedCartEvent_recoveryToken_key" ON "AbandonedCartEvent"("recoveryToken");
CREATE INDEX IF NOT EXISTS "AbandonedCartEvent_storeId_recoveredAt_idx" ON "AbandonedCartEvent"("storeId", "recoveredAt");

-- Shoppers reach this table only through the server (Prisma); keep RLS on so the anon key cannot read carts.
ALTER TABLE "AbandonedCartEvent" ENABLE ROW LEVEL SECURITY;
