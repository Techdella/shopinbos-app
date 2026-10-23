-- Weekly updates: status-style posts from the Shopinbos team that sellers, suppliers and delivery partners tap
-- through from the ring in the top bar, made at /admin/updates (shared/weekly-updates.ts).
-- Additive only. Safe to run more than once. Before this runs, the ring stays hidden and /admin/updates says the
-- update is needed. Uploads go to the public media bucket under platform/updates/ (same bucket and 50 MB limit
-- as help videos: docs/migrations/2026-10-18-help-videos.sql).

CREATE TABLE IF NOT EXISTS "WeeklyUpdate" (
  "id" TEXT NOT NULL,
  "kind" TEXT NOT NULL DEFAULT 'text',
  "title" TEXT NOT NULL,
  "body" TEXT,
  "theme" TEXT NOT NULL DEFAULT 'navy',
  "motion" TEXT,
  "mediaUrl" TEXT,
  "posterUrl" TEXT,
  "durationSeconds" INTEGER,
  "ctaLabel" TEXT,
  "ctaUrl" TEXT,
  "roles" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "published" BOOLEAN NOT NULL DEFAULT false,
  "publishAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3),
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WeeklyUpdate_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "WeeklyUpdate_published_publishAt_idx" ON "WeeklyUpdate"("published", "publishAt");

CREATE TABLE IF NOT EXISTS "WeeklyUpdateView" (
  "id" TEXT NOT NULL,
  "updateId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "viewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WeeklyUpdateView_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "WeeklyUpdateView_updateId_userId_key" ON "WeeklyUpdateView"("updateId", "userId");
CREATE INDEX IF NOT EXISTS "WeeklyUpdateView_userId_idx" ON "WeeklyUpdateView"("userId");
DO $$ BEGIN
  ALTER TABLE "WeeklyUpdateView" ADD CONSTRAINT "WeeklyUpdateView_updateId_fkey"
    FOREIGN KEY ("updateId") REFERENCES "WeeklyUpdate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- The app reads and writes through Prisma (table owner); nothing reaches these tables with the anon key.
ALTER TABLE "WeeklyUpdate" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WeeklyUpdateView" ENABLE ROW LEVEL SECURITY;

-- Storage: update pictures (GIF too) and videos, and the 60-second intros' narration clips (MP3, made by the server
-- under platform/intro-voice/), go to the public media bucket. If the bucket only accepts listed file types, add
-- these. Only runs where the Supabase storage schema exists; never removes a type.
DO $$
DECLARE kind TEXT;
BEGIN
  IF to_regclass('storage.buckets') IS NOT NULL THEN
    FOREACH kind IN ARRAY ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/webm', 'audio/mpeg'] LOOP
      UPDATE storage.buckets
         SET allowed_mime_types = array_append(allowed_mime_types, kind)
       WHERE id = 'shopinbos-media'
         AND allowed_mime_types IS NOT NULL
         AND cardinality(allowed_mime_types) > 0
         AND NOT (kind = ANY(allowed_mime_types));
    END LOOP;
  END IF;
END $$;
