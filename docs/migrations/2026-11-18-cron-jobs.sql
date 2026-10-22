-- Schedules the two jobs that were never switched on in pg_cron (Admin › Developers › Launch settings showed them
-- as "Not scheduled"). Both reuse the "cron_secret" Vault secret (= CRON_SECRET in Vercel). Safe to run twice.
--
--   /api/cron/money-owed              every hour at :07   dropship debts a status change missed, daily reminders,
--                                                         pausing businesses for money long overdue
--   /api/cron/business-registrations  every 10 minutes    files paid CAC applications and reads CAC's answers
--                                                         (does nothing while registration is switched off)

select cron.schedule(
  'money-owed',
  '7 * * * *',
  $$
  select net.http_get(
    url := 'https://app.shopinbos.com/api/cron/money-owed',
    headers := jsonb_build_object('Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')),
    timeout_milliseconds := 120000
  );
  $$
)
where not exists (select 1 from cron.job where jobname = 'money-owed');

select cron.schedule(
  'business-registrations',
  '*/10 * * * *',
  $$
  select net.http_get(
    url := 'https://app.shopinbos.com/api/cron/business-registrations',
    headers := jsonb_build_object('Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')),
    timeout_milliseconds := 300000
  );
  $$
)
where not exists (select 1 from cron.job where jobname = 'business-registrations');

-- Already running in production (made by hand, copied from cron.job on 2026-10-21) so the rollback in
-- docs/qstash.md can re-create every job from docs/migrations. Each is skipped when it already exists.

select cron.schedule(
  'send-unread-message-emails',
  '*/10 * * * *',
  $$
  select net.http_get(
    url := 'https://app.shopinbos.com/api/conversations/cron',
    headers := jsonb_build_object('Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')),
    timeout_milliseconds := 120000
  );
  $$
)
where not exists (select 1 from cron.job where jobname = 'send-unread-message-emails');

select cron.schedule(
  'verification-reminders',
  '17 * * * *',
  $$
  select net.http_get(
    url := 'https://app.shopinbos.com/api/cron/verification-reminders',
    headers := jsonb_build_object('Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')),
    timeout_milliseconds := 120000
  );
  $$
)
where not exists (select 1 from cron.job where jobname = 'verification-reminders');

select cron.schedule(
  'lifecycle-emails',
  '23 * * * *',
  $$
  select net.http_get(
    url := 'https://app.shopinbos.com/api/cron/lifecycle',
    headers := jsonb_build_object('Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')),
    timeout_milliseconds := 120000
  );
  $$
)
where not exists (select 1 from cron.job where jobname = 'lifecycle-emails');

select cron.schedule(
  'sales-channels',
  '23 */2 * * *',
  $$
  select net.http_get(
    url := 'https://app.shopinbos.com/api/cron/sales-channels',
    headers := jsonb_build_object('Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')),
    timeout_milliseconds := 120000
  );
  $$
)
where not exists (select 1 from cron.job where jobname = 'sales-channels');

select cron.schedule(
  'social-posts',
  '*/5 * * * *',
  $$
  select net.http_get(
    url := 'https://app.shopinbos.com/api/cron/social-posts',
    headers := jsonb_build_object('Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')),
    timeout_milliseconds := 60000
  );
  $$
)
where not exists (select 1 from cron.job where jobname = 'social-posts');

-- To stop them:
--   select cron.unschedule('money-owed');
--   select cron.unschedule('business-registrations');
