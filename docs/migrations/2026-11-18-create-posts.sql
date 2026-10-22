-- Create with Rex and the posts calendar in the phone app (prisma/schema.prisma, "Create with Rex and posts"):
--
--   * "CreateJob": one "Make a post" request and its 3 designs (src/app/api/mobile/create).
--   * "PlannedPost": posts in the calendar. The reminder cron (src/app/api/cron/post-reminders) sends
--     "Time to post: ..." once at scheduledAt and sets remindedAt. Nothing is posted for anyone.
--
-- The posts table is "PlannedPost" (Prisma model ScheduledPost, @@map): production already has an unrelated, empty
-- "ScheduledPost" table from an older design, left untouched.
--
-- Additive only, safe to run more than once. Run BEFORE deploying the code that uses it.

CREATE TABLE IF NOT EXISTS "CreateJob" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'making',
  "format" TEXT NOT NULL,
  "ideaId" TEXT,
  "prompt" TEXT,
  "productId" TEXT,
  "designs" JSONB NOT NULL DEFAULT '[]',
  "error" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CreateJob_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "CreateJob_userId_createdAt_idx" ON "CreateJob"("userId", "createdAt");

CREATE TABLE IF NOT EXISTS "PlannedPost" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "designId" TEXT,
  "imageUrl" TEXT,
  "caption" TEXT NOT NULL,
  "platforms" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "status" TEXT NOT NULL DEFAULT 'draft',
  "scheduledAt" TIMESTAMP(3),
  "postedAt" TIMESTAMP(3),
  "remindedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PlannedPost_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "PlannedPost_userId_scheduledAt_idx" ON "PlannedPost"("userId", "scheduledAt");
CREATE INDEX IF NOT EXISTS "PlannedPost_status_scheduledAt_idx" ON "PlannedPost"("status", "scheduledAt");

-- Server-only: no policies, so the anon and authenticated roles can't read them through the Supabase API.
ALTER TABLE "CreateJob" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PlannedPost" ENABLE ROW LEVEL SECURITY;

-- pg_cron (production schedules run here, reusing the "cron_secret" Vault secret); scripts/qstash-schedules.mjs has
-- the same job. Run after deploying the route. Skipped when it already exists.
select cron.schedule(
  'post-reminders',
  '*/5 * * * *',
  $$
  select net.http_get(
    url := 'https://app.shopinbos.com/api/cron/post-reminders',
    headers := jsonb_build_object('Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')),
    timeout_milliseconds := 120000
  );
  $$
)
where not exists (select 1 from cron.job where jobname = 'post-reminders');
