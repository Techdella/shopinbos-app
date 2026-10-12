-- Security hardening (agent D, security audit). Additive and safe to run more than once.
--
-- 1. Row Level Security on every table in the public schema.
--    The app reads and writes through Prisma as the table owner (postgres), which bypasses RLS, and no code uses
--    supabase-js .from()/.rpc() (PostgREST). But Supabase exposes the public schema over its REST API to the anon
--    key that ships in every browser bundle: a table without RLS can be read and changed by anyone holding it.
--    The migration files only turn RLS on for ~28 of ~88 tables; tables created by `prisma db push`
--    (User, Store, RetailOrder, Supplier, PartnerApiKey, SupplierPayoutAccount, PaymentReceipt, …) never got it.
--    RLS on with no policies = no access for anon/authenticated, full access for the server.
--    BEFORE RUNNING: confirm nothing outside this app (e.g. the marketing website) queries these tables with the
--    anon key. Check first with:
--      SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND NOT rowsecurity ORDER BY 1;

DO $$
DECLARE
  t record;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND NOT rowsecurity LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tablename);
  END LOOP;
END $$;

-- 2. A private bucket for verification documents, partner-message and support attachments.
--    The app uses it once PRIVATE_STORAGE_BUCKET=shopinbos-private is set; until then those files keep going to
--    the main (public) bucket, but are only ever linked through signed, access-checked URLs.
--    Existing files stay where they are; the app looks in the private bucket first, then the main one.
INSERT INTO storage.buckets (id, name, public)
VALUES ('shopinbos-private', 'shopinbos-private', false)
ON CONFLICT (id) DO UPDATE SET public = false;
-- No policies on shopinbos-private: only the service role (server) reads or writes it.

-- 3. The main media bucket (public read for product photos, logos, banners).
--    The browser uploads product photos and videos directly (src/lib/supabase/storage.ts → "products/…");
--    every other upload goes through the server with the service role. Signed-in users may therefore only
--    INSERT under products/, and may never UPDATE or DELETE (overwrite someone else's file).
--    Review existing policies first and drop any broader ones for anon/authenticated:
--      SELECT policyname, cmd, roles, qual, with_check FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects';
-- Live (checked 2026-10-12) had "Auth upload shopinbos-media" letting any signed-in user insert anywhere in the
-- bucket, plus own-folder update/delete policies nothing uses (browser uploads go to products/, upsert: false).
DROP POLICY IF EXISTS "Auth upload shopinbos-media" ON storage.objects;
DROP POLICY IF EXISTS "Auth update own shopinbos-media" ON storage.objects;
DROP POLICY IF EXISTS "Auth delete own shopinbos-media" ON storage.objects;
DROP POLICY IF EXISTS "shopinbos media: signed-in product uploads" ON storage.objects;
CREATE POLICY "shopinbos media: signed-in product uploads" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'shopinbos-media' AND name LIKE 'products/%');
