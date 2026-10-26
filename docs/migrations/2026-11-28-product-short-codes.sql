-- Product short codes (BAG1, BAG2, DRS3…) that sellers say on live videos and Status posts: "Comment BAG2 to order".
-- Additive only: one new nullable column, one new unique index, and a backfill that fills the new column for the
-- products that already exist. Nothing else is changed or removed. Safe to run more than once.
--
-- New products get their code from src/lib/products/short-code.server.ts (rules in shared/product-codes.ts). The
-- backfill below writes the same prefix rules in SQL, numbering each store's products per prefix by created date:
--   1. a common product word in the name ("Leather bag" → BAG, "Ankara dress" → DRS), PRODUCT_NOUNS;
--   2. else the product type's prefix (bags → BAG, clothing → CLO…), TYPE_PREFIX;
--   3. else the first word of 2+ letters of the category, else of the name: accents and other characters dropped,
--      uppercased; words over 4 letters keep the first letter, lose the other vowels and doubled letters, then
--      the first 4 ("DRESSES" → "DRS", "LEATHER" → "LTHR");
--   4. else ITEM.
-- tests/product-short-codes.test.mjs checks both lists here match shared/product-codes.ts.

ALTER TABLE "StoreProduct" ADD COLUMN IF NOT EXISTS "shortCode" TEXT;
-- Unique within a store; NULLs never clash, so products without a code are fine.
CREATE UNIQUE INDEX IF NOT EXISTS "StoreProduct_storeId_shortCode_key" ON "StoreProduct"("storeId", "shortCode");

