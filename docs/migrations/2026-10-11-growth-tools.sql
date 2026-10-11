-- Record a sale (payment method), affiliates and ads. Additive: new nullable columns on RetailOrder and two new tables.
-- Safe on the live database; existing orders keep NULL.

-- AlterTable
ALTER TABLE "RetailOrder" ADD COLUMN     "adCampaignId" TEXT,
ADD COLUMN     "affiliateCommission" DOUBLE PRECISION,
ADD COLUMN     "affiliateId" TEXT,
ADD COLUMN     "affiliatePaidAt" TIMESTAMP(3),
ADD COLUMN     "paymentMethod" TEXT;

-- CreateTable
CREATE TABLE "Affiliate" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "code" TEXT NOT NULL,
    "commissionRate" DOUBLE PRECISION NOT NULL DEFAULT 10,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Affiliate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdCampaign" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "storeProductId" TEXT,
    "code" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "destination" TEXT NOT NULL DEFAULT 'whatsapp',
    "headline" TEXT NOT NULL,
    "primaryText" TEXT NOT NULL,
    "imageUrl" TEXT,
    "dailyBudget" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "days" INTEGER NOT NULL DEFAULT 5,
    "spend" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "startedAt" TIMESTAMP(3),
    "pausedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Affiliate_storeId_idx" ON "Affiliate"("storeId");

-- CreateIndex
CREATE UNIQUE INDEX "Affiliate_storeId_code_key" ON "Affiliate"("storeId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "AdCampaign_code_key" ON "AdCampaign"("code");

-- CreateIndex
CREATE INDEX "AdCampaign_storeId_idx" ON "AdCampaign"("storeId");

-- CreateIndex
CREATE INDEX "RetailOrder_affiliateId_idx" ON "RetailOrder"("affiliateId");

-- CreateIndex
CREATE INDEX "RetailOrder_adCampaignId_idx" ON "RetailOrder"("adCampaignId");

-- AddForeignKey
ALTER TABLE "RetailOrder" ADD CONSTRAINT "RetailOrder_affiliateId_fkey" FOREIGN KEY ("affiliateId") REFERENCES "Affiliate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailOrder" ADD CONSTRAINT "RetailOrder_adCampaignId_fkey" FOREIGN KEY ("adCampaignId") REFERENCES "AdCampaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Affiliate" ADD CONSTRAINT "Affiliate_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdCampaign" ADD CONSTRAINT "AdCampaign_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

