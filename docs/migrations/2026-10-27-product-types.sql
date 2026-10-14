-- Product types, details, versions and related products (shared/product-types.ts, shared/product-variants.ts).
--
--   * "productType":       the preset category (clothing, shoes, hair, phones…). NULL = "other" (every older product).
--   * "productDetails":    the type's detail values, { fieldKey: value } (Material, Fit, Skin type, NAFDAC number…).
--   * "variantOptions":    the options and their values in order, [{ "name": "Size", "values": ["S","M","L"] }, …].
--                          The versions themselves stay in the existing "variants" JSON (rows gain "options",
--                          "enabled", "compareAtPrice"; older rows are read as they are).
--   * "relatedProductIds": up to 8 of the store's own products picked for "Customers also like".
--
-- The seller's own details ("Origin: Aba") use the existing "specifications" column.
-- Additive only, safe to run more than once. Run BEFORE deploying the code that uses it (Prisma reads every column
-- of "StoreProduct").

ALTER TABLE "StoreProduct" ADD COLUMN IF NOT EXISTS "productType" TEXT;
ALTER TABLE "StoreProduct" ADD COLUMN IF NOT EXISTS "productDetails" JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE "StoreProduct" ADD COLUMN IF NOT EXISTS "variantOptions" JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE "StoreProduct" ADD COLUMN IF NOT EXISTS "relatedProductIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

CREATE INDEX IF NOT EXISTS "StoreProduct_storeId_productType_idx" ON "StoreProduct" ("storeId", "productType");
