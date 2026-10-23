-- Retention journeys and the Refer & earn announcement (src/lib/member-messaging/journeys.server.ts, announce.server.ts).
-- They log to "MemberMessage" (2026-11-24). Hourly; nothing sends until switched on in Admin › Leads › Member tips.
select cron.schedule(
  'member-journeys',
  '47 * * * *',
  $$
  select net.http_get(
    url := 'https://app.shopinbos.com/api/cron/member-journeys',
    headers := jsonb_build_object('Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')),
    timeout_milliseconds := 120000
  );
  $$
)
where not exists (select 1 from cron.job where jobname = 'member-journeys');
