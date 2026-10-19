-- Notifications that reach people: push to phones (Expo) and browsers (Web Push), one notify() path with
-- per-category × channel choices, quiet hours, dedupe and burst summaries (src/lib/notifications/notify.server.ts,
-- shared/notifications.ts).
--
--   * "Notification".event / category / dedupeKey: the event (e.g. "order.new"), its settings category (orders,
--     money, messages, deliveries, stock, marketing, account) and a key so the same thing is never sent twice
--     (unique per person; NULLs don't clash, so older rows are fine).
--   * "PushDevice": a phone's Expo push token or a browser's Web Push subscription (endpoint + keys), for an
--     account (userId) or a rider (riderId: riders have no account). disabledAt is set when someone switches it
--     off, or when the token is dead (Expo DeviceNotRegistered, Web Push 404/410, or 5 failures in a row).
--   * "NotificationDelivery": each push / email / SMS / WhatsApp sent or held back. Expo tickets are checked by
--     /api/cron/push-receipts; "held_quiet" and "held_burst" rows are sent there as one summary. Kept 30 days.
--   * "NotificationSetting": quiet hours per person (default on, 22:00 to 07:00 Africa/Lagos). The category ×
--     channel switches are "NotificationPreference" rows with eventKey 'notify.<category>' (no schema change).
--
-- Additive only, safe to run more than once. RLS is on with no policies for the new tables: only the app's server
-- connection (which bypasses RLS) reads or writes them. Run BEFORE deploying the code that uses it (notify() falls
-- back to a plain notification if the new columns are missing, but devices and settings need the tables).

ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "event" TEXT;
ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "category" TEXT;
ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "dedupeKey" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "Notification_userId_dedupeKey_key" ON "Notification"("userId", "dedupeKey");
CREATE INDEX IF NOT EXISTS "Notification_userId_category_createdAt_idx" ON "Notification"("userId", "category", "createdAt" DESC);

CREATE TABLE IF NOT EXISTS "PushDevice" (
  "id" TEXT NOT NULL,
  "userId" TEXT,
  "riderId" TEXT,
  "platform" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "token" TEXT NOT NULL,
  "p256dh" TEXT,
  "auth" TEXT,
  "appVersion" TEXT,
  "deviceName" TEXT,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "disabledAt" TIMESTAMP(3),
  "failureCount" INTEGER NOT NULL DEFAULT 0,
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PushDevice_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "PushDevice_token_key" ON "PushDevice"("token");
CREATE INDEX IF NOT EXISTS "PushDevice_userId_disabledAt_idx" ON "PushDevice"("userId", "disabledAt");
CREATE INDEX IF NOT EXISTS "PushDevice_riderId_disabledAt_idx" ON "PushDevice"("riderId", "disabledAt");

DO $$ BEGIN
  ALTER TABLE "PushDevice" ADD CONSTRAINT "PushDevice_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "PushDevice" ADD CONSTRAINT "PushDevice_riderId_fkey"
    FOREIGN KEY ("riderId") REFERENCES "LogisticsTeamMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "PushDevice" ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS "NotificationDelivery" (
  "id" TEXT NOT NULL,
  "notificationId" TEXT,
  "userId" TEXT,
  "riderId" TEXT,
  "deviceId" TEXT,
  "channel" TEXT NOT NULL,
  "provider" TEXT,
  "status" TEXT NOT NULL,
  "ticketId" TEXT,
  "collapseKey" TEXT,
  "category" TEXT,
  "title" TEXT,
  "body" TEXT,
  "error" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "checkedAt" TIMESTAMP(3),
  CONSTRAINT "NotificationDelivery_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "NotificationDelivery_status_createdAt_idx" ON "NotificationDelivery"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "NotificationDelivery_ticketId_idx" ON "NotificationDelivery"("ticketId");
CREATE INDEX IF NOT EXISTS "NotificationDelivery_userId_collapseKey_createdAt_idx" ON "NotificationDelivery"("userId", "collapseKey", "createdAt");
CREATE INDEX IF NOT EXISTS "NotificationDelivery_notificationId_idx" ON "NotificationDelivery"("notificationId");

DO $$ BEGIN
  ALTER TABLE "NotificationDelivery" ADD CONSTRAINT "NotificationDelivery_notificationId_fkey"
    FOREIGN KEY ("notificationId") REFERENCES "Notification"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "NotificationDelivery" ADD CONSTRAINT "NotificationDelivery_deviceId_fkey"
    FOREIGN KEY ("deviceId") REFERENCES "PushDevice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "NotificationDelivery" ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS "NotificationSetting" (
  "userId" TEXT NOT NULL,
  "quietHoursEnabled" BOOLEAN NOT NULL DEFAULT true,
  "quietStart" TEXT NOT NULL DEFAULT '22:00',
  "quietEnd" TEXT NOT NULL DEFAULT '07:00',
  "timezone" TEXT NOT NULL DEFAULT 'Africa/Lagos',
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "NotificationSetting_pkey" PRIMARY KEY ("userId")
);

DO $$ BEGIN
  ALTER TABLE "NotificationSetting" ADD CONSTRAINT "NotificationSetting_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "NotificationSetting" ENABLE ROW LEVEL SECURITY;

-- /api/cron/push-receipts every 5 minutes: "5 new orders" summaries for held bursts, the morning summary after
-- quiet hours, Expo push receipts (phones whose app was removed are switched off) and clearing delivery history
-- older than 30 days. Reuses the "cron_secret" Vault secret (= CRON_SECRET in Vercel). Kept commented out so it is
-- never scheduled by accident; run it once the app is deployed with the route:
--
-- select cron.schedule(
--   'push-receipts',
--   '*/5 * * * *',
--   $$
--   select net.http_get(
--     url := 'https://shopinbos-app.vercel.app/api/cron/push-receipts',
--     headers := jsonb_build_object(
--       'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
--     ),
--     timeout_milliseconds := 60000
--   );
--   $$
-- )
-- where not exists (select 1 from cron.job where jobname = 'push-receipts');
--
-- To stop it:
--   select cron.unschedule('push-receipts');
