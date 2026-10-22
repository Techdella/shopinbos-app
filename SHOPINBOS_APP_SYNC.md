# Shopinbos App and WordPress Sync Contract

## Source of Truth

The Shopinbos app and backend are the production source of truth for marketplace data. WordPress is a read-only client that consumes safe public marketplace data from the app.

WordPress must never create, update, moderate, approve, price, reserve inventory, request quotes, book logistics, or write marketplace records directly.

## Build Phases

Status date: 2026-06-18.

### Phase 1 - Marketplace Contract and Public API

Status: complete.

- [x] Lock the app as the marketplace source of truth.
- [x] Serve read-only public API routes under `/api/v1/public`.
- [x] Keep `/api/public` as a compatibility alias.
- [x] Document CORS, cache headers, pagination, slugs, and visibility rules.
- [x] Add OpenAPI coverage through `docs/openapi.yaml` and `GET /api/docs`.

### Phase 2 - Auth, Portal Routing, and Role Separation

Status: complete.

- [x] Split seller, supplier, and logistics login/signup screens.
- [x] Keep login copy conversational and remove setup/dev language.
- [x] Preserve marketplace intent parameters through login/signup.
- [x] Route each role to its own portal namespace after auth.
- [x] Keep supplier and logistics users out of seller-only pages.

### Phase 3 - Mockup-Matched Onboarding

Status: in progress, persistence wired.

- [x] Rebuild seller onboarding around the mockup flow: meet Rex, business basics, build path, Rex/template build, products, payouts, logistics, domain, launch.
- [x] Add AI-powered Rex memory, voice transcription, document notes, and store-builder handoff.
- [x] Move supplier onboarding into the focused verification mockup instead of the portal table shell.
- [x] Move logistics onboarding into the focused coverage-map mockup instead of the portal table shell.
- [x] Add shared onboarding UI primitives for mockup buttons, fields, progress, steps, and phone preview.
- [x] Connect supplier document upload metadata to private verification records.
- [x] Connect logistics coverage-zone edits to private partner coverage records.
- [x] Apply Phase 3 private onboarding fields to Supabase.
- [x] Browser-verify the onboarding screens at desktop and mobile widths.

### Phase 4 - Inner Portal Pages

Status: complete.

- [x] Convert shared role pages to the mockup-style operational shell.
- [x] Rebuild seller payments and logistics pages with focused operational layouts.
- [x] Build supplier product creation/editing as a full workflow, not just tables.
- [x] Build supplier quote response and order management flows.
- [x] Build logistics bookings, quotes, pricing, and coverage management flows.
- [x] Add empty, loading, and error states across seller, supplier, and logistics portals.

### Phase 5 - Marketplace Actions and Marketing Website API

Status: complete.

- [x] Keep public marketplace APIs read-only and WordPress-safe.
- [x] Add authenticated continuation endpoints for marketplace CTAs.
- [x] Add a small marketing-site integration guide with example fetch calls.
- [x] Add API response examples for products, suppliers, logistics partners, categories, and CTA links.
- [x] Add end-to-end smoke checks for WordPress CTA links into login/signup and back into portal actions.

### Phase 6 - Admin, Moderation, and Launch QA

Status: in progress.

- [x] Build admin namespaces for suppliers, supplier products, logistics partners, categories, marketplace, and settings.
- [x] Wire cache invalidation calls into public marketplace moderation paths.
- [x] Expand admin moderation views with filters, bulk actions, and review notes.
- [x] Add role-guard tests for every protected portal route.
- [x] Run full typecheck (0 errors) and re-enable build-time type checking.
- [x] Bring the live `shopinbos` database up to the Prisma schema (`docs/migrations/2026-10-11-live-catch-up.sql`, applied 2026-10-11).
- [x] Run route smoke checks against a local database: 204/204 pages and API routes pass for every role (`scripts/smoke/`).
- [x] Visual QA of seller, supplier and logistics onboarding at 1440px and 390px; mobile overflow fixed on the path picker and Rex screen.

### Phase 7 - Email Campaigns and Payment Integrity

Status: built and verified locally; needs the database migrations and env vars below.

