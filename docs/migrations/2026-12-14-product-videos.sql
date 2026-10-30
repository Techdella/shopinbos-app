-- Product videos, "Post to Plug" (shared/product-videos.ts, src/lib/product-videos/*.server.ts, pilot feature
-- "post_to_plug"). Sellers and suppliers post a short vertical video (up to 60 seconds) tagged to one of their own
-- products. It plays on the product's page in the shop (a supplier's video also on the pages of shops that import
-- that product, never with the supplier's name), and, when "Show on Plug Discover" is on, in the Plug Discover feed
-- (GET /api/public/discover) for shops where post_to_plug is on.
--
--   * "ProductVideo": ownerKind store (storeId set; productId = StoreProduct.id) | supplier (supplierId set;
--                     productId = SupplierProduct.id). videoUrl / posterUrl: uploaded straight to Storage with a signed
--                     URL (product-videos/<ownerId>/…), or a finished Rex reel (VideoProject.videoUrl). durationMs, width
--                     and height as the phone or browser read them. showOnDiscover: in the Plug Discover feed (on by
--                     default while post_to_plug is on for the shop or supplier). status: active | hidden (by the
--                     owner) | removed (deleted by the owner, or taken down). views: Discover plays (best effort).
--                     createdBy: the User.id who posted it.
--
-- Additive only, safe to run more than once. Run BEFORE deploying the code that uses it (until then the Videos
-- sections show nothing and the Discover feed is empty).

CREATE TABLE IF NOT EXISTS "ProductVideo" (
  "id" TEXT PRIMARY KEY,
  "ownerKind" TEXT NOT NULL,
  "storeId" TEXT,
  "supplierId" TEXT,
  "productId" TEXT NOT NULL,
  "videoUrl" TEXT NOT NULL,
  "posterUrl" TEXT,
  "durationMs" INTEGER,
  "width" INTEGER,
  "height" INTEGER,
  "caption" TEXT NOT NULL DEFAULT '',
  "showOnDiscover" BOOLEAN NOT NULL DEFAULT false,
  "status" TEXT NOT NULL DEFAULT 'active',
  "views" INTEGER NOT NULL DEFAULT 0,
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "ProductVideo_storeId_createdAt_idx" ON "ProductVideo" ("storeId", "createdAt");
CREATE INDEX IF NOT EXISTS "ProductVideo_supplierId_createdAt_idx" ON "ProductVideo" ("supplierId", "createdAt");
CREATE INDEX IF NOT EXISTS "ProductVideo_productId_idx" ON "ProductVideo" ("productId");
CREATE INDEX IF NOT EXISTS "ProductVideo_showOnDiscover_status_createdAt_idx" ON "ProductVideo" ("showOnDiscover", "status", "createdAt");

-- Only the server (service role / Prisma) reads and writes these rows.
ALTER TABLE "ProductVideo" ENABLE ROW LEVEL SECURITY;
