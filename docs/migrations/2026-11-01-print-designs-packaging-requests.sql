-- Labels and print: saved designs and custom packaging requests.
--
--   * "PrintDesign": packaging designs and Print studio setups the seller or Rex saved (/home/labels).
--   * "PackagingRequest": custom packaging / branding requests for the Shopinbos team (/admin/packaging-requests).
--
-- Additive only, safe to run more than once. RLS on with no policies (only the app's server connection reads or
-- writes).

CREATE TABLE IF NOT EXISTS "PrintDesign" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "format" TEXT,
  "title" TEXT NOT NULL,
  "productId" TEXT,
  "data" JSONB NOT NULL,
  "previewUrl" TEXT,
  "source" TEXT NOT NULL DEFAULT 'studio',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PrintDesign_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "PrintDesign_storeId_updatedAt_idx" ON "PrintDesign"("storeId", "updatedAt");
ALTER TABLE "PrintDesign" ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS "PackagingRequest" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "designId" TEXT,
  "productName" TEXT NOT NULL,
  "productType" TEXT NOT NULL,
  "packType" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL,
  "size" TEXT,
  "budget" INTEGER,
  "deadline" TIMESTAMP(3),
  "services" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "details" TEXT NOT NULL,
  "referenceUrls" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "contactName" TEXT NOT NULL,
  "contactPhone" TEXT NOT NULL,
  "contactEmail" TEXT,
  "status" TEXT NOT NULL DEFAULT 'new',
  "adminNotes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PackagingRequest_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "PackagingRequest_storeId_createdAt_idx" ON "PackagingRequest"("storeId", "createdAt");
CREATE INDEX IF NOT EXISTS "PackagingRequest_status_createdAt_idx" ON "PackagingRequest"("status", "createdAt");
ALTER TABLE "PackagingRequest" ENABLE ROW LEVEL SECURITY;
