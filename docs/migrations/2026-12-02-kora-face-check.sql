-- Face check for the Shopinbos Wallet (src/lib/korapay-liveness.ts): Kora's liveness check with a face match against
-- the verified NIN's photo, from the phone app. Only the result, Kora's reference and the consent time are kept.
-- Additive only: new columns with defaults, nothing changed or removed. Safe to run more than once.
-- Run BEFORE deploying: the app reads these columns.

ALTER TABLE "Wallet" ADD COLUMN IF NOT EXISTS "kycFaceStatus" TEXT NOT NULL DEFAULT 'none';
ALTER TABLE "Wallet" ADD COLUMN IF NOT EXISTS "kycFaceReference" TEXT;
ALTER TABLE "Wallet" ADD COLUMN IF NOT EXISTS "kycFaceCheckedAt" TIMESTAMP(3);
ALTER TABLE "Wallet" ADD COLUMN IF NOT EXISTS "kycFaceConsentAt" TIMESTAMP(3);
