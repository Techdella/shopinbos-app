-- Social posts (Marketing > Social posts): the seller's planned posts on the calendar (src/lib/social-posts).
CREATE TABLE IF NOT EXISTS "SocialPost" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "caption" TEXT NOT NULL DEFAULT '',
  "mediaUrl" TEXT,
  "mediaKind" TEXT,
  "renderedUrl" TEXT,
  "mediaSource" TEXT,
  "format" TEXT NOT NULL DEFAULT 'square',
  "fit" TEXT NOT NULL DEFAULT 'cover',
  "channels" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "productId" TEXT,
  "link" TEXT,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "scheduledAt" TIMESTAMP(3),
  "postedAt" TIMESTAMP(3),
  "results" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SocialPost_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "SocialPost_storeId_scheduledAt_idx" ON "SocialPost"("storeId", "scheduledAt");
CREATE INDEX IF NOT EXISTS "SocialPost_status_scheduledAt_idx" ON "SocialPost"("status", "scheduledAt");
-- Only the server (Prisma) reads it, like the other tables.
ALTER TABLE "SocialPost" ENABLE ROW LEVEL SECURITY;
