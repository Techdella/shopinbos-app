-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Locale" AS ENUM ('en', 'pcm', 'yo', 'ha', 'ig');

-- CreateEnum
CREATE TYPE "OrgType" AS ENUM ('SELLER', 'SUPPLIER', 'LOGISTICS', 'SOURCING_PARTNER', 'PLATFORM');

-- CreateEnum
CREATE TYPE "KycStatus" AS ENUM ('NONE', 'PENDING', 'VERIFIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "MembershipRole" AS ENUM ('OWNER', 'ADMIN', 'STAFF', 'DISPATCHER', 'RIDER', 'VIEWER');

-- CreateEnum
CREATE TYPE "DeviceApp" AS ENUM ('SELLER', 'RIDERS', 'PARTNERS');

-- CreateEnum
CREATE TYPE "DevicePlatform" AS ENUM ('IOS', 'ANDROID', 'WEB');

-- CreateEnum
CREATE TYPE "KycKind" AS ENUM ('BVN', 'NIN', 'CAC', 'ADDRESS', 'SELFIE');

-- CreateEnum
CREATE TYPE "KycCheckStatus" AS ENUM ('PENDING', 'PASSED', 'FAILED', 'ERROR');

-- CreateEnum
CREATE TYPE "StoreStatus" AS ENUM ('DRAFT', 'LIVE', 'PAUSED');

-- CreateEnum
CREATE TYPE "LogoStyle" AS ENUM ('editorial', 'monogram', 'bold', 'serif', 'uploaded');

-- CreateEnum
CREATE TYPE "BrandSource" AS ENUM ('REX', 'UPLOAD');

-- CreateEnum
CREATE TYPE "AssetKind" AS ENUM ('PRODUCT_PHOTO', 'LOGO', 'VIDEO', 'LABEL_PDF', 'QC_PHOTO', 'PROOF_PHOTO', 'DOC');

-- CreateEnum
CREATE TYPE "GeneratedBy" AS ENUM ('USER', 'REX', 'PEGGY', 'SYSTEM');

-- CreateEnum
CREATE TYPE "DomainType" AS ENUM ('SUBDOMAIN', 'CUSTOM', 'PURCHASED');

-- CreateEnum
CREATE TYPE "DomainStatus" AS ENUM ('PENDING_DNS', 'VERIFYING', 'ACTIVE', 'FAILED');

-- CreateEnum
CREATE TYPE "DomainProviderKind" AS ENUM ('VERCEL', 'CLOUDFLARE');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "supabaseId" UUID,
    "phone" TEXT,
    "email" TEXT,
    "name" TEXT,
    "avatarUrl" TEXT,
    "locale" "Locale" NOT NULL DEFAULT 'en',
    "lastSeenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "type" "OrgType" NOT NULL,
    "name" TEXT NOT NULL,
    "kycStatus" "KycStatus" NOT NULL DEFAULT 'NONE',
    "kycLevel" INTEGER NOT NULL DEFAULT 0,
    "cacNumber" TEXT,
    "country" TEXT NOT NULL DEFAULT 'NG',
    "state" TEXT,
    "city" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Membership" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "role" "MembershipRole" NOT NULL,
    "permissions" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Device" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "app" "DeviceApp" NOT NULL,
    "platform" "DevicePlatform" NOT NULL,
    "expoPushToken" TEXT NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Device_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KycCheck" (
    "id" TEXT NOT NULL,
    "orgId" TEXT,
    "userId" TEXT,
    "kind" "KycKind" NOT NULL,
    "provider" TEXT NOT NULL,
    "status" "KycCheckStatus" NOT NULL DEFAULT 'PENDING',
    "reference" TEXT,
    "result" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KycCheck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "orgId" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "before" JSONB,
    "after" JSONB,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Store" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tagline" TEXT,
    "status" "StoreStatus" NOT NULL DEFAULT 'DRAFT',
    "category" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'NGN',
    "timezone" TEXT NOT NULL DEFAULT 'Africa/Lagos',
    "themeId" TEXT,
    "publishedThemeVersionId" TEXT,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "codEnabled" BOOLEAN NOT NULL DEFAULT true,
    "codMaxKobo" INTEGER NOT NULL DEFAULT 5000000,
    "whatsappNumber" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Store_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BrandKit" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "logoAssetId" TEXT,
    "logoDarkAssetId" TEXT,
    "iconAssetId" TEXT,
    "palette" JSONB NOT NULL DEFAULT '{}',
    "headingFont" TEXT,
    "bodyFont" TEXT,
    "voice" TEXT,
    "logoStyle" "LogoStyle",
    "source" "BrandSource" NOT NULL DEFAULT 'REX',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BrandKit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Asset" (
    "id" TEXT NOT NULL,
    "storeId" TEXT,
    "bucket" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "bytes" INTEGER,
    "kind" "AssetKind" NOT NULL,
    "generatedBy" "GeneratedBy" NOT NULL DEFAULT 'USER',
    "bgRemoved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Domain" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "hostname" TEXT NOT NULL,
    "type" "DomainType" NOT NULL,
    "status" "DomainStatus" NOT NULL DEFAULT 'PENDING_DNS',
    "provider" "DomainProviderKind" NOT NULL DEFAULT 'VERCEL',
    "providerRef" TEXT,
    "verification" JSONB,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "sslStatus" TEXT,
    "lastCheckedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "autoRenew" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Domain_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_supabaseId_key" ON "User"("supabaseId");

-- CreateIndex
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Organization_type_idx" ON "Organization"("type");

-- CreateIndex
CREATE INDEX "Organization_kycStatus_idx" ON "Organization"("kycStatus");

-- CreateIndex
CREATE INDEX "Membership_orgId_idx" ON "Membership"("orgId");

-- CreateIndex
CREATE INDEX "Membership_role_idx" ON "Membership"("role");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_userId_orgId_key" ON "Membership"("userId", "orgId");

-- CreateIndex
CREATE UNIQUE INDEX "Device_expoPushToken_key" ON "Device"("expoPushToken");

-- CreateIndex
CREATE INDEX "Device_userId_app_idx" ON "Device"("userId", "app");

-- CreateIndex
CREATE INDEX "KycCheck_orgId_idx" ON "KycCheck"("orgId");

-- CreateIndex
CREATE INDEX "KycCheck_userId_idx" ON "KycCheck"("userId");

-- CreateIndex
CREATE INDEX "KycCheck_status_idx" ON "KycCheck"("status");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_idx" ON "AuditLog"("actorId");

-- CreateIndex
CREATE INDEX "AuditLog_orgId_createdAt_idx" ON "AuditLog"("orgId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_entity_entityId_idx" ON "AuditLog"("entity", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "Store_slug_key" ON "Store"("slug");

-- CreateIndex
CREATE INDEX "Store_orgId_idx" ON "Store"("orgId");

-- CreateIndex
CREATE INDEX "Store_status_idx" ON "Store"("status");

-- CreateIndex
CREATE UNIQUE INDEX "BrandKit_storeId_key" ON "BrandKit"("storeId");

-- CreateIndex
CREATE INDEX "BrandKit_logoAssetId_idx" ON "BrandKit"("logoAssetId");

-- CreateIndex
CREATE INDEX "BrandKit_logoDarkAssetId_idx" ON "BrandKit"("logoDarkAssetId");

-- CreateIndex
CREATE INDEX "BrandKit_iconAssetId_idx" ON "BrandKit"("iconAssetId");

-- CreateIndex
CREATE INDEX "Asset_storeId_kind_idx" ON "Asset"("storeId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "Asset_bucket_path_key" ON "Asset"("bucket", "path");

-- CreateIndex
CREATE UNIQUE INDEX "Domain_hostname_key" ON "Domain"("hostname");

-- CreateIndex
CREATE INDEX "Domain_storeId_idx" ON "Domain"("storeId");

-- CreateIndex
CREATE INDEX "Domain_status_idx" ON "Domain"("status");

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Device" ADD CONSTRAINT "Device_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KycCheck" ADD CONSTRAINT "KycCheck_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KycCheck" ADD CONSTRAINT "KycCheck_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Store" ADD CONSTRAINT "Store_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrandKit" ADD CONSTRAINT "BrandKit_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrandKit" ADD CONSTRAINT "BrandKit_logoAssetId_fkey" FOREIGN KEY ("logoAssetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrandKit" ADD CONSTRAINT "BrandKit_logoDarkAssetId_fkey" FOREIGN KEY ("logoDarkAssetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrandKit" ADD CONSTRAINT "BrandKit_iconAssetId_fkey" FOREIGN KEY ("iconAssetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Domain" ADD CONSTRAINT "Domain_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