- [x] Send broadcast campaigns through Resend in batches of 100, one tracked email per recipient (`CampaignRecipient`).
- [x] Audiences: everyone, subscribers only, minimum paid orders, minimum spend, specific emails; unsubscribed/bounced contacts are always skipped.
- [x] Open pixel, click tracking (only to links in the campaign body), one-click unsubscribe (RFC 8058) and a confirm-to-unsubscribe page.
- [x] Attribute paid storefront orders to the campaign email that brought the buyer (7-day window); real email revenue in marketing analytics.
- [x] Scheduled campaigns via `GET /api/cron/campaigns` (Bearer `CRON_SECRET`).
- [x] Order confirmation pages verify payments with Paystack instead of trusting the `reference` URL parameter.
- [x] Plan upgrades require a successful, single-use payment for the right plan, amount and account (`PaymentReceipt`).
- [x] Campaign and payment-receipt tables applied to the live database (part of the 2026-10-11 catch-up migration).
- [ ] Set `RESEND_API_KEY`, a verified `RESEND_FROM_EMAIL`, and `CRON_SECRET` in Vercel.
- [x] Schedule `/api/cron/campaigns` every 5 minutes with Supabase pg_cron (Vercel Hobby only allows daily crons) — see `docs/migrations/2026-10-11-campaign-scheduler.sql`.
- [ ] Copy the `cron_secret` from Supabase Vault into Vercel as `CRON_SECRET` and redeploy.
- [ ] Customer segments: `CustomerSegment.rules` are stored but not evaluated yet.

### Phase 8 - App Redesign: Sign-in, Sign-up, Seller Onboarding (web + Expo)

Status: built against the 2026 app prototypes; web verified locally (route smoke + walkthrough), Expo verified by typecheck, expo-doctor and a web export walkthrough.

