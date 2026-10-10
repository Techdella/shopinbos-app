-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "shopinbos";

-- CreateEnum
CREATE TYPE "shopinbos"."Locale" AS ENUM ('en', 'pcm', 'yo', 'ha', 'ig');

-- CreateEnum
CREATE TYPE "shopinbos"."OrgType" AS ENUM ('SELLER', 'SUPPLIER', 'LOGISTICS', 'SOURCING_PARTNER', 'PLATFORM');

-- CreateEnum
CREATE TYPE "shopinbos"."KycStatus" AS ENUM ('NONE', 'PENDING', 'VERIFIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "shopinbos"."MembershipRole" AS ENUM ('OWNER', 'ADMIN', 'STAFF', 'DISPATCHER', 'RIDER', 'VIEWER');

-- CreateEnum
CREATE TYPE "shopinbos"."DeviceApp" AS ENUM ('SELLER', 'RIDERS', 'PARTNERS');

-- CreateEnum
CREATE TYPE "shopinbos"."DevicePlatform" AS ENUM ('IOS', 'ANDROID', 'WEB');

-- CreateEnum
CREATE TYPE "shopinbos"."KycKind" AS ENUM ('BVN', 'NIN', 'CAC', 'ADDRESS', 'SELFIE');

-- CreateEnum
CREATE TYPE "shopinbos"."KycCheckStatus" AS ENUM ('PENDING', 'PASSED', 'FAILED', 'ERROR');

-- CreateEnum
CREATE TYPE "shopinbos"."StoreStatus" AS ENUM ('DRAFT', 'LIVE', 'PAUSED');

-- CreateEnum
CREATE TYPE "shopinbos"."LogoStyle" AS ENUM ('editorial', 'monogram', 'bold', 'serif', 'uploaded');

-- CreateEnum
CREATE TYPE "shopinbos"."BrandSource" AS ENUM ('REX', 'UPLOAD');

-- CreateEnum
CREATE TYPE "shopinbos"."AssetKind" AS ENUM ('PRODUCT_PHOTO', 'LOGO', 'VIDEO', 'LABEL_PDF', 'QC_PHOTO', 'PROOF_PHOTO', 'DOC');

-- CreateEnum
CREATE TYPE "shopinbos"."GeneratedBy" AS ENUM ('USER', 'REX', 'PEGGY', 'SYSTEM');

-- CreateEnum
CREATE TYPE "shopinbos"."DomainType" AS ENUM ('SUBDOMAIN', 'CUSTOM', 'PURCHASED');

-- CreateEnum
CREATE TYPE "shopinbos"."DomainStatus" AS ENUM ('PENDING_DNS', 'VERIFYING', 'ACTIVE', 'FAILED');

-- CreateEnum
CREATE TYPE "shopinbos"."DomainProviderKind" AS ENUM ('VERCEL', 'CLOUDFLARE');

-- CreateTable
CREATE TABLE "shopinbos"."User" (
    "id" TEXT NOT NULL,
    "supabaseId" UUID,
    "phone" TEXT,
    "email" TEXT,
    "name" TEXT,
    "avatarUrl" TEXT,
    "locale" "shopinbos"."Locale" NOT NULL DEFAULT 'en',
    "lastSeenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shopinbos"."Organization" (
    "id" TEXT NOT NULL,
    "type" "shopinbos"."OrgType" NOT NULL,
    "name" TEXT NOT NULL,
    "kycStatus" "shopinbos"."KycStatus" NOT NULL DEFAULT 'NONE',
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
CREATE TABLE "shopinbos"."Membership" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "role" "shopinbos"."MembershipRole" NOT NULL,
    "permissions" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shopinbos"."Device" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "app" "shopinbos"."DeviceApp" NOT NULL,
    "platform" "shopinbos"."DevicePlatform" NOT NULL,
    "expoPushToken" TEXT NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Device_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shopinbos"."KycCheck" (
    "id" TEXT NOT NULL,
    "orgId" TEXT,
    "userId" TEXT,
    "kind" "shopinbos"."KycKind" NOT NULL,
    "provider" TEXT NOT NULL,
    "status" "shopinbos"."KycCheckStatus" NOT NULL DEFAULT 'PENDING',
    "reference" TEXT,
    "result" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KycCheck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shopinbos"."AuditLog" (
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
CREATE TABLE "shopinbos"."Store" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tagline" TEXT,
    "status" "shopinbos"."StoreStatus" NOT NULL DEFAULT 'DRAFT',
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
CREATE TABLE "shopinbos"."BrandKit" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "logoAssetId" TEXT,
    "logoDarkAssetId" TEXT,
    "iconAssetId" TEXT,
    "palette" JSONB NOT NULL DEFAULT '{}',
    "headingFont" TEXT,
    "bodyFont" TEXT,
    "voice" TEXT,
    "logoStyle" "shopinbos"."LogoStyle",
    "source" "shopinbos"."BrandSource" NOT NULL DEFAULT 'REX',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BrandKit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shopinbos"."Asset" (
    "id" TEXT NOT NULL,
    "storeId" TEXT,
    "bucket" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "bytes" INTEGER,
    "kind" "shopinbos"."AssetKind" NOT NULL,
    "generatedBy" "shopinbos"."GeneratedBy" NOT NULL DEFAULT 'USER',
    "bgRemoved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shopinbos"."Domain" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "hostname" TEXT NOT NULL,
    "type" "shopinbos"."DomainType" NOT NULL,
    "status" "shopinbos"."DomainStatus" NOT NULL DEFAULT 'PENDING_DNS',
    "provider" "shopinbos"."DomainProviderKind" NOT NULL DEFAULT 'VERCEL',
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
CREATE UNIQUE INDEX "User_supabaseId_key" ON "shopinbos"."User"("supabaseId");

-- CreateIndex
CREATE UNIQUE INDEX "User_phone_key" ON "shopinbos"."User"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "shopinbos"."User"("email");

-- CreateIndex
CREATE INDEX "Organization_type_idx" ON "shopinbos"."Organization"("type");

-- CreateIndex
CREATE INDEX "Organization_kycStatus_idx" ON "shopinbos"."Organization"("kycStatus");

-- CreateIndex
CREATE INDEX "Membership_orgId_idx" ON "shopinbos"."Membership"("orgId");

-- CreateIndex
CREATE INDEX "Membership_role_idx" ON "shopinbos"."Membership"("role");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_userId_orgId_key" ON "shopinbos"."Membership"("userId", "orgId");

-- CreateIndex
CREATE UNIQUE INDEX "Device_expoPushToken_key" ON "shopinbos"."Device"("expoPushToken");

-- CreateIndex
CREATE INDEX "Device_userId_app_idx" ON "shopinbos"."Device"("userId", "app");

-- CreateIndex
CREATE INDEX "KycCheck_orgId_idx" ON "shopinbos"."KycCheck"("orgId");

-- CreateIndex
CREATE INDEX "KycCheck_userId_idx" ON "shopinbos"."KycCheck"("userId");

-- CreateIndex
CREATE INDEX "KycCheck_status_idx" ON "shopinbos"."KycCheck"("status");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_idx" ON "shopinbos"."AuditLog"("actorId");

-- CreateIndex
CREATE INDEX "AuditLog_orgId_createdAt_idx" ON "shopinbos"."AuditLog"("orgId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_entity_entityId_idx" ON "shopinbos"."AuditLog"("entity", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "Store_slug_key" ON "shopinbos"."Store"("slug");

-- CreateIndex
CREATE INDEX "Store_orgId_idx" ON "shopinbos"."Store"("orgId");

-- CreateIndex
CREATE INDEX "Store_status_idx" ON "shopinbos"."Store"("status");

-- CreateIndex
CREATE UNIQUE INDEX "BrandKit_storeId_key" ON "shopinbos"."BrandKit"("storeId");

-- CreateIndex
CREATE INDEX "BrandKit_logoAssetId_idx" ON "shopinbos"."BrandKit"("logoAssetId");

-- CreateIndex
CREATE INDEX "BrandKit_logoDarkAssetId_idx" ON "shopinbos"."BrandKit"("logoDarkAssetId");

-- CreateIndex
CREATE INDEX "BrandKit_iconAssetId_idx" ON "shopinbos"."BrandKit"("iconAssetId");

-- CreateIndex
CREATE INDEX "Asset_storeId_kind_idx" ON "shopinbos"."Asset"("storeId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "Asset_bucket_path_key" ON "shopinbos"."Asset"("bucket", "path");

-- CreateIndex
CREATE UNIQUE INDEX "Domain_hostname_key" ON "shopinbos"."Domain"("hostname");

-- CreateIndex
CREATE INDEX "Domain_storeId_idx" ON "shopinbos"."Domain"("storeId");

-- CreateIndex
CREATE INDEX "Domain_status_idx" ON "shopinbos"."Domain"("status");

-- AddForeignKey
ALTER TABLE "shopinbos"."Membership" ADD CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "shopinbos"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shopinbos"."Membership" ADD CONSTRAINT "Membership_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "shopinbos"."Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shopinbos"."Device" ADD CONSTRAINT "Device_userId_fkey" FOREIGN KEY ("userId") REFERENCES "shopinbos"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shopinbos"."KycCheck" ADD CONSTRAINT "KycCheck_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "shopinbos"."Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shopinbos"."KycCheck" ADD CONSTRAINT "KycCheck_userId_fkey" FOREIGN KEY ("userId") REFERENCES "shopinbos"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shopinbos"."AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "shopinbos"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shopinbos"."AuditLog" ADD CONSTRAINT "AuditLog_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "shopinbos"."Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shopinbos"."Store" ADD CONSTRAINT "Store_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "shopinbos"."Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shopinbos"."BrandKit" ADD CONSTRAINT "BrandKit_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "shopinbos"."Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shopinbos"."BrandKit" ADD CONSTRAINT "BrandKit_logoAssetId_fkey" FOREIGN KEY ("logoAssetId") REFERENCES "shopinbos"."Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shopinbos"."BrandKit" ADD CONSTRAINT "BrandKit_logoDarkAssetId_fkey" FOREIGN KEY ("logoDarkAssetId") REFERENCES "shopinbos"."Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shopinbos"."BrandKit" ADD CONSTRAINT "BrandKit_iconAssetId_fkey" FOREIGN KEY ("iconAssetId") REFERENCES "shopinbos"."Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shopinbos"."Asset" ADD CONSTRAINT "Asset_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "shopinbos"."Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shopinbos"."Domain" ADD CONSTRAINT "Domain_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "shopinbos"."Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

