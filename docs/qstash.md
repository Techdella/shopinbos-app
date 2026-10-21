# Scheduled jobs on QStash

The scheduled jobs (`/api/cron/*` and `/api/conversations/cron`) run on Upstash QStash schedules instead of
Supabase pg_cron. QStash retries a failed run 3 times, never starts a job while the previous run is still going, logs
every call, and parks runs that keep failing in its dead-letter queue. pg_cron fired one request and forgot it.

Every job accepts either a QStash-signed call or `Authorization: Bearer $CRON_SECRET`
(`src/lib/auth/cron-request.ts`), so both schedulers work during the switch.

## Jobs

Defined in `scripts/qstash-schedules.mjs` (cron times are UTC):

| Schedule id                             | Route                                | Cron              |
|-----------------------------------------|--------------------------------------|-------------------|
| shopinbos-campaigns                     | /api/cron/campaigns                  | `*/5 * * * *`     |
| shopinbos-expire-orders                 | /api/cron/expire-orders              | `*/5 * * * *`     |
| shopinbos-supplier-acceptance           | /api/cron/supplier-acceptance        | `*/5 * * * *`     |
| shopinbos-push-receipts                 | /api/cron/push-receipts              | `*/5 * * * *`     |
| shopinbos-marketing                     | /api/cron/marketing                  | `*/10 * * * *`    |
| shopinbos-unread-message-emails         | /api/conversations/cron              | `*/10 * * * *`    |
| shopinbos-product-news                  | /api/cron/product-news               | `*/10 * * * *`    |
| shopinbos-whatsapp-catalog              | /api/cron/whatsapp-catalog           | `*/15 * * * *`    |
| shopinbos-partner-payins                | /api/cron/partner-payins             | `*/15 * * * *`    |
| shopinbos-delivery-jobs                 | /api/cron/delivery-jobs              | `*/15 * * * *`    |
| shopinbos-verification-reminders        | /api/cron/verification-reminders     | `17 * * * *`      |
| shopinbos-lifecycle-emails              | /api/cron/lifecycle                  | `23 * * * *`      |
| shopinbos-seasonal-campaigns            | /api/cron/seasonal-campaigns         | `*/5 * * * *`     |
| shopinbos-gmail-sync                    | /api/cron/gmail-sync                 | `*/5 * * * *`     |
| shopinbos-lead-growth                   | /api/cron/lead-growth                | `*/10 * * * *`    |
| shopinbos-sales-channels                | /api/cron/sales-channels             | `23 */2 * * *`    |
| shopinbos-domain-renewals               | /api/cron/domain-renewals            | `17 7 * * *`      |
| shopinbos-business-registrations        | /api/cron/business-registrations     | `*/10 * * * *`    |
| shopinbos-post-reminders                | /api/cron/post-reminders             | `*/5 * * * *`     |
| shopinbos-weekly-summary                | /api/cron/weekly-summary             | `0 6 * * 1`       |
| shopinbos-weekly-summary-continue       | /api/cron/weekly-summary             | `20,40 6-9 * * 1` |

These stay where they are:

- **`rider-trail-cleanup`** stays on pg_cron because it's plain SQL with no HTTP call.
- **`/api/cron/reviews`** stays on Vercel Cron (`vercel.json`).

That comes to about 2,900 calls a day, which is above QStash's free daily allowance. Put the account on
pay-as-you-go (a few cents a day at this volume).

## Switching over

1. In Vercel, set `QSTASH_CURRENT_SIGNING_KEY` and `QSTASH_NEXT_SIGNING_KEY`. Copy them from
   console.upstash.com → QStash, us-east-1. Then deploy.
2. Create the schedules:
   `QSTASH_TOKEN=... node scripts/qstash-schedules.mjs https://app.shopinbos.com`
3. Watch a few runs in console.upstash.com → QStash → Logs. Every call should return 200.
4. Switch off the pg_cron jobs QStash now runs. Run this in the Supabase SQL editor:

   ```sql
   select cron.unschedule(jobname) from cron.job where jobname in (
     'send-scheduled-campaigns', 'run-marketing', 'send-unread-message-emails', 'expire-unpaid-orders',
     'verification-reminders', 'whatsapp-catalog-sync', 'weekly-summary', 'weekly-summary-continue',
     'product-news', 'supplier-acceptance', 'partner-payins', 'push-receipts',
     'lifecycle-emails', 'seasonal-campaigns', 'gmail-sync', 'lead-growth', 'sales-channels', 'sales-channels-sync', 'domain-renewals'
   );
   ```

   Steps 2 to 4 overlap, so some jobs run on both schedulers until step 4. Weekly summaries, pay-ins and supplier
   acceptance say in their code that they're safe to run twice; the others haven't been checked. Keep the overlap
   short: run step 4 as soon as step 3 looks good.

To roll back, run `node scripts/qstash-schedules.mjs --pause` and re-create the pg_cron jobs from `docs/migrations/`.

## Day to day

- **See the schedules:** `node scripts/qstash-schedules.mjs --list`
- **Change a schedule:** edit `JOBS` in the script and run it again. It updates schedules in place by id.
- **Pause, resume or delete everything:** use `--pause`, `--resume` or `--delete`.
- **Investigate a failed run:** look in console.upstash.com → QStash → DLQ, which keeps the response body. You can
  retry the run from there.
- **Rotate the signing keys:** QStash signs with the current key and then the next one, and the app accepts both.
  After rotating in the console, update both env vars.
