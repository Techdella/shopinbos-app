-- Logistics marketplace cron (applied to production on 2026-10-20 with the Supabase SQL editor / MCP).
-- Production schedules run in Supabase pg_cron, calling the app with the cron secret kept in Vault.
--
--   * delivery-jobs: every 15 minutes, tells shops about jobs a partner didn't accept in time
--     (src/app/api/cron/delivery-jobs/route.ts).
--   * rider-trail-cleanup: also clears the trails of jobs that were returned or declined (new statuses).
--
-- cron.schedule with an existing name replaces that job, so this is safe to run again.

select cron.schedule('delivery-jobs', '*/15 * * * *', $cmd$
  select net.http_get(
    url := 'https://app.shopinbos.com/api/cron/delivery-jobs',
    headers := jsonb_build_object('Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')),
    timeout_milliseconds := 60000
  );
$cmd$);

select cron.schedule('rider-trail-cleanup', '23 3 * * *', $cmd$
  delete from "RiderLocationPoint" p
  using "DeliveryBooking" b
  where p."bookingId" = b."id"
    and b."status" in ('delivered', 'cancelled', 'failed', 'returned', 'declined')
    and coalesce(b."deliveredAt", b."updatedAt") < now() - interval '7 days';
$cmd$);
