-- Tiered verification for delivery partners (shared/partner-tiers.ts): Tier 1 Verified Individual (no CAC) and
-- Tier 2 Registered Business, vehicles, guarantors, badges, order limits and graduation.
-- Additive only: new columns with defaults and two new tables; nothing changed or removed. Safe to run more than
-- once. Run BEFORE deploying: the app reads these columns.

ALTER TABLE "LogisticsPartner" ADD COLUMN IF NOT EXISTS "verificationTier" TEXT NOT NULL DEFAULT 'none';
ALTER TABLE "LogisticsPartner" ADD COLUMN IF NOT EXISTS "identityChecks" JSONB NOT NULL DEFAULT '{}';
ALTER TABLE "LogisticsPartner" ADD COLUMN IF NOT EXISTS "badges" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "LogisticsPartner" ADD COLUMN IF NOT EXISTS "statusReason" TEXT;
ALTER TABLE "LogisticsPartner" ADD COLUMN IF NOT EXISTS "kycSubmittedAt" TIMESTAMP(3);
ALTER TABLE "LogisticsPartner" ADD COLUMN IF NOT EXISTS "limitsLiftedAt" TIMESTAMP(3);
ALTER TABLE "LogisticsPartner" ADD COLUMN IF NOT EXISTS "termsVersion" TEXT;
ALTER TABLE "LogisticsPartner" ADD COLUMN IF NOT EXISTS "termsAcceptedAt" TIMESTAMP(3);
ALTER TABLE "LogisticsPartner" ADD COLUMN IF NOT EXISTS "cacType" TEXT;
ALTER TABLE "LogisticsPartner" ADD COLUMN IF NOT EXISTS "registeredName" TEXT;
ALTER TABLE "LogisticsPartner" ADD COLUMN IF NOT EXISTS "businessAddress" TEXT;
CREATE INDEX IF NOT EXISTS "LogisticsPartner_verificationStatus_kycSubmittedAt_idx" ON "LogisticsPartner" ("verificationStatus", "kycSubmittedAt");

-- Partners verified before tiers existed had to send a CAC certificate (and insurance): they are Registered
-- Businesses, with no limits. Only rows still on the default tier are touched, so a re-run changes nothing.
UPDATE "LogisticsPartner"
SET "verificationTier" = 'tier2',
    "badges" = ARRAY['registered_business']::TEXT[],
    "registeredName" = COALESCE("registeredName", "companyName")
WHERE "verificationStatus" = 'verified' AND "verificationTier" = 'none';

CREATE TABLE IF NOT EXISTS "LogisticsVehicle" (
  "id" TEXT NOT NULL,
  "logisticsPartnerId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "plateNumber" TEXT NOT NULL,
  "photoPath" TEXT NOT NULL,
  "licencePath" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "rejectionReason" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "LogisticsVehicle_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "LogisticsVehicle_logisticsPartnerId_fkey" FOREIGN KEY ("logisticsPartnerId") REFERENCES "LogisticsPartner"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "LogisticsVehicle_logisticsPartnerId_idx" ON "LogisticsVehicle" ("logisticsPartnerId");
CREATE INDEX IF NOT EXISTS "LogisticsVehicle_status_idx" ON "LogisticsVehicle" ("status");

CREATE TABLE IF NOT EXISTS "LogisticsGuarantor" (
  "id" TEXT NOT NULL,
  "logisticsPartnerId" TEXT NOT NULL,
  "fullName" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "address" TEXT NOT NULL,
  "relationship" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "respondedVia" TEXT,
  "respondedAt" TIMESTAMP(3),
  "codeHash" TEXT,
  "codeExpiresAt" TIMESTAMP(3),
  "codeAttempts" INTEGER NOT NULL DEFAULT 0,
  "tokenHash" TEXT,
  "lastSentAt" TIMESTAMP(3),
  "sendCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "LogisticsGuarantor_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "LogisticsGuarantor_logisticsPartnerId_fkey" FOREIGN KEY ("logisticsPartnerId") REFERENCES "LogisticsPartner"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "LogisticsGuarantor_logisticsPartnerId_key" ON "LogisticsGuarantor" ("logisticsPartnerId");
CREATE UNIQUE INDEX IF NOT EXISTS "LogisticsGuarantor_tokenHash_key" ON "LogisticsGuarantor" ("tokenHash");
CREATE INDEX IF NOT EXISTS "LogisticsGuarantor_status_idx" ON "LogisticsGuarantor" ("status");