- [x] Design tokens (Plus Jakarta Sans, ink #16141F, accent #FF6A2B, pastel wash), phone helpers and onboarding copy in `shared/`, used by web and `apps/mobile`.
- [x] Sign-in for every portal: phone code over WhatsApp or SMS, email code, email + password, Google, forgot / reset password.
- [x] Phone-only accounts: `User.email` is optional (`docs/migrations/2026-10-11-phone-accounts.sql`).
- [x] Seller onboarding: Rex chat (5 languages) → brand → products from photos (`/api/ai/product-drafts`) → payments and delivery zones → publish (free) → live (share, QR) → checklist.
- [x] Expo app (`apps/mobile`, SDK 57, expo-router): the same auth and onboarding screens against the same API with Bearer tokens; `/api/app/payout-bank` for bank linking.
- [x] Fixed: the proxy redirected `/api/*` calls from sellers mid-onboarding to the onboarding page.
- [x] Applied `docs/migrations/2026-10-11-phone-accounts.sql` to the live database (2026-10-11).
- [ ] Supabase: Send SMS hook for phone codes (SUPABASE_SEND_SMS_HOOK_SECRET + SMS_PROVIDER keys), Google OAuth client, `{{ .Token }}` in the Magic Link and Confirm signup templates, redirect URLs (`node scripts/configure-supabase-auth.mjs`).
- [ ] Optional `NEXT_PUBLIC_SUPPORT_WHATSAPP` for the "Stuck? Message us" card.
- [ ] Next design phase: seller app dashboard (web and mobile), supplier / logistics onboarding restyle, then remove the legacy seller branch of `OnboardingFlow.tsx`.
- [ ] Checkout does not read the payment-method preferences (`brandSettings.paymentConfig.methods`) yet.

### Phase 9 - Seller Home Dashboard and App Shell (web + Expo)

Status: built against the "Seller app · web" and "Seller app · iOS and Android" mockups; verified locally.

- [x] App shell for every portal: new sidebar (store card, Add product, grouped nav, badges) and top bar (title, pill search, Ask Peggy, notifications with real unread state); slide-in menu on small screens.
- [x] Seller nav per the mockup; extra existing pages under "More tools"; a test checks every nav link has a page.
- [x] Seller home with real data (`src/lib/dashboard`): today's and this week's sales, orders, visitors, chats, Peggy's tasks, 14-day sales, checklist, latest orders, order channels, imports, best sellers. `GET /api/app/dashboard` serves the app.
- [x] Order channel tracking (`RetailOrder.channel` from `?ref=` / `utm_source`) and a storefront visit beacon for "Visitors".
- [x] Expo app: home, Products, Chats, Orders and More tabs, the orange "+" for adding products from photos, and native Ask Peggy (`POST /api/app/peggy`).
- [x] Applied `docs/migrations/2026-10-11-order-channel.sql` to the live database (2026-10-11).
- [ ] Restyle inner seller pages (orders, products, customers…) to the new design.
- [x] Build Ads, Video studio, Affiliates and Labels and print (Phase 10).
- [ ] Bring the inbox to the app (needs buyer conversations, today only supplier/logistics messages and contact forms exist).

### Phase 10 - Seller Growth Tools, Record a Sale, App Handoff (web + Expo)

Status: built and verified locally (production build, route smoke incl. write flows, Playwright walkthrough).

- [x] Record a sale: `/home/orders/new` (web) and the app's "Record sale" screen, both `POST /api/app/orders` (`src/lib/orders/record-sale.ts`, rules in `shared/sales.ts`). Catalogue items lower stock; payment cash/transfer/POS/not paid; collected or to deliver; channel incl. "In person". `PATCH /api/app/orders/:id {status:"paid"}` marks unpaid orders paid.
- [x] Native order details in the app (`/order/[id]`): mark paid, remind on WhatsApp, mark sent/delivered, cancel, call or WhatsApp the buyer; booking a rider and labels open the web.
- [x] App → web handoff: the app opens web tools via `/auth/handoff#t=<access token>`, so sellers aren't asked to log in again. Only the access token is shared (the app keeps its refresh token), so the web session lasts up to an hour and each open starts a fresh one.
- [x] Labels and print (`/home/labels`, `/home/labels/print`): 4×6 in or A4 (4 per page) labels with logo, address, pay-on-delivery amount and a tracking QR, plus packing slips.
- [x] Affiliates (`/home/affiliates`, `/api/app/affiliates`): creator links `?aff=<code>`, credited at checkout for 30 days, commission on the item total after discounts, earned on delivery, marked paid by the seller.
- [x] Ads (`/home/ads`, `/api/app/ads`, `/r/ad/<code>`): Peggy writes the ad; the seller runs it on Instagram/Facebook/TikTok/WhatsApp status with the tracking link; we count taps and orders (`?ad=` at checkout), take logged spend for cost per order, and flag no orders by day 2. We don't buy ads on the seller's behalf.
- [x] Video studio (`/home/video`): photos → 9:16 reel rendered in the browser (canvas + MediaRecorder; MP4 where supported, else WebM), Peggy's captions/voiceover in English, Pidgin, Yorùbá or Hausa (`/api/ai/video-script`), OpenAI TTS voiceover (`/api/ai/voiceover`, needs `OPENAI_API_KEY`), save to the product's video.
- [x] Fixed: `PATCH /api/store/products/:id` reset images, specs and FAQs to empty when a client sent only some fields (Zod defaults on a partial schema).
- [x] Applied `docs/migrations/2026-10-11-growth-tools.sql` to the live database (2026-10-11).
- [ ] Have a native speaker check the starter Yorùbá and Hausa reel lines in `shared/video.ts` (used when AI is unavailable).

### Phase 11 - Every Page in the 2026 Look, Menu Hierarchy, Rex and Peggy Fully Wired

Status: built and verified locally (production build, route smoke 247/247, 161 pages swept at 360/768/1440/2560px in Chromium with no overflow or errors, Playwright walkthrough).

- [x] All signed-in pages (seller, supplier, logistics, admin) rebuilt to the prototype with real data, full-bleed, responsive; `.app-scope` remaps older tokens/classes; shared `src/components/app-kit`.
- [x] Menu: prototype items at the top level, other pages in hover flyouts (inline on touch/when inside); "Customise your menu" (`/home/features`, `/supplier/features`, `/logistics/features`) switches features off per person (`User.preferences`).
- [x] Guided walkthrough on the first visit to each portal's home (`GuidedTour`), replayable.
- [x] AI: both providers with fallback (`src/lib/ai/text.ts`), models in `src/lib/ai/client.ts` (env-overridable), daily limits (`AiUsage`), image generation/editing fixed (`src/lib/ai/images.ts`), Peggy tool agent (`src/lib/ai/peggy`), Rex store builder (`src/lib/ai/rex`, `/api/ai/build-store`).
- [x] Applied to the live database (2026-10-11): `2026-10-11-growth-tools.sql`, `2026-10-11-ai-usage.sql`, `2026-10-11-user-preferences.sql`.
- [ ] Test Rex and Peggy against live keys (only typecheck/unit/smoke runs without keys were possible here).
- [ ] Check in Safari and Firefox (only Chromium is available in the build environment).

### Phase 12 - Riders, Delivery Partner API, Checkout Payment Choices, Storefront Themes

Status: built and verified locally (production build, route smoke 252/252, changed portal pages swept at 360/768/1440/2560px, storefront themes and the Riders app checked at 360/1440px in Chromium).

- [x] Riders: accept-and-assign on Today and Jobs, private Riders app links (`/rider/[token]`, SHA-256 hashed), delivery codes, cash-on-delivery pay-ins (`/logistics/cash`). One transition path for portal, riders and API: `src/lib/logistics/job-rules.ts`, `jobs.ts`.
- [x] Delivery partner API v1 (`/api/v1/partner/*`): hashed `sbp_live_` keys, jobs, accept, status, proof, quotes, COD remittances; signed webhooks (`Shopinbos-Signature`), 3 in-request retries; Connect page `/logistics/connect`.
- [x] Checkout honours the seller's payment methods (Paystack, bank transfer, pay on delivery); the shown total matches what is charged.
- [x] Supplier onboarding uploads real documents (`shared/verification-docs.ts`).
- [x] Storefront themes Breeze, Noir (payday countdown), Plain; phone bottom bar (search, wishlist, bag, track an order); new product page.
- [x] Private store settings (payout bank, billing, invites, Peggy settings) are stripped from public responses (`shared/public-brand-settings.ts`); product pages only show published products of active stores.
- [x] Applied to the live database (2026-10-11): `2026-10-12-riders-and-partner-api.sql`.
- [x] Webhook retries beyond the request: every event is queued (`PartnerWebhookDelivery`) and `/api/cron/partner-webhooks` (QStash, every 5 min) retries at 5 min, 30 min, 2 h, 6 h and 24 h, then gives up; Admin › Developers shows waiting/given-up events. `cod.reminder` goes out with the pay-in reminder and when overdue. Run `docs/migrations/2026-11-18-partner-webhook-queue.sql` and `node scripts/qstash-schedules.mjs`.
- [x] Rider pay: partners set each rider's pay (per delivery or a share of the fee) on `/logistics/couriers`; the Riders app (web and phone) shows earnings once set, and each delivered job keeps its pay (`DeliveryBooking.riderPay`). Run `docs/migrations/2026-11-18-rider-pay.sql`.

### Phase 13 - Start Here, Marketing Suite, Unified Inbox, Reviews, Checkout, Analytics, CMS, Rex Chat-First, 22 Templates

Status: built and verified locally (tsc clean, 124 unit tests, production build, route smoke 263/263, 33 new/changed pages checked at 390/1440px in Chromium with no errors or overflow). Live provider sends (Resend, Twilio, Meta, Telegram, Google) not exercised here.

- [x] Start here (/home/start): checklist from real state, inline steps, Peggy setup tools; onboarding cut to 2 steps.
- [x] Marketing: subscribers, segments, forms and pop-ups, campaigns (email/SMS/WhatsApp), email templates, automations (welcome, abandoned cart, browse abandonment, post-purchase, win-back, birthday), discounts (automatic, BXGY, scoped). Scheduler: /api/cron/marketing.
- [x] Commerce: bag page, wishlist page, 4-step checkout with server-quoted prices (priceOrder), abandoned-cart capture + recovery links.
- [x] Unified inbox (/home/messages): email, WhatsApp, SMS, Messenger, Instagram, Telegram, calls, live chat widget, forms; signed webhooks under /api/webhooks/*.
- [x] Reviews: one list across sources, moderation, replies, requests, Google Business Profile, screenshot import, wall, widget, Google Shopping ratings feed.
- [x] Analytics (/home/analytics) on real orders + new StoreMetricDaily tracking; social selling feeds at /api/public/feeds/<store>/<channel>.
- [x] Content collections (/home/cms) with Tiptap rich editor; SEO tab on items, pages, products, collections.
- [x] Rex Studio opens on a tool-calling chat (photos, logos, video scripts, sections, themes, copy, campaigns, automations, CMS).
- [x] Templates: 22 themes with Nigerian names and live previews.
- [x] Applied to the live database (2026-10-12): analytics-social, commerce, inbox, reviews, marketing (tables + enum), cms.
- [ ] After merge: schedule the `run-marketing` pg_cron job (last statement of docs/migrations/2026-10-12-marketing.sql).
- [ ] Set provider env vars per channel (see .env.local.example) and INBOX_ENCRYPTION_KEY / INTEGRATIONS_ENCRYPTION_KEY.

### Gap fixes (2026-10-21)

- [x] Applied to the live database (2026-10-21): `2026-11-18-rider-pay.sql`, `2026-11-18-partner-webhook-queue.sql`.
- [ ] After deploy: `node scripts/qstash-schedules.mjs` (adds the partner-webhooks job).
- [x] Checkout: pay on delivery with a delivery partner also needs the seller's own pay-on-delivery switch and cap; onboarding no longer wipes Korapay; the builder preview shows the seller's real methods.
- [x] Segments: the legacy `/api/store/segments` API goes through the same rules as the app; the customer list filters by segment (`/home/customers?segment=<id>`, "See people" on each segment); segment counts refresh when segments are listed.
- [x] Store editor: the unreachable old editor (Design/Layout tabs said "coming soon") is removed; `/home/editor` links go to the builder, whose theme panel edits colours, type and buttons.
- [x] Builder Theme settings for the 2026 themes: font pairing (Typography), button shape (Buttons), and a store-wide Layout view (page width and product photo shape; classic templates pick the store layout). Saved as optional theme tokens, so stores that pick nothing look as before.
- [x] Rex sets the same choices: `set_theme_style` tool in the chat, and `fontPair`/`buttonShape`/`pageWidth`/`productRatio` tokens plus a `layout` field in its edit plans (choices the current theme doesn't read are skipped).
- [ ] Not tested yet: Rex and Peggy with live AI keys, Safari and Firefox, and a native speaker's check of the Yorùbá and Hausa text (including the new rider-pay and segment strings).

## Current Todos

- [x] Finish the onboarding visual QA pass against the supplied mockup screens.
- [x] Apply the private onboarding JSON fields to Supabase.
- [x] Build the supplier product submit/edit workflow.
- [x] Build the next supplier inner workflows: quote response and order fulfilment.
- [x] Build the next logistics inner workflows: quote response, booking status updates, coverage and pricing edits.
- [x] Add empty, loading, and error states across seller, supplier, and logistics portals.
- [x] Add the marketing website API handoff guide and examples.
- [x] Add broader tests for authenticated marketplace CTA completion.
- [x] Add stock decrement and validation at checkout.
- [x] Integrate ShippingZone rates into checkout, falling back to flat rate.
- [x] Add domain purchase UI for Vercel configuration errors.
- [x] Expand admin marketplace view with search.
- [x] Keep this file updated after each build phase.

## Public Marketplace API

The WordPress-facing API lives under `/api/v1/public`. The legacy `/api/public` namespace remains available as a compatibility alias while clients migrate.

Public API endpoints are unauthenticated and read-only. They must only expose approved marketplace data:

- Published supplier products from verified active suppliers.
- Verified active suppliers.
- Verified active logistics partners.
- Marketplace categories and category product counts based only on public products.

Public API endpoints must never expose:

- Private user data.
- Order data.
- Quote data.
- Admin notes.
- Contact details.
- Bank details.
- KYC or verification documents.
- Draft, pending, rejected, unpublished, suspended, or inactive records.

## Public Endpoints

Products:

- `GET /api/v1/public/products`
- `GET /api/v1/public/products/search`
- `GET /api/v1/public/products/trending`
- `GET /api/v1/public/products/category/:categorySlug`
- `GET /api/v1/public/products/:slug`

Legacy aliases:

- `GET /api/public/products`
- `GET /api/public/products/search`
- `GET /api/public/products/trending`
- `GET /api/public/products/category/:categorySlug`
- `GET /api/public/products/:slug`

Suppliers:

- `GET /api/v1/public/suppliers`
- `GET /api/v1/public/suppliers/search`
- `GET /api/v1/public/suppliers/:slug`

Legacy aliases:

- `GET /api/public/suppliers`
- `GET /api/public/suppliers/search`
- `GET /api/public/suppliers/:slug`

Logistics:

- `GET /api/v1/public/logistics/partners`
- `GET /api/v1/public/logistics/partners/search`
- `GET /api/v1/public/logistics/partners/:slug`

Legacy aliases:

- `GET /api/public/logistics/partners`
- `GET /api/public/logistics/partners/search`
- `GET /api/public/logistics/partners/:slug`

Categories and health:

- `GET /api/v1/public/categories`
- `GET /api/v1/public/categories/:slug`
- `GET /api/v1/public/health`

Legacy aliases:

- `GET /api/public/categories`
- `GET /api/public/categories/:slug`
- `GET /api/public/health`

API docs:

- Source spec: `docs/openapi.yaml`
- Served spec: `GET /api/docs`

## CORS

WordPress-facing public APIs allow only `GET` and `OPTIONS`.

Allowed origins:

- `https://shopinbos.com`
- `https://www.shopinbos.com`
- `http://localhost:3000`
- `http://localhost:8080`

Unknown origins must not receive an `Access-Control-Allow-Origin` response header.

## Cache Headers

List, trending, search, and category-list responses:

```http
Cache-Control: public, max-age=300, stale-while-revalidate=600
```

Detail responses:

```http
Cache-Control: public, max-age=600, stale-while-revalidate=1200
```

Health and docs responses use `no-store`.

Public marketplace mutations or moderation changes must invalidate public marketplace caches. Until a dedicated cache tag strategy is added, write paths that publish, unpublish, approve, reject, suspend, feature, or update public marketplace records must include a TODO or direct revalidation call.

## Pagination Shape

List responses must use this shape:

```json
{
  "data": [],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 0,
    "totalPages": 0,
    "hasNextPage": false,
    "hasPreviousPage": false
  }
}
```

## Slugs

Published slugs should be treated as stable public identifiers. Slug alias support is not currently modeled in Prisma. If a published slug must change, add a small `SlugAlias` schema extension before the change or defer the change until redirect support exists.

## Authenticated CTA Continuation

WordPress may link users into app signup/login with intent parameters. The app must preserve these parameters through authentication and continue the requested action after auth.

Supported intents:

- Product: `add`, `sell`, `dropship`, `bulk_order`, `request_quote`
- Supplier: `view_products`, `request_supplier_quote`
- Logistics: `book_delivery`, `connect_logistics`

Authenticated completion endpoints:

- `POST /api/app/store-products/add-from-supplier`
- `POST /api/app/dropship/start`
- `POST /api/app/wholesale/request`
- `POST /api/app/supplier-quotes/request`
- `POST /api/app/logistics/quotes/request`
- `POST /api/app/logistics/bookings`
- `POST /api/app/logistics/preferred-partner`

## Approval Rules

Supplier product publishing flow:

```text
draft -> pending_review -> published
```

Only admins may approve, reject, unpublish, feature, trend, suspend, or moderate marketplace records.

Public visibility rules:

- Products require `status = published`.
- Product suppliers require `status = active` and `verificationStatus = verified`.
- Suppliers require `status = active` and `verificationStatus = verified`.
- Logistics partners require `status = active` and `verificationStatus = verified`.

## Route Ownership

Supplier app:

- `/supplier/dashboard`
- `/supplier/onboarding`
- `/supplier/products`
- `/supplier/products/new`
- `/supplier/products/:id/edit`
- `/supplier/orders`
- `/supplier/quote-requests`
- `/supplier/profile`
- `/supplier/analytics`

Logistics app:

- `/logistics/dashboard`
- `/logistics/onboarding`
- `/logistics/profile`
- `/logistics/coverage`
- `/logistics/pricing`
- `/logistics/bookings`
- `/logistics/quotes`
- `/logistics/analytics`

Admin app:

- `/admin/dashboard`
- `/admin/suppliers`
- `/admin/supplier-products`
- `/admin/logistics-partners`
- `/admin/categories`
- `/admin/marketplace`
- `/admin/settings`

Role navigation must point to these namespaces. Supplier, logistics, and admin users must not be routed into seller-only pages.

## Verification Checklist

- `npx tsc --noEmit`
- Public API visibility tests for products, suppliers, logistics partners, private-field absence, filters, sorting, pagination, detail slugs, CORS, and health.
- Auth flow tests for WordPress intent preservation and CTA completion.
- Role tests for supplier, logistics, and admin route guards and sidebar links.
