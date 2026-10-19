# Meta privacy callbacks (Deauthorize and Data Deletion)

Meta's App Review asks for both. They fire when someone removes Shopinbos from their Facebook account
(Settings › Business integrations / Apps and websites).

| Callback | URL | What we do |
|---|---|---|
| Deauthorize | `{APP_URL}/api/webhooks/meta/deauthorize` | Switch off everything that person connected and forget the keys. The seller sees "Facebook access was removed" and can connect again. |
| Data deletion | `{APP_URL}/api/webhooks/meta/data-deletion` | The same, and also delete what we got from Meta about those connections. We answer `{ url, confirmation_code }` and the person follows progress at `{APP_URL}/meta-data-deletion?code=…`. |

Both check Meta's `signed_request` with `META_APP_SECRET` (`src/lib/meta/signed-request.ts`) and refuse anything
else with a 400. The work runs just after the response (`src/lib/meta/user-data.server.ts`).

## How we know whose data it is

Meta names the person only by their app-scoped user ID. Every place that saves a token issued to our app records
it in `MetaUserLink` (`src/lib/meta/user-links.server.ts`):

| Source | Where |
|---|---|
| `inbox_whatsapp` | WhatsApp Embedded Signup, or a pasted WhatsApp token (`src/lib/inbox/connect.ts`) |
| `inbox_messenger`, `inbox_instagram` | Pasted Page tokens (`src/lib/inbox/connect.ts`) |
| `sales_meta` | One-tap catalog connect on /channels (`src/lib/sales-channels/server.ts`) |
| `meta_ads` | Meta ads connect (`src/lib/ad-campaigns/meta.server.ts`) |

Tokens from a seller's *own* Meta app aren't recorded: Meta sends those callbacks to the seller's app, not ours.

## What gets deleted

- **Deauthorize:** for each linked connection, the access token is cleared and the connection switched off:
  - WhatsApp, Messenger and Instagram inbox channels
  - WhatsApp catalog sync
  - the Meta catalog channel, set to "reconnect"
  - the Meta ads connection

  Account and Page IDs stay so reconnecting is quick.
- **Data deletion:** all of the above, and also the Meta-sourced identifiers and names:
  - phone number, Page and Instagram account IDs and display names, and the WhatsApp settings (WABA ID, phone number, quality rating)
  - the catalog, business and WhatsApp account IDs
  - the Meta catalog channel's account, catalog and feed IDs
  - the person's `MetaUserLink` rows

  The request is kept under its confirmation code with a SHA-256 of the user ID, not the ID.
- **Kept in both cases:** the store's own records (products, orders, and the messages customers sent the store).
  They belong to the seller's business and go when the Shopinbos account is closed.

If a deletion fails, the request shows "Delayed" on the status page and the error goes to Sentry
(`area: meta-data-deletion`). Fix the cause, then delete the leftovers by hand; the `MetaUserLink` rows are still
there because they're only removed once everything has succeeded.

## Setup

1. Run `docs/migrations/2026-11-07-meta-user-data.sql` on the database, then deploy.
2. Link the connections made before this change (it needs `INBOX_ENCRYPTION_KEY`, `META_APP_ID`, `META_APP_SECRET`
   and the database):
   `npx tsx --conditions=react-server --env-file=.env.local scripts/backfill-meta-user-links.ts`
   Tokens that have already stopped working can't be looked up. Those people get linked the next time they connect.
3. In the Meta App Dashboard (app `shopinbos`):
   - **Facebook Login for Business › Settings › Deauthorize callback URL:** `https://app.shopinbos.com/api/webhooks/meta/deauthorize`
   - **App settings › Basic › Data deletion:** choose "Data deletion callback URL" and enter
     `https://app.shopinbos.com/api/webhooks/meta/data-deletion`
4. Check it end to end. Build a signed request with `signRequest()` from `src/lib/meta/signed-request.ts` and your
   app secret, then post it as `signed_request=…` to the data-deletion URL. You should get back a URL and a code,
   and the status page should show "Completed".
