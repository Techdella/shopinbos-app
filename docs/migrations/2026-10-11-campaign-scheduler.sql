-- APPLIED to Supabase project "shopinbos" on 2026-10-11 as migration schedule_campaign_cron.
--
-- Scheduled campaigns need something to call GET /api/cron/campaigns regularly. Vercel's Hobby (free)
-- plan only allows daily crons, so Supabase pg_cron + pg_net call it every 5 minutes instead (free).
--
-- The shared secret is generated inside Supabase Vault and never leaves the database. Copy it into
-- Vercel as CRON_SECRET: Supabase Dashboard > Integrations > Vault > "cron_secret" > reveal.
--
-- To point the job at a different domain later:
--   select cron.alter_job((select jobid from cron.job where jobname = 'send-scheduled-campaigns'),
--     command := $$ ...same command with the new url... $$);
-- To see recent calls:  select status_code, content, created from net._http_response order by created desc limit 10;
-- To stop it:           select cron.unschedule('send-scheduled-campaigns');

create extension if not exists pg_cron;
create extension if not exists pg_net;

select vault.create_secret(
  encode(extensions.gen_random_bytes(32), 'hex'),
  'cron_secret',
  'Bearer secret for /api/cron/campaigns. Must equal CRON_SECRET in Vercel.'
)
where not exists (select 1 from vault.secrets where name = 'cron_secret');

select cron.schedule(
  'send-scheduled-campaigns',
  '*/5 * * * *',
  $$
  select net.http_get(
    url := 'https://shopinbos-app.vercel.app/api/cron/campaigns',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    timeout_milliseconds := 60000
  );
  $$
);
