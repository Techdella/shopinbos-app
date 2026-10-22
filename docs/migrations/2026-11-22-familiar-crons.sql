-- pg_cron jobs for the phone app's "Familiar app" features (like docs/migrations/2026-11-18-cron-jobs.sql; both reuse
-- the "cron_secret" Vault secret = CRON_SECRET in Vercel). Safe to run twice.
--
--   /api/cron/status-purge     every hour at :41      deletes expired Status posts, their views, likes and photos
--   /api/cron/post-reminders   every 5 minutes        "Time to post" reminders for the posts calendar (once per post)

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
