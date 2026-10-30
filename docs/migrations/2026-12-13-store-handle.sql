-- Shop @handle and short link. Every shop gets an @handle (@kemibags): its short link is
-- https://app.shopinbos.com/@kemibags (src/app/h/[handle]/route.ts, which opens the shop), printed with a QR code on
-- parcels and flyers (Seller app › Your store › Shop link & QR; phone app › Menu › Your shop link & QR).
--
--   * "Store"."handle": TEXT, nullable. Always lowercase (CHECK below); rules in shared/shop-handle.ts: 3-24
--     characters, a-z 0-9 and "_", starting with a letter, no "__", no "_" at the end, not a reserved word.
--     A shop without one gets one the first time its link is shown (src/lib/shop-handle.server.ts), from its web
--     address or name with a number added if taken.
--   * "Store_handle_key": the UNIQUE index Prisma expects for `handle String? @unique` (same name, so `prisma db
--     push` / migrate diff see no drift). With the lowercase CHECK it is already case-insensitive.
--   * "Store_handle_lower_key": UNIQUE on lower("handle") WHERE "handle" IS NOT NULL. Belt and braces: case-
--     insensitive uniqueness even if the CHECK were ever dropped. Prisma doesn't model expression indexes; it
--     leaves this one alone.
--
-- Backfill (same file): a shop with no handle gets its web address with the dashes taken out ("kemi-bags" ->
-- "kemibags") ONLY when that fits the rules above, isn't reserved, and no other shop has or would get it. When two
-- shops would get the same handle, the older shop (createdAt, then id) gets it; the rest stay NULL and the app
-- assigns them one lazily (with a number on the end). Nothing is overwritten: rows that already have a handle are
-- never touched.
--
-- Read-only checks before running:
--   SELECT count(*) FROM "Store";
--   SELECT lower(regexp_replace("slug", '[^A-Za-z0-9]', '', 'g')) AS h, count(*) FROM "Store" GROUP BY 1 HAVING count(*) > 1;
--
-- Additive and idempotent (safe to run more than once; a second run assigns nothing new unless new shops arrived).
-- Run BEFORE deploying the code that uses it (Prisma selects every column).

BEGIN;

ALTER TABLE "Store" ADD COLUMN IF NOT EXISTS "handle" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Store_handle_lowercase_check') THEN
    -- Existing rows: the column is new, so every value is NULL (or was written lowercase by this code).
    ALTER TABLE "Store" ADD CONSTRAINT "Store_handle_lowercase_check" CHECK ("handle" IS NULL OR "handle" = lower("handle"));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "Store_handle_key" ON "Store" ("handle");
CREATE UNIQUE INDEX IF NOT EXISTS "Store_handle_lower_key" ON "Store" (lower("handle")) WHERE "handle" IS NOT NULL;

-- Backfill from the web address. The reserved list mirrors RESERVED_HANDLES in shared/shop-handle.ts
-- (tests/shop-handle.test.mjs checks they match).
WITH reserved(word) AS (
  SELECT unnest(ARRAY[
    -- reserved:start
    'about', 'account', 'accounts', 'admin', 'administrator', 'ads', 'affiliate', 'affiliates', 'api', 'app', 'apps',
    'auth', 'billing', 'blog', 'bos', 'careers', 'cart', 'checkout', 'chip', 'contact', 'customer', 'customers',
    'delivery', 'dev', 'docs', 'email', 'everyone', 'faq', 'help', 'home', 'info', 'invite', 'jobs', 'legal', 'login',
    'logistics', 'logout', 'mail', 'marketplace', 'me', 'moderator', 'mybos', 'mybosstore', 'news', 'null',
    'official', 'order', 'orders', 'partner', 'partners', 'pay', 'payment', 'payments', 'payout', 'payouts', 'peggy',
    'plug', 'press', 'privacy', 'register', 'rex', 'rider', 'riders', 'root', 'security', 'seller', 'sellers',
    'settings', 'shop', 'shopinbos', 'shopinbosplug', 'shopinbos_plug', 'shops', 'signin', 'signup', 'staff',
    'status', 'store', 'stores', 'supplier', 'suppliers', 'support', 'system', 'team', 'terms', 'test', 'undefined',
    'verified', 'verify', 'wallet', 'www'
    -- reserved:end
  ]::text[])
),
candidates AS (
  SELECT s."id", s."createdAt", lower(regexp_replace(s."slug", '[^A-Za-z0-9]', '', 'g')) AS h
  FROM "Store" s
  WHERE s."handle" IS NULL
),
fitting AS (
  SELECT c."id", c.h, row_number() OVER (PARTITION BY c.h ORDER BY c."createdAt", c."id") AS rn
  FROM candidates c
  WHERE c.h ~ '^[a-z][a-z0-9_]{2,23}$'
    AND c.h NOT LIKE '%\_\_%'
    AND c.h NOT LIKE '%\_'
    AND c.h NOT IN (SELECT word FROM reserved)
    AND NOT EXISTS (SELECT 1 FROM "Store" x WHERE x."handle" IS NOT NULL AND lower(x."handle") = c.h)
)
UPDATE "Store" s
SET "handle" = f.h
FROM fitting f
WHERE s."id" = f."id"
  AND f.rn = 1
  AND s."handle" IS NULL;

COMMIT;

-- After running (read-only): shops still without a handle get one the first time their link is shown.
--   SELECT count(*) FILTER (WHERE "handle" IS NULL) AS without, count(*) AS total FROM "Store";
