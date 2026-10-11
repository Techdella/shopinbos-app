# App Functional Map

## Public Commerce

- Public store: `/s/[slug]` reads `/api/public/store/[slug]`, renders only published `StoreProduct` rows, and shows an empty state when a store has no products.
- Cart: `src/hooks/useCart.ts` persists per-store cart items in local storage.
- Checkout: `/s/[slug]/checkout` posts to `/api/public/store/[slug]/checkout`. The API validates that each product belongs to the store and is published, re-prices every line from the database, creates a `RetailOrder`, sends Resend email notifications, and creates an in-app seller notification.
- Order confirmation: `/s/[slug]/order/[orderId]` displays stored order data.

## Seller Workspace

- Profile: `/home/profile` updates `User` and `Store` profile fields.
- Marketing: `/home/marketing` now reads recent `RetailOrder`, `Discount`, and `Coupon` data. Social selling is marked coming soon.
- Automations: `/home/automations` reflects the active checkout email automation powered by Resend.
- Pages/CMS: `/seller/pages` reads `StorePage` rows only. No sample CMS posts or pages are injected.

## Domains

- Domain search, connect, purchase, and order lookup use Vercel APIs through `src/lib/domains/vercel.ts`.
- Required env vars: `VERCEL_TOKEN` and `VERCEL_PROJECT_ID_OR_NAME`; optionally `VERCEL_TEAM_ID` or `VERCEL_TEAM_SLUG`.
- The app no longer returns fake domain availability or fake purchase order IDs when Vercel is not configured.

## Email And Notifications

- Resend SDK is installed and used through `src/lib/notifications/resend.ts`.
- Required env var: `RESEND_API_KEY`.
- Optional env vars: `RESEND_AUDIENCE_ID`, and a verified sender/domain if changing the default `from` address.

## Completed

- Add inventory fields to `StoreProduct` and variants — stock fields existed (`currentStock`, `reservedStock`, etc.); checkout now validates and decrements stock.
- Add delivery/shipping rate rules — `ShippingZone` model rates are now consulted at checkout before falling back to `brandSettings.shippingConfig.flatRate`.
- Add domain purchase UI states for Vercel configuration errors — error states surfaced from `vercel.ts` helper functions (see `hasVercelDomainConfig` / `VercelApiError`).

- Broadcast campaigns send real email with per-recipient tracking (`CampaignRecipient`), unsubscribe handling and conversion attribution — see `src/lib/campaigns/` and Phase 7 in `SHOPINBOS_APP_SYNC.md`.

## Remaining To-Do

- Evaluate `CustomerSegment.rules` so campaigns can target saved segments.
- Add email event preferences if sellers need to toggle individual transactional emails.
