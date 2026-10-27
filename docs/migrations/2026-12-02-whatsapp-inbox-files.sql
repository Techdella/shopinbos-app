-- Admin inbox: every file people send to Shopinbos's WhatsApp number (voice notes, videos, Word/Excel files,
-- zips, stickers…) is copied into the support ticket, up to 50 MB each.
--
-- The private bucket only accepted JPG, PNG, WebP and PDF up to 10 MB, so anything else failed to store. Only the
-- server (service role) writes to this bucket and the app checks every file itself (anything a browser would run
-- is stored as a plain download), so the bucket no longer limits types, and its size limit becomes 50 MB.
-- Only runs where the Supabase storage schema exists; never lowers a larger limit.
DO $$ BEGIN
  IF to_regclass('storage.buckets') IS NOT NULL THEN
    UPDATE storage.buckets
       SET allowed_mime_types = NULL
     WHERE id = 'shopinbos-private';
    UPDATE storage.buckets
       SET file_size_limit = 52428800
     WHERE id = 'shopinbos-private'
       AND file_size_limit IS NOT NULL
       AND file_size_limit < 52428800;
  END IF;
END $$;
