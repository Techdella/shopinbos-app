-- Media library: every picture a person has already put into Shopinbos, so they upload once and reuse it
-- ("Choose from my media" next to every picture field; src/components/media, /api/app/media).
--
--   * "MediaAsset": one row per (userId, url). Upload paths record new files from now on (/api/upload,
--     /api/app/media, CMS uploads, logo uploads, Rex / studio pictures). Removing one from the library only sets
--     "hiddenAt": the file itself is never deleted, because a live page, product or email may still show it.
--   * shopinbos_media_sync(user_id): finds pictures already in a store (product photos, logo, collection and CMS
--     pictures, supplier logo / banner / product photos, and images from our own storage used in the store editor
--     or pages) and adds the missing ones. Idempotent (ON CONFLICT DO NOTHING, so hidden rows stay hidden). The app
--     calls it for one person when their library opens; called with NULL it backfills everyone (bottom of file).
--
-- Additive only, safe to run more than once. RLS is on with no policies: only the app's server connection (which
-- bypasses RLS) reads or writes it. Run BEFORE deploying the code that uses it (the app copes without it: the
-- library is just empty and uploads still work).

CREATE TABLE IF NOT EXISTS "MediaAsset" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "storeId" TEXT,
  "url" TEXT NOT NULL,
  "path" TEXT,
  "name" TEXT,
  "kind" TEXT NOT NULL DEFAULT 'image',
  "width" INTEGER,
  "height" INTEGER,
  "bytes" INTEGER,
  "source" TEXT NOT NULL DEFAULT 'upload',
  "hiddenAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MediaAsset_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "MediaAsset_userId_url_key" ON "MediaAsset"("userId", "url");
CREATE INDEX IF NOT EXISTS "MediaAsset_userId_createdAt_idx" ON "MediaAsset"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "MediaAsset_storeId_idx" ON "MediaAsset"("storeId");

ALTER TABLE "MediaAsset" ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION shopinbos_media_sync(p_user TEXT DEFAULT NULL) RETURNS INTEGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  added INTEGER;
  -- Pictures inside editor / page JSON count only when they're in our own storage (not template stock photos).
  own_image CONSTANT jsonpath := '$.** ? (@.type() == "string" && @ like_regex "^https://[^ ]+/storage/v1/object/public/[^ ]+[.](png|jpe?g|webp|gif|svg|avif)$" flag "i")';
BEGIN
  WITH found AS (
    -- Product photos.
    SELECT s."userId", s."id" AS "storeId", img AS url, 'product'::text AS source, p."name" AS name, p."createdAt" AS at
      FROM "StoreProduct" p
      JOIN "Store" s ON s."id" = p."storeId"
      CROSS JOIN LATERAL unnest(p."images") AS img
     WHERE p_user IS NULL OR s."userId" = p_user
    UNION ALL
    -- Store logo.
    SELECT s."userId", s."id", s."logoUrl", 'logo', s."name" || ' logo', s."updatedAt"
      FROM "Store" s
     WHERE s."logoUrl" IS NOT NULL AND (p_user IS NULL OR s."userId" = p_user)
    UNION ALL
    -- Collection pictures.
    SELECT s."userId", s."id", c."imageUrl", 'collection', c."name", c."createdAt"
      FROM "Collection" c
      JOIN "Store" s ON s."id" = c."storeId"
     WHERE c."imageUrl" IS NOT NULL AND (p_user IS NULL OR s."userId" = p_user)
    UNION ALL
    -- CMS / blog featured pictures.
    SELECT s."userId", s."id", i."featuredImage", 'cms', i."title", i."createdAt"
      FROM "CmsItem" i
      JOIN "Store" s ON s."id" = i."storeId"
     WHERE i."featuredImage" IS NOT NULL AND (p_user IS NULL OR s."userId" = p_user)
    UNION ALL
    -- Store editor (draft and live), banners and other brand settings.
    SELECT s."userId", s."id", v #>> '{}', 'editor', NULL, s."updatedAt"
      FROM "Store" s
      CROSS JOIN LATERAL jsonb_path_query(s."brandSettings", own_image) AS v
     WHERE p_user IS NULL OR s."userId" = p_user
    UNION ALL
    -- Store pages.
    SELECT s."userId", s."id", v #>> '{}', 'editor', pg."title", pg."updatedAt"
      FROM "StorePage" pg
      JOIN "Store" s ON s."id" = pg."storeId"
      CROSS JOIN LATERAL jsonb_path_query(pg."content", own_image) AS v
     WHERE p_user IS NULL OR s."userId" = p_user
    UNION ALL
    -- Supplier logo and banner.
    SELECT su."userId", NULL, su."logoUrl", 'logo', su."businessName" || ' logo', su."createdAt"
      FROM "Supplier" su
     WHERE su."logoUrl" IS NOT NULL AND (p_user IS NULL OR su."userId" = p_user)
    UNION ALL
    SELECT su."userId", NULL, su."bannerUrl", 'banner', su."businessName", su."createdAt"
      FROM "Supplier" su
     WHERE su."bannerUrl" IS NOT NULL AND (p_user IS NULL OR su."userId" = p_user)
    UNION ALL
    -- Supplier product photos.
    SELECT su."userId", NULL, img, 'product', sp."name", sp."createdAt"
      FROM "SupplierProduct" sp
      JOIN "Supplier" su ON su."id" = sp."supplierId"
      CROSS JOIN LATERAL unnest(sp."images") AS img
     WHERE p_user IS NULL OR su."userId" = p_user
  ),
  clean AS (
    SELECT DISTINCT ON ("userId", url) "userId", "storeId", url, source, name, at
      FROM found
     WHERE url ~ '^https://[^[:space:]]+$' AND length(url) <= 2048
     ORDER BY "userId", url, at
  )
  INSERT INTO "MediaAsset" ("id", "userId", "storeId", "url", "path", "name", "kind", "source", "createdAt")
  SELECT 'med' || replace(gen_random_uuid()::text, '-', ''),
         "userId",
         "storeId",
         url,
         substring(url FROM '/storage/v1/object/public/[^/]+/([^?#]+)'),
         left(name, 200),
         CASE WHEN url ~* '[.](mp4|webm|ogv|mov)([?#]|$)' THEN 'video' ELSE 'image' END,
         source,
         COALESCE(at, CURRENT_TIMESTAMP)
    FROM clean
  ON CONFLICT ("userId", "url") DO NOTHING;
  GET DIAGNOSTICS added = ROW_COUNT;
  RETURN added;
END
$$;

-- Supabase exposes public functions over its REST API; only the app's server connection may call this one.
REVOKE ALL ON FUNCTION shopinbos_media_sync(TEXT) FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON FUNCTION shopinbos_media_sync(TEXT) FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON FUNCTION shopinbos_media_sync(TEXT) FROM authenticated';
  END IF;
END
$$;

-- One-off backfill for everyone (idempotent: running it again adds nothing new).
SELECT shopinbos_media_sync(NULL) AS media_assets_added;