WITH nouns(word, prefix) AS (
  VALUES
    ('BAG', 'BAG'), ('BAGS', 'BAG'), ('HANDBAG', 'BAG'), ('HANDBAGS', 'BAG'), ('PURSE', 'PRS'), ('PURSES', 'PRS'),
    ('DRESS', 'DRS'), ('DRESSES', 'DRS'), ('GOWN', 'GOWN'), ('GOWNS', 'GOWN'), ('SKIRT', 'SKRT'), ('SKIRTS', 'SKRT'),
    ('SHIRT', 'SHRT'), ('SHIRTS', 'SHRT'), ('TSHIRT', 'TEE'), ('TSHIRTS', 'TEE'), ('TEE', 'TEE'), ('TEES', 'TEE'),
    ('TOP', 'TOP'), ('TOPS', 'TOP'), ('JEAN', 'JEAN'), ('JEANS', 'JEAN'), ('TROUSER', 'TRSR'), ('TROUSERS', 'TRSR'),
    ('SHOE', 'SHOE'), ('SHOES', 'SHOE'), ('SNEAKER', 'SNKR'), ('SNEAKERS', 'SNKR'), ('SANDAL', 'SNDL'), ('SANDALS', 'SNDL'),
    ('SLIPPER', 'SLPR'), ('SLIPPERS', 'SLPR'), ('HEELS', 'HEEL'), ('WIG', 'WIG'), ('WIGS', 'WIG'), ('CAP', 'CAP'),
    ('CAPS', 'CAP'), ('HAT', 'HAT'), ('HATS', 'HAT'), ('WATCH', 'WTCH'), ('WATCHES', 'WTCH'), ('RING', 'RING'),
    ('RINGS', 'RING'), ('NECKLACE', 'NCKL'), ('NECKLACES', 'NCKL'), ('EARRING', 'EAR'), ('EARRINGS', 'EAR'),
    ('BRACELET', 'BRCL'), ('BRACELETS', 'BRCL'), ('PERFUME', 'PRFM'), ('PERFUMES', 'PRFM'), ('CREAM', 'CRM'),
    ('CREAMS', 'CRM'), ('LOTION', 'LTN'), ('SERUM', 'SRM'), ('SOAP', 'SOAP'), ('OIL', 'OIL'), ('CASE', 'CASE'),
    ('CASES', 'CASE'), ('CHARGER', 'CHRG'), ('CHARGERS', 'CHRG'), ('EARBUDS', 'BUDS'), ('HEADPHONES', 'HDPH'),
    ('FABRIC', 'FBRC'), ('FABRICS', 'FBRC')
),
types(product_type, prefix) AS (
  VALUES
    ('clothing', 'CLO'), ('shoes', 'SHOE'), ('bags', 'BAG'), ('jewellery', 'JWL'), ('beauty', 'BTY'), ('hair', 'HAIR'),
    ('food', 'FOOD'), ('phones', 'PHN'), ('electronics', 'ELEC'), ('home', 'HOME'), ('baby', 'BABY'), ('books', 'BOOK'),
    ('digital', 'DIGI')
),
-- Products without a code, their name and category reduced to plain uppercase letters and spaces.
plain AS (
  SELECT
    p."id",
    p."storeId",
    p."createdAt",
    p."productType",
    upper(regexp_replace(normalize(coalesce(p."name", ''), NFD), '[^A-Za-z[:space:]]', '', 'g')) AS name_letters,
    upper(regexp_replace(normalize(coalesce(c."name", ''), NFD), '[^A-Za-z[:space:]]', '', 'g')) AS category_letters
  FROM "StoreProduct" p
  LEFT JOIN "Category" c ON c."id" = p."categoryId"
  WHERE p."shortCode" IS NULL
),
-- 1. The first common product word in the name.
noun AS (
  SELECT DISTINCT ON (pl."id") pl."id", n.prefix
  FROM plain pl
  CROSS JOIN LATERAL regexp_split_to_table(pl.name_letters, '[[:space:]]+') WITH ORDINALITY AS w(word, pos)
  JOIN nouns n ON n.word = w.word
  ORDER BY pl."id", w.pos
),
-- 3. The first word of 2+ letters of the category, else of the name.
word AS (
  SELECT pl."id", coalesce(substring(pl.category_letters FROM '[A-Z]{2,}'), substring(pl.name_letters FROM '[A-Z]{2,}')) AS word
  FROM plain pl
),
shortened AS (
  SELECT
    w."id",
    w.word,
    regexp_replace(left(w.word, 1) || regexp_replace(substr(w.word, 2), '[AEIOU]', '', 'g'), '(.)\1+', '\1', 'g') AS consonants
  FROM word w
),
prefixed AS (
  SELECT
    pl."id",
    pl."storeId",
    pl."createdAt",
    coalesce(
      noun.prefix,
      t.prefix,
      CASE
        WHEN s.word IS NULL THEN NULL
        WHEN length(s.word) <= 4 THEN s.word
        WHEN length(s.consonants) >= 2 THEN left(s.consonants, 4)
        ELSE left(s.word, 4)
      END,
      'ITEM'
    ) AS prefix
  FROM plain pl
  LEFT JOIN noun ON noun."id" = pl."id"
  LEFT JOIN types t ON t.product_type = pl."productType"
  LEFT JOIN shortened s ON s."id" = pl."id"
),
-- Numbered per store and prefix by created date, after any code that prefix already uses in the store.
numbered AS (
  SELECT
    x."id",
    x.prefix || (
      coalesce(used.highest, 0) + row_number() OVER (PARTITION BY x."storeId", x.prefix ORDER BY x."createdAt", x."id")
    )::text AS code
  FROM prefixed x
  LEFT JOIN LATERAL (
    SELECT max(substr(e."shortCode", length(x.prefix) + 1)::bigint) AS highest
    FROM "StoreProduct" e
    WHERE e."storeId" = x."storeId" AND e."shortCode" ~ ('^' || x.prefix || '[0-9]{1,9}$')
  ) used ON true
)
UPDATE "StoreProduct" sp
SET "shortCode" = numbered.code
FROM numbered
WHERE sp."id" = numbered."id" AND sp."shortCode" IS NULL;
