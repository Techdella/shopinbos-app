-- Email as an inbox channel: the seller connects Gmail or their own domain (Inbox → Email, /home/inbox/email).
--
-- No new tables or columns. The connection lives on the store's existing "InboxChannel" row for channel = 'email':
--   status       'connected' once the store can send (Gmail signed in, or its domain verified in Resend)
--   externalId   the address emails go from
--   settings     { provider: 'platform' | 'resend_domain' | 'gmail', address, fromName,
--                  domain: { name, resendId, prefix, records[], status, auto, receiving, dnsError, startedAt, checkedAt },
--                  gmail: { email, historyId, syncedAt } }
--   credentials  Gmail refresh/access tokens, AES-256-GCM encrypted with INBOX_ENCRYPTION_KEY (never sent to the browser)
--
-- This file only adds an index for the sync job's lookups and the 5-minute schedule. Safe to run more than once.

-- The sync job finds Gmail stores and pending domains by these JSON fields.
CREATE INDEX IF NOT EXISTS "InboxChannel_email_provider_idx"
  ON "InboxChannel" ((settings->>'provider'))
  WHERE channel = 'email';

-- /api/cron/gmail-sync every 5 minutes: pulls customers' replies from connected Gmail accounts into the inbox (only
-- threads started in the app, or mail from known customers) and re-checks own domains still waiting for their DNS.
-- Reuses the "cron_secret" Vault secret (= CRON_SECRET in Vercel), like the other jobs.
--
-- To see recent calls:  select status_code, content, created from net._http_response order by created desc limit 10;
-- To stop it:           select cron.unschedule('gmail-sync');
--
-- The job, as run by hand (same as the guarded block below):
--
-- select cron.schedule(
--   'gmail-sync',
--   '*/5 * * * *',
--   $$
--   select net.http_get(
--     url := 'https://app.shopinbos.com/api/cron/gmail-sync',
--     headers := jsonb_build_object(
--       'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
--     ),
--     timeout_milliseconds := 60000
--   );
--   $$
-- )
-- where not exists (select 1 from cron.job where jobname = 'gmail-sync');
--
-- Guarded so it only schedules when pg_cron, pg_net and Vault exist, and never twice.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron')
     AND EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net')
     AND EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'vault')
     AND NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'gmail-sync') THEN
    PERFORM cron.schedule(
      'gmail-sync',
      '*/5 * * * *',
      $job$
      select net.http_get(
        url := 'https://app.shopinbos.com/api/cron/gmail-sync',
        headers := jsonb_build_object(
          'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
        ),
        timeout_milliseconds := 60000
      );
      $job$
    );
  END IF;
END $$;
