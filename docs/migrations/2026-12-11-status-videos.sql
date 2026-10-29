-- Video statuses: a StatusPost can carry a short video (up to 30 seconds, 25 MB) instead of a photo. The phone
-- uploads the MP4 (and a poster frame) straight to Storage with a one-time signed upload URL from
-- POST /api/mobile/status/upload-url (never through a Vercel function body), under status/<authorId>/ in the public
-- media bucket; POST /api/mobile/status checks the URLs are that author's and the stored file really is a video of
-- the allowed size (shared/status-video.ts). The purge cron removes the files once the post has expired.
--
--   * "videoUrl":   the MP4 / MOV in the bucket (null for a photo or text post).
--   * "posterUrl":  a still frame shown while the video loads, and in rings and thumbnails.
--   * "durationMs": the video's length as the phone measured it (the viewer's progress follows the real video).
--
-- Storage: the bucket's file size limit must allow 25 MB (it already does if help videos up to 50 MB upload).
-- Additive only, safe to run more than once. Run BEFORE deploying the code that uses it.

ALTER TABLE "StatusPost" ADD COLUMN IF NOT EXISTS "videoUrl" TEXT;
ALTER TABLE "StatusPost" ADD COLUMN IF NOT EXISTS "posterUrl" TEXT;
ALTER TABLE "StatusPost" ADD COLUMN IF NOT EXISTS "durationMs" INTEGER;
