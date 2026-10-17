-- Media library: a title and alt text for each entry, edited on the seller's Media page (/home/media,
-- PATCH /api/app/media/[id]). "alt" says what the picture shows (screen readers, search engines) and is offered
-- when the picture is picked for a page or a blog post; "title" is the person's own name for it and is shown
-- (and searched) instead of the file name when set. Both nullable; existing rows keep NULL.
--
-- Additive only, safe to run more than once. Needs 2026-10-26-media-library.sql first. Run BEFORE deploying the
-- code that uses it (the library reads these columns, so without them it shows as empty).

ALTER TABLE "MediaAsset" ADD COLUMN IF NOT EXISTS "title" TEXT;
ALTER TABLE "MediaAsset" ADD COLUMN IF NOT EXISTS "alt" TEXT;
