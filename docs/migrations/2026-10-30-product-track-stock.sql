-- Explicit stock tracking per product (shared/product-stock.ts, src/lib/commerce/stock-holds.ts).
--
--   * "trackStock":             on = shoppers can buy up to "currentStock" - "reservedStock" (and each version's own
--                               count); the product shows "Sold out" at 0 and checkout refuses more than is left.
--                               Off = never sold out, checkout takes no stock. Before this, a count of 0 meant
--                               "not tracked" on the product page while checkout still refused it.
--   * "continueSellingWhenOut": tracked products only: keep selling at 0 (backorders; the count can go below 0).
--
-- Backfill (only when the column is first added, so running this again never undoes a seller's choice):
-- tracking is switched on for products whose seller entered stock (a count above 0, or versions with their own
-- counts) and for products that sold out (some sold, none left), so nothing that is sold out today starts selling.
-- Dropship products keep using the supplier's stock either way.
--
-- Additive only, safe to run more than once. Run BEFORE deploying the code that uses it (Prisma reads every column
-- of "StoreProduct").

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'StoreProduct' AND column_name = 'trackStock'
  ) THEN
    ALTER TABLE "StoreProduct" ADD COLUMN "trackStock" BOOLEAN NOT NULL DEFAULT false;
    UPDATE "StoreProduct" SET "trackStock" = true
    WHERE "currentStock" > 0
       OR EXISTS (
         SELECT 1
         FROM jsonb_array_elements(CASE WHEN jsonb_typeof("variants") = 'array' THEN "variants" ELSE '[]'::jsonb END) AS v
         WHERE jsonb_typeof(v) = 'object' AND jsonb_typeof(v -> 'stock') = 'number'
       )
       OR ("soldStock" > 0 AND "currentStock" <= 0 AND "fulfillmentType" <> 'dropship');
  END IF;
END $$;

ALTER TABLE "StoreProduct" ADD COLUMN IF NOT EXISTS "continueSellingWhenOut" BOOLEAN NOT NULL DEFAULT false;
