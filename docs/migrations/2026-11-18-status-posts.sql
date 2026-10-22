-- Status (24-hour stories) between sellers, suppliers and delivery partners in the phone app
-- (/api/mobile/status, rules in shared/status.ts, models in the "Status (24-hour stories)" section of
-- prisma/schema.prisma).
--
--   * "StatusPost": a post (headline, caption, photo, tone, product, button) that expires 24 hours after posting.
--   * "StatusView": who saw a post, once per viewer.
--   * "StatusLike": a like on a post, once per user.
--
-- Expired posts are never returned; /api/cron/status-purge deletes them later (schedule it in
-- scripts/qstash-schedules.mjs, job "status-purge").
--
-- Additive only, safe to run more than once. Run BEFORE deploying the code that uses it.

CREATE TABLE IF NOT EXISTS "StatusPost" (
  "id" TEXT NOT NULL,
  "authorId" TEXT NOT NULL,
  "role" "Role" NOT NULL,
  "headline" TEXT NOT NULL,
  "caption" TEXT,
  "imageUrl" TEXT,
  "tone" TEXT NOT NULL DEFAULT 'peach',
  "productId" TEXT,
  "ctaKind" TEXT,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StatusPost_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "StatusPost_authorId_expiresAt_idx" ON "StatusPost"("authorId", "expiresAt");
CREATE INDEX IF NOT EXISTS "StatusPost_expiresAt_idx" ON "StatusPost"("expiresAt");

CREATE TABLE IF NOT EXISTS "StatusView" (
  "id" TEXT NOT NULL,
  "postId" TEXT NOT NULL,
  "viewerId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StatusView_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "StatusView_postId_viewerId_key" ON "StatusView"("postId", "viewerId");
CREATE INDEX IF NOT EXISTS "StatusView_viewerId_idx" ON "StatusView"("viewerId");

CREATE TABLE IF NOT EXISTS "StatusLike" (
  "id" TEXT NOT NULL,
  "postId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StatusLike_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "StatusLike_postId_userId_key" ON "StatusLike"("postId", "userId");
CREATE INDEX IF NOT EXISTS "StatusLike_userId_idx" ON "StatusLike"("userId");

-- Foreign keys (added only when missing, so a re-run is a no-op).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'StatusPost_authorId_fkey') THEN
    ALTER TABLE "StatusPost" ADD CONSTRAINT "StatusPost_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'StatusView_postId_fkey') THEN
    ALTER TABLE "StatusView" ADD CONSTRAINT "StatusView_postId_fkey" FOREIGN KEY ("postId") REFERENCES "StatusPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'StatusView_viewerId_fkey') THEN
    ALTER TABLE "StatusView" ADD CONSTRAINT "StatusView_viewerId_fkey" FOREIGN KEY ("viewerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'StatusLike_postId_fkey') THEN
    ALTER TABLE "StatusLike" ADD CONSTRAINT "StatusLike_postId_fkey" FOREIGN KEY ("postId") REFERENCES "StatusPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'StatusLike_userId_fkey') THEN
    ALTER TABLE "StatusLike" ADD CONSTRAINT "StatusLike_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- Supabase exposes public tables through its Data API: keep these server-only (Prisma uses the service role).
ALTER TABLE "StatusPost" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StatusView" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StatusLike" ENABLE ROW LEVEL SECURITY;

-- pg_cron (production schedules run here, reusing the "cron_secret" Vault secret); scripts/qstash-schedules.mjs has
-- the same job. Run after deploying the route. Skipped when it already exists.
select cron.schedule(
  'status-purge',
  '41 * * * *',
  $$
  select net.http_get(
    url := 'https://app.shopinbos.com/api/cron/status-purge',
    headers := jsonb_build_object('Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')),
    timeout_milliseconds := 120000
  );
  $$
)
where not exists (select 1 from cron.job where jobname = 'status-purge');
