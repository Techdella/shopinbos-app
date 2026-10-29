-- Creators' payday is the seller's choice. Additive only: two new columns with defaults (weekly on Friday, what
-- every store had before), nothing changed or removed. Safe to run more than once. Run BEFORE deploying this code.
--
-- Store.affiliatePaySchedule: "weekly" (on affiliatePayDay, 0 Sunday … 6 Saturday), "monthly" (on that date, 1-28)
-- or "agreed" (with each creator; no fixed day). Set on /home/affiliates (shared/affiliates.ts).
ALTER TABLE "Store" ADD COLUMN IF NOT EXISTS "affiliatePaySchedule" TEXT NOT NULL DEFAULT 'weekly';
ALTER TABLE "Store" ADD COLUMN IF NOT EXISTS "affiliatePayDay" INTEGER NOT NULL DEFAULT 5;
