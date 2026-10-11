-- CMS collections (agent H): Wix-style content collections and their items, plus SeoMeta for the extra SEO
-- fields of products and product collections. Additive only. Safe to run more than once.
-- Existing blog posts stay in "StorePage".content (slug 'blog'); the app copies them into a "Blog" collection
-- the first time the seller (or a shopper) opens it, keyed by "CmsItem"."legacyId", so nothing is lost; the
-- copied ids are noted in that page's content ("cmsImported") so each post is copied only once.

CREATE TABLE IF NOT EXISTS "CmsCollection" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "template" TEXT NOT NULL DEFAULT 'blank',
    "description" TEXT NOT NULL DEFAULT '',
    "itemLabel" TEXT NOT NULL DEFAULT 'Item',
    "fields" JSONB NOT NULL DEFAULT '[]',
    "settings" JSONB NOT NULL DEFAULT '{}',
    "seo" JSONB NOT NULL DEFAULT '{}',
    "isPublished" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CmsCollection_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "CmsCollection_storeId_slug_key" ON "CmsCollection"("storeId", "slug");
CREATE INDEX IF NOT EXISTS "CmsCollection_storeId_idx" ON "CmsCollection"("storeId");

CREATE TABLE IF NOT EXISTS "CmsItem" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "collectionId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "publishAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "author" TEXT NOT NULL DEFAULT '',
    "featuredImage" TEXT,
    "excerpt" TEXT NOT NULL DEFAULT '',
    "data" JSONB NOT NULL DEFAULT '{}',
    "seo" JSONB NOT NULL DEFAULT '{}',
    "legacyId" TEXT,
    "createdBy" TEXT NOT NULL DEFAULT 'seller',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CmsItem_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "CmsItem_collectionId_slug_key" ON "CmsItem"("collectionId", "slug");
CREATE UNIQUE INDEX IF NOT EXISTS "CmsItem_collectionId_legacyId_key" ON "CmsItem"("collectionId", "legacyId");
CREATE INDEX IF NOT EXISTS "CmsItem_storeId_idx" ON "CmsItem"("storeId");
CREATE INDEX IF NOT EXISTS "CmsItem_collectionId_status_idx" ON "CmsItem"("collectionId", "status");

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CmsItem_collectionId_fkey') THEN
        ALTER TABLE "CmsItem" ADD CONSTRAINT "CmsItem_collectionId_fkey"
            FOREIGN KEY ("collectionId") REFERENCES "CmsCollection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS "SeoMeta" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "data" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SeoMeta_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "SeoMeta_storeId_resourceType_resourceId_key" ON "SeoMeta"("storeId", "resourceType", "resourceId");
CREATE INDEX IF NOT EXISTS "SeoMeta_storeId_idx" ON "SeoMeta"("storeId");

-- The app reads these through Prisma with the service connection; no anon/authenticated access.
ALTER TABLE "CmsCollection" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CmsItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SeoMeta" ENABLE ROW LEVEL SECURITY;
