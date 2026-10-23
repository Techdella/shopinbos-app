-- Weekly tips from Rex & Peggy to sellers, suppliers and delivery partners (src/lib/member-messaging/tips.server.ts).
CREATE TABLE IF NOT EXISTS "MemberMessage" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "period" TEXT NOT NULL,
  "ref" TEXT NOT NULL,
  "channel" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'claimed',
  "error" TEXT,
  "providerId" TEXT,
  "sentAt" TIMESTAMP(3),
  "clickedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "MemberMessage_userId_kind_period_key" ON "MemberMessage"("userId", "kind", "period");
CREATE INDEX IF NOT EXISTS "MemberMessage_kind_period_status_idx" ON "MemberMessage"("kind", "period", "status");
CREATE INDEX IF NOT EXISTS "MemberMessage_userId_kind_createdAt_idx" ON "MemberMessage"("userId", "kind", "createdAt" DESC);
ALTER TABLE "MemberMessage" ENABLE ROW LEVEL SECURITY;

-- The tips job, every 15 minutes (it only sends on Wednesday (WhatsApp) and Thursday (email) from 10:00 Lagos, when
-- switched on in Admin › Leads › Member tips).
select cron.schedule(
  'member-tips',
  '*/15 * * * *',
  $$
  select net.http_get(
    url := 'https://app.shopinbos.com/api/cron/member-tips',
    headers := jsonb_build_object('Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')),
    timeout_milliseconds := 120000
  );
  $$
)
where not exists (select 1 from cron.job where jobname = 'member-tips');
