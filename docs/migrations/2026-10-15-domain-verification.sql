-- Custom domains need proven ownership before they are served.
--
--   * "Store"."customDomain": the address buyers see on the seller's own domain. From now on only set once the
--     domain is verified (TXT record at _shopinbos-verify.<domain>, or bought through the app's registrar flow).
--   * "Store"."customDomainKey": its lowercase, www-less form ("www.Adas.ng" -> "adas.ng"). UNIQUE: one store per
--     domain, so one seller can no longer knock another's domain offline by claiming it too. The proxy looks
--     stores up by this key (src/lib/domains/lookup.ts).
--   * "Store"."customDomainVerifiedAt": when ownership was proven. Only stores with it set (and status
--     'active') are served.
--   * "Store"."pendingDomain" / "domainVerifyToken": a claim in progress and its random token. A claim never
--     touches a domain another store verified.
--
-- Existing rows. Before this, customDomain was set without any proof, and the proxy already refused to serve a
-- domain claimed by two stores. So:
--   * a legacy customDomain that is a valid domain name, not a platform/hosting/IP address, and claimed by no
--     other store (after lowercasing and dropping www.) is kept as is and marked verified (verified at = now):
--     it keeps working exactly as before;
--   * duplicates (two or more stores on the same key) and unusable values are moved to "pendingDomain" and
--     "customDomain" is cleared. They were not being served before either (two claimants -> neither), so no
--     working storefront goes offline. Each seller sees the domain as pending in Settings -> Domain and can
--     prove ownership with the TXT record; support can also resolve them by hand (query at the end).
--
-- Data assumptions to check on the live database before running (read-only):
--   SELECT count(*) FROM "Store" WHERE "customDomain" IS NOT NULL;                         -- rows affected
--   SELECT lower(regexp_replace(btrim("customDomain"), '^www\.', '', 'i')) AS key, count(*)
--     FROM "Store" WHERE "customDomain" IS NOT NULL GROUP BY 1 HAVING count(*) > 1;         -- duplicates
--   SELECT id, "customDomain" FROM "Store" WHERE "customDomain" ~ '[A-Z/:]';                -- odd formats
--
-- Additive and safe to run more than once (a second run finds no legacy rows left to convert). Run BEFORE
-- deploying the code that uses it (Prisma selects every column).

BEGIN;

ALTER TABLE "Store" ADD COLUMN IF NOT EXISTS "customDomainKey" TEXT;
ALTER TABLE "Store" ADD COLUMN IF NOT EXISTS "customDomainVerifiedAt" TIMESTAMP(3);
ALTER TABLE "Store" ADD COLUMN IF NOT EXISTS "pendingDomain" TEXT;
ALTER TABLE "Store" ADD COLUMN IF NOT EXISTS "domainVerifyToken" TEXT;

-- Legacy rows: customDomain set, never verified. Normalize the way the app does (lowercase; no scheme, path,
-- port or trailing dot), then key = host without a leading www.
CREATE TEMP TABLE _legacy_domains ON COMMIT DROP AS
SELECT id, host, regexp_replace(host, '^www\.', '') AS key
FROM (
  SELECT id,
         regexp_replace(
           regexp_replace(
             split_part(split_part(regexp_replace(lower(btrim("customDomain")), '^[a-z][a-z0-9+.-]*://', ''), '/', 1), '?', 1),
             ':[0-9]*$', ''),
           '\.+$', '') AS host
  FROM "Store"
  WHERE "customDomain" IS NOT NULL
    AND "customDomainVerifiedAt" IS NULL
    AND "customDomainKey" IS NULL
) normalized;

-- A key is usable when it is a domain name (not an IP), not a platform or hosting address, held by exactly one
-- legacy row and by no already-verified store.
CREATE TEMP TABLE _legacy_ok ON COMMIT DROP AS
SELECT l.id, l.host, l.key
FROM _legacy_domains l
WHERE l.key ~ '^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9-]*[a-z][a-z0-9-]*$'
  AND l.key !~ '^[0-9.]+$'
  AND l.key !~ '(^|\.)(shopinbos\.com|vercel\.app|vercel\.sh|vercel-dns\.com|now\.sh|localhost|local|internal|test|invalid|example)$'
  AND (SELECT count(*) FROM _legacy_domains d WHERE d.key = l.key) = 1
  AND NOT EXISTS (SELECT 1 FROM "Store" s WHERE s."customDomainKey" = l.key);

UPDATE "Store" s
SET "customDomain" = ok.host,
    "customDomainKey" = ok.key,
    "customDomainVerifiedAt" = now()
FROM _legacy_ok ok
WHERE s.id = ok.id;

-- Everything else that was legacy: keep it visible as a pending claim, stop treating it as the live domain.
UPDATE "Store" s
SET "pendingDomain" = COALESCE(s."pendingDomain", NULLIF(l.host, '')),
    "customDomain" = NULL
FROM _legacy_domains l
WHERE s.id = l.id
  AND NOT EXISTS (SELECT 1 FROM _legacy_ok ok WHERE ok.id = l.id);

-- One store per domain (keys are always lowercase and www-less; the CHECK keeps it that way).
CREATE UNIQUE INDEX IF NOT EXISTS "Store_customDomainKey_key" ON "Store"("customDomainKey");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Store_customDomainKey_lowercase' AND conrelid = '"Store"'::regclass) THEN
    ALTER TABLE "Store" ADD CONSTRAINT "Store_customDomainKey_lowercase"
      CHECK ("customDomainKey" IS NULL OR ("customDomainKey" = lower("customDomainKey") AND "customDomainKey" !~ '^www\.'));
  END IF;
END $$;

COMMIT;

-- For support: stores whose old domain was a duplicate or unusable and now waits for verification.
--   SELECT id, slug, "pendingDomain" FROM "Store" WHERE "pendingDomain" IS NOT NULL AND "domainVerifyToken" IS NULL;
-- (The app issues the token the first time the seller opens Settings -> Domain; the records to add show there.)
