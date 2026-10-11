-- Riders app, rider assignment, cash-on-delivery pay-ins, delivery partner API keys and webhooks.
-- Additive: nullable columns and three new tables.

-- AlterTable
ALTER TABLE "LogisticsTeamMember" ADD COLUMN     "lastSeenAt" TIMESTAMP(3),
ADD COLUMN     "online" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "riderTokenHash" TEXT;

-- AlterTable
ALTER TABLE "DeliveryBooking" ADD COLUMN     "codAmount" DOUBLE PRECISION,
ADD COLUMN     "codCollected" DOUBLE PRECISION,
ADD COLUMN     "codCollectedAt" TIMESTAMP(3),
ADD COLUMN     "codMethod" TEXT,
ADD COLUMN     "deliveryCode" TEXT,
ADD COLUMN     "failedReason" TEXT,
ADD COLUMN     "pickedUpAt" TIMESTAMP(3),
ADD COLUMN     "proofUrl" TEXT,
ADD COLUMN     "remittanceId" TEXT,
ADD COLUMN     "riderId" TEXT;

-- CreateTable
CREATE TABLE "CodRemittance" (
    "id" TEXT NOT NULL,
    "logisticsPartnerId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "method" TEXT NOT NULL DEFAULT 'transfer',
    "reference" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CodRemittance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnerApiKey" (
    "id" TEXT NOT NULL,
    "logisticsPartnerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PartnerApiKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnerWebhook" (
    "id" TEXT NOT NULL,
    "logisticsPartnerId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "secret" TEXT NOT NULL,
    "events" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastStatus" INTEGER,
    "lastDeliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PartnerWebhook_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CodRemittance_logisticsPartnerId_createdAt_idx" ON "CodRemittance"("logisticsPartnerId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PartnerApiKey_keyHash_key" ON "PartnerApiKey"("keyHash");

-- CreateIndex
CREATE INDEX "PartnerApiKey_logisticsPartnerId_idx" ON "PartnerApiKey"("logisticsPartnerId");

-- CreateIndex
CREATE INDEX "PartnerWebhook_logisticsPartnerId_idx" ON "PartnerWebhook"("logisticsPartnerId");

-- CreateIndex
CREATE UNIQUE INDEX "LogisticsTeamMember_riderTokenHash_key" ON "LogisticsTeamMember"("riderTokenHash");

-- CreateIndex
CREATE INDEX "DeliveryBooking_riderId_idx" ON "DeliveryBooking"("riderId");

-- AddForeignKey
ALTER TABLE "DeliveryBooking" ADD CONSTRAINT "DeliveryBooking_riderId_fkey" FOREIGN KEY ("riderId") REFERENCES "LogisticsTeamMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryBooking" ADD CONSTRAINT "DeliveryBooking_remittanceId_fkey" FOREIGN KEY ("remittanceId") REFERENCES "CodRemittance"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CodRemittance" ADD CONSTRAINT "CodRemittance_logisticsPartnerId_fkey" FOREIGN KEY ("logisticsPartnerId") REFERENCES "LogisticsPartner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerApiKey" ADD CONSTRAINT "PartnerApiKey_logisticsPartnerId_fkey" FOREIGN KEY ("logisticsPartnerId") REFERENCES "LogisticsPartner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerWebhook" ADD CONSTRAINT "PartnerWebhook_logisticsPartnerId_fkey" FOREIGN KEY ("logisticsPartnerId") REFERENCES "LogisticsPartner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

