-- Peggy's morning brief for suppliers and delivery partners (src/app/api/cron/morning-brief, src/lib/dashboard/
-- morning-brief.server.ts): once a day at 06:31 UTC (7:31 in Lagos), one notification listing what needs them
-- today. Run AFTER deploying the code that adds the route (before that it would 404). Safe to run more than once.
-- Uses the same vault secret as 2026-11-18-cron-jobs.sql.

select cron.schedule(
  'morning-brief',
  '31 6 * * *',
  $$
  select net.http_get(
    url := 'https://app.shopinbos.com/api/cron/morning-brief',
    headers := jsonb_build_object('Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')),
    timeout_milliseconds := 300000
  );
  $$
)
where not exists (select 1 from cron.job where jobname = 'morning-brief');
