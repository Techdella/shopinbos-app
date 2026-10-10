# Shopinbos: full build spec for Claude Code

**Read this whole file before writing code.** It is the single source of truth for building Shopinbos from an empty repo, on a new Supabase project, a new Vercel project and new Expo/EAS accounts.

- Owner: Techdella (hello@techdella.com)
- Spec date: 10 October 2026
- Design reference: the "Shopinbos App Prototype" canvas (Full app, Logistics app, Store templates, Journeys pages). Ask the owner for exports of the prototype HTML if you need pixel detail; this spec describes every screen in words.
- Older code: `Techdella/shopinbos-app` (Next.js 16, Prisma, 53 models). Treat it as reference only. **Do not migrate its data or copy its schema wholesale.** Reuse ideas, not code, unless a section below says so.

---

## 0. How to work through this spec

1. Work **phase by phase** (section 17). Do not start a phase until the previous phase's acceptance checks pass.
2. After each phase: run typecheck, lint, unit tests and the phase's end-to-end test, then commit with a clear message and open a PR. Never merge without the owner.
3. When a business number is unknown it is written as `[PLACEHOLDER]`. Put it in config (`packages/config/business.ts`), never inline it.
4. Money is **always integer kobo** (₦1 = 100 kobo). Never floats. Format only at the edge.
5. Keep secrets out of git. `.env.local` is never committed. Every new env var goes into `.env.example` with a comment.
6. When this spec and the prototype disagree, this spec wins. When this spec is silent, copy the prototype's behaviour.
7. Ask before: deleting data, changing money rules, adding a paid third-party service not listed here, or changing auth.

---

## 1. Product in one page

**Shopinbos** is a mobile-first commerce operating system for Nigerian sellers. It combines a store builder (Shopify, Selar, Bumpa, Catlog), sourcing and dropshipping (Alibaba, 1688, Spocket-style), selling everywhere (WhatsApp, Instagram, Facebook, TikTok Shop, Jumia, Konga, later Amazon), delivery and cash on delivery, and marketing. Two built-in AI agents run it:

- **Rex** builds: stores, pages, logos, branding, product listings, imports.
- **Peggy** runs the shop: answers customer chats in the seller's voice, drafts replies, plans posts and ads, spots restocks, writes broadcasts, gives daily briefs.

### Apps and who uses them

| App | Platform | Users | Notes |
|---|---|---|---|
| Seller app | Native iOS and Android (Expo) | Sellers and their staff | Everything except the advanced builder |
| Seller web app | Web (Next.js) | Sellers and staff | Everything, plus Rex Studio and the advanced builder (web only) |
| Storefront | Web, per-store subdomain and custom domain | Shoppers | Guest checkout, pay on delivery, WhatsApp ordering |
| Shopinbos Riders | Native (Expo) | Independent riders and partner riders | Jobs, pickup, proof of delivery, cash collection |
| Shopinbos Partners | Web console and native (Expo) | Delivery companies (owners and dispatchers) | Jobs, dispatch, riders, cash pay-in, earnings, API |
| Supplier portal | Web | Local suppliers and wholesalers | Catalog, dropship orders, quotes, wholesale |
| Admin | Web | Shopinbos staff | Users, KYC, disputes, payouts, partner keys, fees |
| Public API | HTTPS | Marketing site, delivery partners | Marketing site is built separately (by Codex) |

Shoppers have **no separate app** for now. Stores can be saved to the home screen.

### Decisions already made (do not reopen)

| Topic | Decision |
|---|---|
| Seller sign-up | Phone number with a WhatsApp code (SMS fallback), or email with an email code. No passwords. |
| Going live | Sellers can go live before adding a payout bank. Money waits in their balance. |
| Onboarding | Six steps with Rex: describe the shop; name, colours and template; first products; payments and delivery; go live and share. The rest becomes a Home checklist. |
| Pay on delivery | On by default, with limits: up to ₦50,000, verified phone numbers, only where riders cover. Riders confirm with the buyer's 4-digit delivery code. |
| Delivery | Own Shopinbos Riders app plus a partner API for existing dispatch companies. |
| Shopper checkout | Guest by default; optional accounts with phone sign-in. |
| Mobile | Full native apps (Expo), not a PWA. |
| Advanced builder | Web only. Mobile shows a card and an "email me the link" button. |
| Dropship money | Shopper pays Shopinbos; supplier is paid cost only after delivery plus a 48-hour return window; seller gets the margin. |

---

## 2. Hosting and accounts to set up (owner does these, Claude Code verifies)

> **Note:** an earlier plan moved hosting to Cloudflare. The owner has since set up a new Vercel account, so **Vercel is the default host**. Keep domains behind a `DomainProvider` interface (section 11.4) so Cloudflare for SaaS can replace Vercel Domains later without touching app code.

### 2.1 Accounts

| Service | What for | Setup |
|---|---|---|
| GitHub | New monorepo `Techdella/shopinbos` | Branch protection on `main`, PRs required |
| Supabase | Postgres, Auth, Storage, Realtime, Edge Functions, Vault | Region closest to Lagos users that Supabase offers (check at setup; likely EU West or South Africa if available) |
| Vercel | Web app hosting, preview deployments, cron, domains | Pro plan (wildcard domains and team seats) |
| Expo / EAS | Build and ship 3 native apps, OTA updates, push | One organisation, three projects |
| Apple Developer | iOS apps and push (APNs) | Organisation account |
| Google Play Console + Firebase | Android apps and push (FCM) | One Firebase project for FCM |
| Paystack | Payments, transfers (payouts), virtual accounts | Business account, test and live keys |
| Meta for Developers | WhatsApp Cloud API, Instagram and Facebook Graph, Catalog, Marketing API | Business verification required |
| Anthropic | Claude API for Rex and Peggy | Org key; set spend limits |
| Resend | Transactional email | Verify `shopinbos.com` |
| Termii or Sendchamp | SMS and WhatsApp OTP fallback in Nigeria | Sender ID approval takes days, start early |
| Upstash | Redis (rate limits, caches) and QStash (background jobs) | Or Supabase queues if preferred |
| Sentry | Errors for web and mobile | |
| PostHog | Product analytics, feature flags | EU cloud |
| Google Cloud | Maps, Places, Geocoding | Restrict keys by referrer and app |
| Dojah or Youverify | KYC: BVN, NIN, CAC checks for sellers, suppliers, riders | Choose one; adapter interface |

### 2.2 Domains

- `shopinbos.com` stays with the marketing site (separate project).
- `app.shopinbos.com`: seller web app, portals and admin (one Next.js app, role-based routes).
- `api.shopinbos.com`: public and partner API (same Next.js app, `/api/*`, or a rewrite).
- `*.shopinbos.com` wildcard for stores: `adaeze.shopinbos.com`. Requires the domain's nameservers on Vercel, or a wildcard CNAME the host supports. Reserve system subdomains (`app`, `api`, `www`, `admin`, `partners`, `suppliers`, `riders`, `help`, `status`, `mail`, `cdn`).
- Sellers' own domains: connect `www.theirdomain.com` (CNAME) plus a redirect for the bare domain (section 11.4).

### 2.3 Environment variables (`.env.example`)

```bash
# --- Core ---
NEXT_PUBLIC_APP_URL=https://app.shopinbos.com
NEXT_PUBLIC_STORE_ROOT_DOMAIN=shopinbos.com
NODE_ENV=development

# --- Supabase ---
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=          # server only
DATABASE_URL=                       # pooled (transaction mode) for the app
DIRECT_URL=                         # direct, for migrations
SUPABASE_AUTH_HOOK_SECRET=          # Send SMS hook signature secret

# --- AI ---
ANTHROPIC_API_KEY=
AI_MODEL_SMART=                     # set to the current top Claude model id at setup
AI_MODEL_FAST=                      # set to the current fast Claude model id
OPENAI_API_KEY=                     # optional: embeddings or image fallback
IMAGE_GEN_API_KEY=                  # logo and image generation provider
VIDEO_GEN_API_KEY=                  # product video provider
BG_REMOVAL_API_KEY=                 # product photo background removal

# --- Payments ---
PAYSTACK_SECRET_KEY=
NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY=
PAYSTACK_WEBHOOK_SECRET=            # Paystack signs with the secret key; keep separate var for clarity

# --- Messaging ---
META_APP_ID=
META_APP_SECRET=
META_SYSTEM_USER_TOKEN=
WHATSAPP_VERIFY_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=           # platform number (OTP + platform messages)
TERMII_API_KEY=                     # or SENDCHAMP_API_KEY
RESEND_API_KEY=
EMAIL_FROM="Shopinbos <hello@shopinbos.com>"

# --- Commerce channels ---
TIKTOK_SHOP_APP_KEY=
TIKTOK_SHOP_APP_SECRET=
GOOGLE_MERCHANT_SERVICE_ACCOUNT_JSON=

# --- Delivery ---
SHIPBUBBLE_API_KEY=
GIG_API_USERNAME=
GIG_API_PASSWORD=
KWIK_API_KEY=
NIPOST_POSTCODE_API_KEY=
GOOGLE_MAPS_API_KEY=                # server
NEXT_PUBLIC_GOOGLE_MAPS_KEY=        # browser, referrer-restricted

# --- Domains ---
DOMAIN_PROVIDER=vercel              # vercel | cloudflare
VERCEL_API_TOKEN=
VERCEL_PROJECT_ID=
VERCEL_TEAM_ID=
CLOUDFLARE_API_TOKEN=               # only if DOMAIN_PROVIDER=cloudflare
CLOUDFLARE_ZONE_ID=

# --- KYC ---
KYC_PROVIDER=dojah                  # dojah | youverify
DOJAH_APP_ID=
DOJAH_SECRET_KEY=

# --- Jobs, cache, analytics, errors ---
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
QSTASH_TOKEN=
QSTASH_CURRENT_SIGNING_KEY=
QSTASH_NEXT_SIGNING_KEY=
SENTRY_DSN=
NEXT_PUBLIC_POSTHOG_KEY=
NEXT_PUBLIC_POSTHOG_HOST=https://eu.i.posthog.com

# --- Security ---
ENCRYPTION_KEY=                     # 32-byte base64, for app-level encryption of partner secrets
CRON_SECRET=

# --- Mobile (EAS secrets, not in web env) ---
EXPO_PUBLIC_API_URL=https://app.shopinbos.com
EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_SUPABASE_ANON_KEY=
```

---

## 3. Tech stack

Use the **latest stable** version of each at setup time; pin exact versions in lockfiles.

| Layer | Choice |
|---|---|
| Monorepo | pnpm workspaces + Turborepo |
| Web | Next.js (App Router, the version the old repo used is 16), React, TypeScript strict |
| Styling (web) | Tailwind CSS v4 with CSS variables from `packages/tokens` |
| Mobile | Expo (managed), Expo Router, React Native, TypeScript |
| Styling (mobile) | NativeWind or a small `StyleSheet` theme from `packages/tokens` (pick one, be consistent) |
| Database | Supabase Postgres + Prisma ORM (migrations with `prisma migrate`, not `db push`, after phase 1) |
| Auth | Supabase Auth (phone OTP via WhatsApp/SMS hook, email OTP) |
| Storage | Supabase Storage (buckets in section 6.12) + image transforms |
| Realtime | Supabase Realtime for chats, order and job status |
| Validation | Zod, shared in `packages/validation` |
| Server state (web and mobile) | TanStack Query |
| Forms | React Hook Form + Zod resolver |
| Background jobs | QStash (HTTP jobs to `/api/jobs/*`) + Vercel Cron for schedules |
| AI | Anthropic Messages API with tool use (Claude), streaming |
| Payments | Paystack (transactions, transfers, transfer recipients, dedicated virtual accounts, refunds) |
| Email | Resend + React Email |
| Tests | Vitest (unit), Playwright (web e2e), Maestro (mobile e2e) |
| CI | GitHub Actions: typecheck, lint, test, Prisma migrate check, Playwright on preview |

---

## 4. Repository layout

```
shopinbos/
├─ apps/
│  ├─ web/                 # Next.js: seller web, storefront, supplier, partners, admin, API
│  ├─ seller/              # Expo: Shopinbos seller app
│  ├─ riders/              # Expo: Shopinbos Riders
│  └─ partners/            # Expo: Shopinbos Partners (delivery companies)
├─ packages/
│  ├─ db/                  # Prisma schema, client, seed, SQL for RLS and functions
│  ├─ validation/          # Zod schemas shared by web, mobile, API
│  ├─ api-client/          # Typed fetch client + TanStack Query hooks used by all apps
│  ├─ tokens/              # Design tokens (colours, type, radius, spacing) for web + native
│  ├─ ui-web/              # Web components (Button, Card, Chip, Toggle, Sheet, Table…)
│  ├─ ui-native/           # Native components mirroring ui-web names
│  ├─ money/               # kobo helpers, fee and split calculators (pure, 100% tested)
│  ├─ ai/                  # Rex + Peggy: prompts, tool definitions, runners, evals
│  ├─ themes/              # Storefront theme schemas, section registry, default themes
│  ├─ integrations/        # paystack, whatsapp, meta, tiktok, delivery adapters, kyc, domains
│  ├─ emails/              # React Email templates
│  └─ config/              # business.ts (fees, limits, placeholders), feature flags, eslint, tsconfig
├─ docs/
│  ├─ SPEC.md              # this file
│  ├─ decisions/           # short ADRs when you make a call
│  └─ prototype/           # exported prototype HTML (reference only)
├─ CLAUDE.md
├─ turbo.json
└─ package.json
```

**Rule:** apps never talk to third-party APIs directly; they call `packages/integrations` through server code. Mobile apps never hold service keys; they call `apps/web` API routes.

---

## 5. Design system

The prototype's "soft commerce" look replaces the old ink/teal scale. Put these in `packages/tokens` and generate CSS variables (web) and a TS theme object (native).

### 5.1 Colours

| Token | Hex | Use |
|---|---|---|
| `ink` | `#16141F` | Primary text, primary buttons, active chips, dark cards |
| `sub` | `#6B6779` | Secondary text |
| `line` | `#ECEAF2` | Borders, dividers |
| `canvas` | `#F6F5F9` | App background |
| `paper` | `#FFFFFF` | Cards |
| `accent` | `#FF6A2B` | Main call to action (Add product, Launch, Publish), today's bar in charts |
| `accent-soft` | `#FFEDE4` | Low stock, warnings that need action |
| `accent-text` | `#B23E0A` | Accent text on light backgrounds |
| `ai` | `#0C4A44` | Rex and Peggy surfaces, AI actions |
| `ai-soft` | `#E2F6F1` | Rex and Peggy cards |
| `ai-mid` | `#8BE3D3` | Peggy draft borders, success on dark |
| `ok` / `ok-soft` | `#16794A` / `#E2F5EA` | Paid, delivered, connected |
| `warn` / `warn-soft` | `#8A5A08` / `#FDF0D5` | Pending, held, due |
| `info` / `info-soft` | `#1F5FBF` / `#E3EEFD` | Rider on a job, builder selection (`#3B6EF5`) |

Background wash for hero areas: three radial gradients of `#FFE2D2`, `#E7E1FF`, `#DDF4EE` (see prototype home header).

### 5.2 Type

- UI: **Plus Jakarta Sans** (400–800).
- Storefront display fonts (theme-dependent): Fraunces, DM Serif Display, Bricolage Grotesque, Space Grotesk.
- Load with `next/font` on web and `expo-font` on native. Never reference hashed family names directly.

### 5.3 Shape and components

- Cards: radius 24 (mobile), 22 (web), white, 1px `line` border on web only.
- Buttons: pill (radius 999). Primary = ink; accent = orange; ghost = white with `line` border. Min height 52 mobile, 44 web.
- Chips: pill, 38px mobile / 36px web, selected = ink background.
- Toggles: 50×30 mobile, 46×28 web.
- Mobile nav: floating white pill tab bar (Home, Orders, Chats, Products, More) plus an orange round **Create** button that opens a bottom sheet.
- Web nav: 244px white sidebar with groups (see section 9.2), top bar with search, Ask Peggy, notifications, avatar.
- Touch targets ≥ 44px. Text contrast ≥ 4.5:1. Every icon-only button has an accessible label.
- Copy: plain words, sentence case, short. Naira as `₦18,500`. No "Chip" anywhere (retired name).

### 5.4 Mascots

`rex.png`, `rex-side.png` (mint dinosaur) and `peggy.png`, `peggy-wave.png` (penguin) from the old repo's `public/brand/mascots/`. Copy them to `packages/tokens/assets`.

---

## 6. Data model

Write this as Prisma models in `packages/db/schema.prisma`. Use `cuid2` string ids (or UUID), `createdAt`/`updatedAt` on every table, soft delete (`deletedAt`) on user-facing records. All money fields are `Int` kobo with a `currency` column defaulting to `NGN`. Index every foreign key and every column used in a list filter.

Below, `→` means a relation. Only key fields are listed; add sensible extras.

### 6.1 Identity and access

- **User**: `supabaseId` (unique), `phone` (E.164, unique nullable), `email` (unique nullable), `name`, `avatarUrl`, `locale` (`en`, `pcm`, `yo`, `ha`, `ig`), `lastSeenAt`.
- **Organization**: one per business. `type` = `SELLER | SUPPLIER | LOGISTICS | SOURCING_PARTNER | PLATFORM`. `name`, `kycStatus`, `kycLevel`, `cacNumber`, `country`, `state`, `city`.
- **Membership**: User ↔ Organization with `role` (`OWNER | ADMIN | STAFF | DISPATCHER | RIDER | VIEWER`) and `permissions` (JSON list such as `orders.write`, `money.read`). Staff "Orders and delivery only" is a permission preset.
- **Device**: push tokens per user per app (`app` = `SELLER | RIDERS | PARTNERS`), platform, Expo token.
- **KycCheck**: org or user, `kind` (`BVN | NIN | CAC | ADDRESS | SELFIE`), provider, status, reference, redacted result JSON.
- **AuditLog**: actor, org, action, entity, entityId, before/after JSON (redacted), ip, userAgent.

### 6.2 Stores, brand, domains

- **Store** → Organization (1:1 for v1, allow many later): `slug` (unique, reserved list), `name`, `tagline`, `status` (`DRAFT | LIVE | PAUSED`), `category`, `currency`, `timezone` (`Africa/Lagos`), `themeId`, `publishedThemeVersionId`, `settings` JSON (checkout, policies), `codEnabled`, `codMaxKobo` (default 5,000,000), `whatsappNumber`.
- **BrandKit** → Store (1:1): `logoAssetId` (main), `logoDarkAssetId`, `iconAssetId`, `palette` JSON `{bg, ink, accent, soft}`, `headingFont`, `bodyFont`, `voice` (text: "Warm and short. A little Pidgin…"), `logoStyle` (`editorial | monogram | bold | serif | uploaded`), `source` (`REX | UPLOAD`). **Single source** for store theme colours, labels, receipts, invoices, emails, social posts, ads, WhatsApp catalog cover.
- **Asset**: any uploaded or generated file. `bucket`, `path`, `mime`, `width`, `height`, `bytes`, `kind` (`PRODUCT_PHOTO | LOGO | VIDEO | LABEL_PDF | QC_PHOTO | PROOF_PHOTO | DOC`), `generatedBy` (`USER | REX | PEGGY | SYSTEM`), `bgRemoved` bool.
- **Domain** → Store: `hostname` (unique), `type` (`SUBDOMAIN | CUSTOM | PURCHASED`), `status` (`PENDING_DNS | VERIFYING | ACTIVE | FAILED`), `provider` (`VERCEL | CLOUDFLARE`), `providerRef`, `verification` JSON (records to show), `isPrimary`, `sslStatus`, `lastCheckedAt`. Registered domains also get `expiresAt`, `autoRenew`.

### 6.3 Themes and builder

- **Theme** (platform-owned catalogue): `key` (`adire | breeze | noir | plain | pantry | ile | plug | stride`), `name`, `category`, `description`, `previewAssetIds`, `schema` JSON (allowed sections, settings, defaults), `isActive`.
- **StoreTheme** → Store, Theme: the store's working copy. `settings` JSON (colour schemes, button radius, cart type…).
- **ThemePage** → StoreTheme: `template` (`HOME | PRODUCT | COLLECTION | CART | PAGE | CHECKOUT | SEARCH`), `handle` (for custom pages, e.g. `about`), `sections` JSON (ordered array, see 11.2), `groups` JSON (header group, overlay group, footer group).
- **ThemeVersion** → StoreTheme: immutable snapshot of all pages + settings. `label` ("Set up a payday sale"), `createdBy` (`USER | REX`), `rexRunId`. Publishing points `Store.publishedThemeVersionId` at a version. Undo/restore = create a new version from an older snapshot.
- **ContentPage** → Store: About, Delivery and returns, Questions (FAQ). `title`, `handle`, `body` (rich JSON), `generatedBy`.
- **NavigationMenu** → Store: `handle` (`main`, `footer`), `items` JSON.

### 6.4 Catalogue

- **Product** → Store: `title`, `handle`, `description` (rich JSON), `status` (`DRAFT | LIVE | ARCHIVED`), `source` (`OWN | DROPSHIP | IMPORT`), `supplierProductId` (if dropship), `costKobo`, `compareAtKobo`, `seo` JSON, `channels` JSON flags (`store, whatsapp, instagram, facebook, tiktok, google, jumia, konga`), `tags`, `weightGrams`, `createdBy` (`USER | REX`).
- **ProductOption** (Size, Colour…) and **ProductVariant** (`sku`, `barcode`, `priceKobo`, `costKobo`, `optionValues` JSON, `stockOnHand`, `stockReserved`, `lowStockAt`).
- **ProductMedia** → Product, Asset, `position`, `alt`.
- **Collection** (manual or automatic rules) and **CollectionProduct**.
- **StockMovement**: variant, `delta`, `reason` (`SALE | RETURN | RESTOCK | ADJUSTMENT | DAMAGED | IMPORT_ARRIVAL | WHOLESALE_ARRIVAL`), ref, note. Stock on hand is updated **only** through a SQL function that inserts a movement in the same transaction.
- **ImportJob**: source (`INSTAGRAM | CSV | SHOPIFY | WOOCOMMERCE | BUMPA | CATLOG | SUPPLIER | URL_1688`), status, `rows` JSON with per-row issues (`NO_PRICE`, `DUPLICATE`…), `fixedByRex`.
- **Review** → Product: rating, body, author name, `source` (`STORE | WHATSAPP | IMPORTED`), `approved`.
- **WishlistItem**: shopper (phone or customer id) ↔ variant; used for "31 people wishlisted this, message them on restock".

### 6.5 Customers and conversations

- **Customer** → Store: `name`, `phone` (E.164), `email`, `area`, `addresses` JSON, `tags`, `segmentKeys`, `notes`, `consentWhatsapp` (bool + timestamp + source), `consentEmail`, `stats` cached (`ordersCount`, `spentKobo`, `lastOrderAt`), `peggyFacts` JSON (size, pays by, likes neutrals, replies in evening).
- **Segment** → Store: `key` (`all | repeat | vip | quiet | wish` + custom), `rules` JSON, `cachedCount`.
- **Conversation** → Store, Customer: `channel` (`WHATSAPP | INSTAGRAM | FACEBOOK | TIKTOK | STORE_CHAT | SMS`), `externalThreadId`, `status` (`OPEN | WAITING | CLOSED`), `assignee` (user or `PEGGY`), `autoReply` bool, `lastMessageAt`, `unreadCount`.
- **Message** → Conversation: `direction` (`IN | OUT`), `author` (`CUSTOMER | SELLER | PEGGY | SYSTEM`), `body`, `attachments`, `externalId`, `status` (`QUEUED | SENT | DELIVERED | READ | FAILED`), `draft` bool, `approvedBy`, `paymentLinkId`.
- **Broadcast** → Store: segment, `channel`, `templateName` (WhatsApp template), `body`, `mediaAssetId`, `status`, `scheduledAt`, `costEstimateKobo`, counts (sent, delivered, read, replied, orders).

### 6.6 Orders, checkout and payments

- **Cart** (storefront session): store, shopper key, items JSON, `discountCode`, `deliveryQuote` JSON, expires.
- **Order** → Store, Customer: `number` (`SB-1047`, per-store sequence), `channel` (`STORE | WHATSAPP | INSTAGRAM | FACEBOOK | TIKTOK | MANUAL | MARKETPLACE`), `status` (`PENDING_PAYMENT | PAID | PROCESSING | READY | SHIPPED | DELIVERED | COMPLETED | CANCELLED | RETURNED`), `paymentStatus` (`UNPAID | PENDING_TRANSFER | PAID | COD_PENDING | COD_COLLECTED | REFUNDED | PARTIAL_REFUND`), `paymentMethod` (`CARD | TRANSFER | USSD | COD | CASH | INVOICE`), `subtotalKobo`, `discountKobo`, `deliveryKobo`, `totalKobo`, `deliveryAddress` JSON, `deliveryCode` (4 digits, hashed), `notes`, `source` (`SHOPPER | SELLER_RECORDED`), `returnWindowEndsAt`.
- **OrderItem**: variant, qty, `priceKobo`, `costKobo` snapshot, `fulfilmentId`, `isDropship`, `supplierOrgId`.
- **Fulfilment**: one per shipper. `kind` (`SELF | DROPSHIP`), `supplierOrgId`, `status` (see 7.2), `acceptDeadline`, `rerouteCount`, `packedWithSellerLabel` bool, `deliveryJobId`.
- **Payment**: order, Paystack `reference`, `channel`, `amountKobo`, `feeKobo` (from Paystack), `status`, `rawEvent` JSON (redacted).
- **PaymentLink**: for chat and invoices: order or ad-hoc amount, `shortCode`, `expiresAt`.
- **Invoice**: seller-sent invoice with items and pay link; reminders.
- **Refund**: order, amount, reason, status, Paystack refund ref.
- **Return**: order item, reason (`FAULTY | WRONG_ITEM | CHANGED_MIND | NOT_DELIVERED`), who pays (`SUPPLIER | SELLER | PLATFORM`), status.
- **Dispute**: raised by shopper, seller, supplier or partner; admin-resolved; freezes related ledger holds.

### 6.7 Money (double-entry ledger)

Never store balances as editable numbers. Balances are **sums of ledger entries**.

- **LedgerAccount**: `ownerType` (`ORG | PLATFORM | PAYSTACK_CLEARING | COD_RIDER | COD_PARTNER`), `ownerId`, `kind` (`AVAILABLE | HELD | PENDING | FEES | CASH_DUE`).
- **LedgerTransaction**: `kind` (`ORDER_PAYMENT | DROPSHIP_SPLIT | PAYOUT | REFUND | FEE | AD_SPEND | COD_COLLECTION | COD_REMITTANCE | AFFILIATE_COMMISSION | DELIVERY_FEE | WHOLESALE_PAYMENT | IMPORT_PAYMENT | DOMAIN_PURCHASE | SUBSCRIPTION | ADJUSTMENT`), `ref`, `memo`.
- **LedgerEntry**: transaction, account, `amountKobo` (signed), `availableAt` (for holds). Sum of entries in one transaction must be **zero** (enforce with a deferred constraint trigger).
- **PayoutAccount**: org, bank code, account number (encrypted), account name (resolved), Paystack recipient code, `verified`.
- **Payout**: org, amount, status, Paystack transfer code, `scheduledFor` (Fridays by default), `kind` (`AUTO | MANUAL`).
- **FeeConfig** (platform): key-value fees in basis points or kobo (see 7.6). Versioned with `effectiveFrom`.

### 6.8 Suppliers, sourcing, dropship, wholesale, imports

- **SupplierProfile** → Organization (type SUPPLIER): `location`, `shipsWithinHours`, `rating`, `onTimeRate`, `verified`, `categories`, `whiteLabelPacking` bool.
- **SupplierProduct** → Supplier: title, media, `category`, `costKobo` (dropship price to sellers), `suggestedPriceKobo`, `stock`, `wholesaleTiers` JSON `[{minQty, unitKobo}]`, `dropshipEnabled`, `wholesaleEnabled`, `weightGrams`, status.
- **DropshipLink**: seller store ↔ supplier product ↔ seller's Product. `sellerPriceKobo`, `active`. Supplier stock changes push to seller products (hide when 0).
- **QuoteRequest**: seller → supplier, product, qty, message, status (`SENT | REPLIED | ACCEPTED | DECLINED | EXPIRED`), offer JSON (`qty`, `unitKobo`, `delivery`, `readyBy`), thread messages.
- **WholesaleOrder**: from accepted quote. Paid from seller balance into escrow; released when seller confirms arrival. On arrival, stock movements `WHOLESALE_ARRIVAL`.
- **SourcingPartner** (org type SOURCING_PARTNER): China agent in Guangzhou. Fees in FeeConfig.
- **ImportRequest**: seller, `sourceUrl` (1688) or photo, translated title (by Rex), `yuanPrice`, `moq`, `weightKg`, `cbm`, `shipMode` (`AIR | SEA`), quote breakdown JSON (goods, China delivery, partner fee, freight and customs), `fxRate` (locked 24 h), `totalKobo`, status.
- **ImportOrder**: from paid request. `stage` (`QUOTE_PAID | BOUGHT | QC_DONE | SHIPPING | CUSTOMS | IN_STOCK`), stage timestamps, `qcPhotoAssetIds`, `eta`, tracking. On `IN_STOCK`, Rex creates or updates a Product and stock.

### 6.9 Delivery

- **DeliveryPartner**: an org of type LOGISTICS, or an external adapter (`SHIPBUBBLE | GIG | KWIK | KONGA | DREACOT | TRAVO`). `adapterKey`, `mode` (`NATIVE` = uses Shopinbos Partners/Riders, `API` = their own system), `status` (`SANDBOX | LIVE | SUSPENDED`), `tier` (`STANDARD | GOLD`), credentials (encrypted, admin-managed).
- **CoverageZone**: partner, `name`, polygon or list of LGAs/postcodes, `service` (`BIKE | VAN | INTERSTATE`), `priceKobo`, `etaText`, hours.
- **SellerDeliverySettings**: store pickup address (with NIPOST postcode), enabled partners, zone prices shown to shoppers, COD rules.
- **DeliveryJob**: order fulfilment ↔ partner. `pickup` and `dropoff` JSON (address, geo, contact), `parcel` (desc, weight, value), `codAmountKobo`, `feeKobo`, `status` (`REQUESTED | OFFERED | ACCEPTED | ASSIGNED | TO_PICKUP | PICKED_UP | DELIVERED | FAILED_ATTEMPT | RETURNING | RETURNED | CANCELLED`), `offerExpiresAt`, `riderId`, `externalRef`, `trackingUrl`, `proof` JSON (code verified, photo asset, geo, time), `attempts`.
- **Rider**: user + partner org, `vehicle`, `plate`, `status` (`OFFLINE | FREE | BUSY`), `lastLocation` (geo, time), papers (NIN verified, licence expiry, guarantor), `rating`, `onTimeRate`.
- **JobEvent**: job status history with actor and location.
- **CodCollection**: job, rider, amount, `collectedAt`, `remittedAt`, `remittanceId`.
- **CodRemittance**: partner pays cash in via their dedicated virtual account; matched automatically; `dueAt` 18:00 same day; late = flag + pause new COD jobs.

### 6.10 Marketing and growth

- **Discount**: code, `type` (`PERCENT | AMOUNT | FREE_DELIVERY`), value, `minOrderKobo`, `startsAt`, `endsAt`, `usageLimit`, `usedCount`, `active`, `peggyMayOffer` bool.
- **AffiliateProgram** (store): `enabled`, `commissionBps` (default 1000), cookie days. **Affiliate**: name, handle, link code, stats. **AffiliateCommission**: order, amount, status (paid Fridays after delivery).
- **SocialAccount**: platform (`INSTAGRAM | FACEBOOK | TIKTOK`), tokens (encrypted), page/account ids, scopes, expiry.
- **ContentPost**: planned by Peggy. `platforms`, `type` (`REEL | CAROUSEL | IMAGE | STATUS | TIKTOK`), caption, media, `scheduledAt`, `status` (`DRAFT | NEEDS_APPROVAL | SCHEDULED | POSTED | FAILED`), performance JSON.
- **VideoJob**: product, `style` (`NEW_DROP | THREE_WAYS | UNBOXING | FLASH_SALE`), voiceover (`pcm-female | en-female | yo-male | ha-female | none`), provider job id, status, output asset, `creditsUsed`.
- **AdCampaign**: platform (`META | TIKTOK`), product, `goal` (`WHATSAPP_CHATS | STORE_VISITS | FOLLOWS`), `dailyBudgetKobo`, `days`, audience JSON, creative (caption, asset, CTA), `status` (`DRAFT | IN_REVIEW | ACTIVE | PAUSED | ENDED`), `stopRule` (no orders by day 2), external ids, stats (spend, chats, orders, profit). Ad spend debits the seller's balance (ledger `AD_SPEND`).
- **Channel** (store): `kind` (`WHATSAPP | INSTAGRAM | FACEBOOK | TIKTOK_SHOP | GOOGLE | JUMIA | KONGA | AMAZON`), `status` (`OFF | CONNECTED | APPLIED | PENDING | WAITLIST | ERROR`), external ids, last sync, errors. **ChannelListing** per product per channel.
- **LabelJob**: `template` (`PRICE_TAG | HANG_TAG | CARE | SHIPPING_4X6`), product or order ids, options (price, QR), qty, output PDF asset.

### 6.11 AI agents

- **AgentRun**: `agent` (`REX | PEGGY`), store, user, `trigger` (`CHAT | SCHEDULE | EVENT | API`), `intent`, model, tokens in/out, cost estimate, status, `parentRunId`.
- **AgentAction**: run, `tool`, `input` JSON, `output` JSON, `status` (`PROPOSED | APPROVED | APPLIED | REJECTED | UNDONE | FAILED`), `requiresApproval`, `approvedBy`, `undoPayload` JSON, `themeVersionId` if it changed the store.
- **PeggyRule** (store): which topics Peggy may answer alone: `prices`, `stock`, `delivery`, `discounts` (with cap 10%, never on new arrivals), quiet hours, voice.
- **Brief**: daily or evening summary content, channel (push, WhatsApp), delivered at.
- **Suggestion**: store-scoped suggestion cards (reorder, ad, broadcast, restock, health tips) with `score`, `status` (`OPEN | ACCEPTED | DISMISSED`), payload.
- **StoreHealth**: score 0–100 + checklist items (reviews on home, About page, payday campaign, size chart…).

### 6.12 Platform

- **Plan**, **Subscription** (seller plans; prices `[PLACEHOLDER]`), **Credit** balances (AI video credits, broadcast credits).
- **Notification** (in-app) + **NotificationPreference**.
- **ApiKey** (partners): hashed key, prefix, scopes, mode (`TEST | LIVE`), last used. **Webhook** endpoints + **WebhookDelivery** log with retries.
- **FeatureFlag** (or PostHog).
- **Storage buckets**: `public-store` (product media, logos; public read), `private` (KYC docs, proofs, label PDFs; signed URLs only), `ai-generated` (drafts before acceptance), `imports` (CSV uploads).

### 6.13 Row Level Security

Enable RLS on every table. Prisma connects with a role that bypasses RLS **only on the server**. Supabase client access (Realtime, Storage, mobile direct reads, if any) must pass RLS:

- Membership-based: a user can read rows where `orgId` (or `store.orgId`) is in their memberships.
- Riders can read only jobs assigned to them; partners only jobs offered or assigned to their org.
- Suppliers see only fulfilments and products of their own org, and **only the delivery address of orders they must ship**, never the seller's other customers.
- Shoppers (storefront) never use the anon key for writes; all storefront writes go through API routes.
- Write RLS policies in SQL files under `packages/db/sql/` and apply them in migrations. Add a test that tries cross-org reads and expects zero rows.

---

## 7. Business rules (implement in `packages/money` and services; unit-test every rule)

### 7.1 Kobo and rounding

- All arithmetic in integer kobo. Percentages as basis points (bps). Round half up to the nearest kobo **once**, at the end of each fee calculation.
- Display: `₦` + thousands separators, no decimals unless kobo ≠ 0.

### 7.2 Dropship order flow (state machine)

```
PAID ──▶ OFFERED_TO_SUPPLIER ──(accept within 4 h)──▶ ACCEPTED ──▶ PACKED ──▶ PICKED_UP ──▶ DELIVERED ──(48 h, no return)──▶ SETTLED
             │                                                                                   │
             └─(no accept in 4 h)──▶ REROUTED to next supplier with same product (max 2), else ──▶ CANCELLED + refund
                                                                                                 └─(return opened)──▶ RETURN_FLOW
```

- **Acceptance window:** `[PLACEHOLDER: 4 hours]` (config). A QStash job fires at the deadline; Peggy notifies the seller **before** the shopper notices; reroute to suppliers with a `DropshipLink`-compatible product (same product family), ordered by on-time rate and distance.
- **White label:** suppliers print the seller's shipping label (seller's logo and store name from BrandKit). Tracking messages to shoppers use the seller's store name.
- **Money split on settlement** for an order with item price P, supplier cost C, delivery D:
  - Shopper paid `T = P + D`.
  - Payment fee `F = min(round(T × 1.5%) + ₦100, ₦2,000)` (Paystack local cards; ₦100 waived under ₦2,500). Read actual fee from the Paystack event when present; use the formula only for estimates. Keep both in config.
  - Supplier gets `C`. Rider/partner gets `D` minus the platform delivery commission (7.6). Seller gets `P − C − F − platform commission (if any)`.
  - Until `SETTLED`, the seller's share sits in `HELD` with `availableAt = deliveredAt + 48 h`.
- Example (prototype): P ₦13,000, C ₦6,000, D ₦2,500 → T ₦15,500, F ₦333, seller keeps ₦6,667.

### 7.3 Own-stock order flow

`PENDING_PAYMENT → PAID → PROCESSING → READY (packed) → SHIPPED (rider booked) → DELIVERED → COMPLETED`. Seller money becomes available at `DELIVERED` for prepaid orders (configurable; no hold for own stock by default), or when COD cash is remitted for COD orders.

### 7.4 Pay on delivery (COD)

- Allowed when: store has COD on, total ≤ `codMaxKobo` (default ₦50,000), shopper phone verified by OTP, drop-off inside a partner zone that supports COD, shopper not flagged for prior refusals (≥ 2 refused COD orders in 90 days blocks COD for that phone).
- Rider confirms delivery by entering the shopper's 4-digit code (sent by WhatsApp/SMS at dispatch). Cash collected creates `CodCollection` + ledger moves cash into the partner's `CASH_DUE`.
- Partners pay in by **6pm same day** to their dedicated virtual account; matched by account. Late → partner flagged, new COD jobs paused, admin alerted.

### 7.5 Wholesale and imports

- Wholesale unit price = the highest tier whose `minQty ≤ qty`. Paid from seller balance into escrow (`HELD`), released to supplier when the seller confirms arrival (or auto after 72 h of "delivered" with no dispute).
- Import landed cost (quote): `goods = yuan × moq × fxRate`; `chinaDelivery = [PLACEHOLDER: ₦8,600 flat]`; `partnerFee = 5% × (goods + chinaDelivery)`; freight and customs = air `kg × ₦[PLACEHOLDER: 14,500]/kg` or sea `max(cbm, 0.03) × ₦[PLACEHOLDER: 780,000]/cbm`; total; per-unit; suggested sell price; margin. Price locked 24 h. All rates from config and the sourcing partner's rate card.
- FX rate source: `[PLACEHOLDER]` (partner's quoted rate). Store the rate used on every quote.

### 7.6 Fees (all in `FeeConfig`, all `[PLACEHOLDER]` unless stated)

| Fee | Default |
|---|---|
| Seller subscription | `[PRICE]` per month (Starter) |
| Platform commission on store orders | `0 bps` (confirm) |
| Dropship platform commission | `[PLACEHOLDER]` |
| Delivery partner commission | `1500 bps` (15%, placeholder) |
| Sourcing partner fee (imports) | `500 bps` (5%) |
| Affiliate default commission | `1000 bps` (10%) |
| AI video credit price | `[PRICE]` |
| WhatsApp broadcast | pass-through of Meta's per-message rate + `[PLACEHOLDER]` margin |

### 7.7 Discounts, affiliates, reorders

- Discounts stack: max one code + automatic free-delivery rules. Peggy may offer only codes marked `peggyMayOffer` and never above `PeggyRule.maxDiscountBps` (default 1000).
- Affiliate commission accrues on `DELIVERED`, pays Fridays from the seller's balance; clawed back on returns.
- Restock suggestion: when `stockOnHand ≤ max(lowStockAt, weekly sales × 1)`.

### 7.8 Store health score

Start at 50. +10 payout bank added, +10 ten or more live products, +8 own domain, +8 About page, +12 reviews section on home, +8 active payday/seasonal campaign, +4 size chart on clothing, +5 WhatsApp channel connected, +5 at least one marketing post this week. Cap 100. Each missing item becomes a Rex suggestion with its points.

---

## 8. API

### 8.1 Conventions

- REST-ish route handlers in `apps/web/app/api/**`. JSON only.
- Success list: `{ data: T[], meta: { page, limit, total } }`. Single: `{ data: T }`. Error: `{ error: { code, message, details? } }`.
- Auth: `Authorization: Bearer <supabase-jwt>` for app and mobile. Partner API: `Authorization: Bearer sk_live_…` API keys. Webhooks verify signatures.
- Every handler: Zod-validate input, check membership + permission, run in a service function, return typed DTOs (never raw Prisma rows with secrets).
- Idempotency: all POSTs that create money movements or external effects accept `Idempotency-Key`.
- Rate limits via Upstash: auth 5/min/phone, AI 30/min/store, public API 120/min/key.
- CORS: `https://shopinbos.com`, `https://www.shopinbos.com`, localhost for dev.

### 8.2 Route groups

```
/api/auth/*                 OTP start/verify helpers, session exchange for mobile
/api/me                     profile, memberships, devices
/api/app/*                  seller (store-scoped: /api/app/stores/:storeId/...)
   home, notifications, peggy (chat), orders, sales, invoices, chats, messages, products, variants,
   imports, media, collections, customers, segments, broadcasts, brand, store, themes, pages,
   builder (draft, versions, publish), rex (runs, actions, undo), domains, sourcing (catalog, quotes,
   wholesale, imports), discounts, affiliates, ads, posts, videos, channels, money (balance, ledger,
   payouts, cod), delivery (settings, quotes, bookings), labels, reports, settings, team
/api/supplier/*             catalog, dropship orders (accept, pack, label), quotes, wholesale, payouts
/api/partners/*             jobs (accept, decline, assign, status), riders, coverage, cash, earnings, keys
/api/riders/*               my jobs, status updates, proof upload, cash, location ping
/api/admin/*                orgs, kyc, disputes, payouts, fees, partners (keys, sandbox→live), themes
/api/storefront/*           public: products, collections, cart, checkout, order status, wishlist, OTP
/api/public/*               marketing site: marketplace products, suppliers, stats (no auth, cached)
/api/v1/*                   partner API (delivery partners in API mode) — versioned, documented
/api/webhooks/*             paystack, whatsapp, meta, tiktok, delivery partners, qstash
/api/jobs/*                 QStash targets (signed): reroute, settle, payouts, briefs, syncs, health
/api/cron/*                 Vercel Cron (CRON_SECRET): daily briefs, payout batches, domain checks
```

### 8.3 Partner API (delivery companies in API mode) — adapter contract

Shopinbos calls partners (or partners call us) with the same six operations. Implement `DeliveryAdapter` in `packages/integrations/delivery`:

```ts
interface DeliveryAdapter {
  quote(input: QuoteInput): Promise<QuoteOption[]>;          // price, eta, service
  book(input: BookInput): Promise<{ externalRef: string; trackingUrl?: string }>;
  cancel(externalRef: string, reason: string): Promise<void>;
  track(externalRef: string): Promise<JobStatusUpdate[]>;
  proof(externalRef: string): Promise<ProofOfDelivery | null>; // code, photo, time, geo
  cash(externalRef: string): Promise<CodStatus | null>;        // collected, amount, remitted
}
```

Adapters: `native` (Shopinbos Partners/Riders), `shipbubble`, `gig`, `kwik`, `konga`, `dreacot`, `travo`. Partners start in `SANDBOX`; admin flips to `LIVE` only after a test delivery passes. Our own `/api/v1` for partners exposes: `GET /jobs?status=offered`, `POST /jobs/:id/accept|decline`, `POST /jobs/:id/status` (with code + photo URL on delivered), `POST /cod/remittances`, webhooks `job.created`, `job.cancelled`, `cod.due`. Publish OpenAPI at `/api/v1/openapi.json`.

---

## 9. Screens (build exactly these; names match the prototype)

Each screen lists purpose, content and key actions. "Prototype:" marks behaviour that is a demo control and must become real.

### 9.1 Seller app (native, Expo) — tabs: Home, Orders, Chats, Products, More + Create sheet

**Home**
- Header wash with avatar, search, notifications (dot when unread).
- "Your shop made ₦X today", **Ask Peggy** bar (opens Peggy chat), week sales mini-chart (today highlighted), Orders/Visits/Chats tiles.
- Peggy brief card: up to 4 actionable items (approve replies, dropship order arrived, low-stock reorder with one-tap Reorder, orders to send out).
- Quick actions grid: Add product, Record sale, Find stock, Make video, Labels, Broadcast, Ask Rex, More.
- Finish setting up checklist (store health items with progress).
- Selling fast carousel; imports on the way strip.

**Notifications** — grouped list; tap routes to the order, import, ad or payout.

**Peggy (assistant chat)** — suggested questions ("How did I do this week?", "What should I restock?", "Who hasn't bought in a while?"), rich answer cards with actions (Reorder, Draft WhatsApp message, Open report). Voice input.

**Orders** — chips: All, New, To deliver, Dropship, Done. Cards show customer, items, amount, status line, channel and payment badges, Dropship badge. "Record sale" button.

**Order detail (own stock)** — progress bar (Paid → Packed → On the way → Delivered), item, customer card (WhatsApp, call), delivery options (Shopinbos Riders, Kwik, GIG with prices from live quotes), Print label, Book rider. After booking: rider booked, Peggy sent tracking.

**Order detail (dropship)** — item with "Dropship · {supplier} ships it"; fulfilment timeline (Shopper paid → Supplier accepted → Packed with your label → Rider picked it up → Delivered, code confirmed → Money split and paid out) with times; Peggy note per stage (acceptance countdown, reroute promise); money split card (your price, supplier cost, payment fee, **you keep**, held until delivered); Message supplier, Track rider. Prototype "show next update" → real status from Realtime.

**Record a sale** — customer (existing or new), items, payment (transfer, cash, send invoice), delivery (pickup or bike); total; success state (receipt or invoice sent on WhatsApp).

**Chats** — channel chips (All, WhatsApp, Instagram, TikTok); Peggy banner (drafts waiting); list with Draft ready badges.

**Chat thread** — messages (Peggy-sent marked), Peggy's draft card (Send, Edit), payment link card in thread, "Let Peggy reply without asking" toggle, composer.

**Products** — Select (bulk: price, stock, hide, print labels), add (+), search with barcode scan, Import, Find stock to sell, filter chips (All, Live, Drafts, Low stock, Dropship). Rows: photo, name, status, price, stock or "Supplier has N", source.

**Product detail** — hero photo, Edit, title/variant/channels, dropship info card, quick actions (Share, Video, Labels, Promote), tabs Overview (views, added to bag, sold, wishlisted + Peggy restock nudge), Stock history, Variants.

**Add/Edit product** — photos (background cleaned, video from photos), Rex filled from photo banner, name, description with "Rewrite with Rex", price/was/cost with live "You keep ₦X · Y% margin", sizes and colours generating variants with stock, SKU/weight/barcode scan, where it sells (store, WhatsApp catalog, Instagram, Facebook, TikTok Shop), collections, status (Draft/Live), Save.

**Import products** — sources: Instagram posts, CSV/Excel, Shopify, WooCommerce, Bumpa or Catlog, Shopinbos suppliers, 1688 link. **Review import**: N found, ready vs need a look, "Let Rex fill missing prices", per-row Skip/Include, Publish N.

**More** — store card, Ask Rex card, grids: Sell (Find stock, Customers, Store and templates, Sell everywhere), Grow (Marketing, Ads, Video studio, Discounts, Affiliates, Broadcasts), Run (Money, Delivery, Imports, Labels, Reports, Settings).

**Find stock** — search + photo search; tabs Nigeria, China · 1688, Trending.
- Nigeria: Rex suggestion, "No stock / Your label / Paid after delivery" explainer, category chips, supplier product cards (sell price, you keep), Add to store, added banner.
- China: paste link or photo, sample tries, result (factory ¥, MOQ, landed by air/sea per unit, sells for), Get landed quote, how importing works, My imports.
- Trending: list with Find buttons.

**Supplier product** — photo, supplier, rating, ships in, on-time, stock; segmented Dropship · no stock / Buy wholesale.
- Dropship: price stepper (±₦500), similar items range, on each sale (shopper pays, supplier gets, payment fee, **you keep · margin**), what happens when it sells (4 steps), Add to my store.
- Wholesale: tiers, quantity stepper, price each, total, profit if sold out, Request a quote.

**Quote (local)** — request bubble, waiting state, supplier reply, offer card (qty, price each, delivery, total; money held until arrival), Counter / Accept and pay, paid state.
**Quote (China)** — air/sea toggle, landed cost breakdown, per unit, keep per unit, 24-h lock, Pay ₦X to start, then Track it.

**Imports** — cards with stage progress, ETA, expandable stages and QC photos, amount paid; New import.

**Customers** — Broadcast button, search, segments (All, Repeat, VIP, Gone quiet, Wishlisted), Peggy comeback nudge, list with tag and stats.
**Customer** — profile, WhatsApp/Call/Sale, orders/spent/last, What Peggy knows chips, orders, private notes.
**Broadcast** — audience chips with counts, Peggy draft preview (WhatsApp bubble with image and button), rewrite chips (Shorter, In Pidgin, Change photo, Edit myself), Meta cost estimate, Send to N people; sent state.

**Your store** (simplified) — live preview in brand colours, View store, Change with Rex, **Rebrand with Rex** card, **Brand kit** card (logo + swatches; "used on your store, labels, receipts, posts and ads"), Templates, Domain, **Advanced builder · web only** card with "Email me the link".
**Build with Rex** (5 steps): 1 your shop (what you sell, how it should feel, name, one line); 2 logo (4 generated options + Try 4 more, Add a symbol, Upload my logo); 3 colours (3 palettes) and fonts (from logo); 4 build (preview + "What I did" list); 5 saved to Brand kit (where it shows up; Publish the new look).
**Brand kit** — main logo, on-dark, app icon; colours with hex; fonts; how you sound; files (logo PNG/SVG, brand sheet PDF, photo library); used on (store, labels and receipts, posts and videos, ads, WhatsApp, emails); Upload logo, New logo with Rex.
**Change with Rex** — mini preview, chat, suggestion chips, Rebrand chip, Publish.
**Templates** — category chips, template cards with Use this/Current.
**Domain** — free address; connect one I own (enter www domain → records to add (CNAME www → `stores.shopinbos.com` or provider target; bare-domain redirect record) → checking → live with SSL) or buy a new one (search, availability, price, buy from balance).

**Marketing** — Peggy ad suggestion (launch / change), running ads in plain numbers, tiles (Video studio, Discounts, Affiliates, Broadcasts), posts this week (Peggy-planned, needs-approval states).
**New ad** — what to promote (product picker), goal (WhatsApp chats, Store visits, Instagram follows), budget per day, days, Instagram preview, Peggy stop rule, Launch.
**Video studio** — preview, style, voiceover language, Make my video (credits), Try another, Schedule post.
**Discounts** — list with toggles, new discount form (code, type, amount, min order, end date), Peggy note.
**Affiliates** — program toggle, commission, invite link, stats, list, Peggy creator suggestion.
**Sell everywhere** — channel rows with Connect / Apply / Join waitlist / Connected states.
**Money** — balance card (withdraw now; automatic Friday payout), held for dropship, waiting for transfer, cash with riders, fees this month; tabs Activity, Payouts, Cash on delivery.
**Delivery** — pickup address (NIPOST postcode), who delivers (partner toggles), what shoppers pay (zones), pay on delivery toggle + rules.
**Label maker** — templates (price tag, hang tag, care label, shipping 4×6), product picker, show price, QR to store, quantity per sheet, Download PDF / Order stickers; Bluetooth printer support (phase 6).
**Reports** — range chips, KPIs (sales, profit after costs, orders, visits · buy rate), 14-day bars, channel bars, funnel with Peggy insight, best sellers.
**Settings** — business (store details, payout bank, ways to pay, invoices), team, Peggy rules toggles, notifications toggles, plan, security, help, sign out.

### 9.2 Seller web app — sidebar

```
[Logo] [Store switcher] [Add product]
Home · Orders(badge) · Inbox(badge) · Products
SOURCING: Find products · Imports
PEOPLE: Customers
STORE: Your store · Rex Studio (AI) · Brand kit · Templates · Domain · Advanced builder (Web)
MARKETING: Overview · Ads · Video studio · Discounts · Affiliates · Sell everywhere
RUN: Money · Delivery · Labels and print · Reports
Settings
```

Top bar: page title, global search (`/` shortcut), Ask Peggy (opens right **drawer**), notifications, avatar.

All mobile screens exist on web with wider layouts:
- Orders: list (table) + detail panel side by side.
- Inbox: three panes (threads, conversation, customer).
- Products: table with bulk bar; product editor in two columns (main + right sidebar: status, channels, collections, 30-day stats, stock history, SKU/barcode/weight).
- Customers: table + profile panel.
- Find products: 4-column grid; supplier product page with gallery and right buy panel.
- Rex Studio and Advanced builder are **full-screen** modes with an Exit button.

### 9.3 Rex Studio (web) — AI store-building dashboard

Full screen.
- **Top bar:** Exit, Rex mark, store and theme, page tabs (Home, Product pages, Collections, About us, Questions), device toggle, Open in builder, Publish.
- **Left (380px), chat:**
  - Rex intro, then user requests.
  - Each Rex reply shows a "did" checklist, an explanation, a "Version N" badge and **Undo this**.
  - Suggestion chips, and a composer with photo, Instagram link and voice inputs.
- **Centre:** live preview of the actual storefront renderer with the draft theme, for the selected page and device.
- **Right (300px):**
  - Store health score and bar.
  - Rex suggests (tips with points; one tap applies).
  - Pages checklist (View / Write it).
  - Brand kit mini (opens the Brand kit).
  - Versions list with Restore.
- **Behaviour:**
  - Every Rex change is an `AgentAction` that produces a new `ThemeVersion` (draft).
  - Undo creates a version from the previous snapshot.
  - Publish copies the draft to published.
  - Nothing reaches shoppers before Publish.

### 9.4 Advanced builder (web only) — Shopify-style theme editor

Full screen.
- **Top bar:**
  - Exit, theme name with Draft/Live badge, Editor | Themes.
  - Locale (Default).
  - **Page picker** dropdown with search: Home page, Products ›, Collections ›, Pages ›, Cart, Checkout.
  - Inspector toggle, Desktop/Tablet/Mobile, Undo/Redo, Publish, Save (disabled when saved).
- **Left rail:** Sections, Insert (+), Theme settings, Apps, plus Rex at the bottom (opens Rex Studio).
- **Sections panel (tree):**
  - Groups: **Header group** (Announcement bar, Header + Add section), **Overlay group** (Cart drawer, Newsletter popup), **Template** (page sections + Add section), **Footer group**.
  - Each section expands to its **blocks** (e.g. Image banner → Heading, Text, Buttons) with "Add block".
  - Eye toggle hides a section. Drag to reorder (use dnd-kit).
- **Insert panel:**
  - Tabs **Section | Element**, with search.
  - Sections grouped: Banners (Image banner, Slideshow, Countdown timer), Products (Featured collection, Collection list), Story (Image with text, Video, Testimonials, Questions), Grow (Newsletter, Order on WhatsApp, Instagram feed).
  - Elements: Layouts (Column, Row, Grid), Basics (Heading, Text, Image, Button, Link, Video), Commerce (Product card, Add to bag, Price, Countdown, WhatsApp button, Reviews). Elements are blocks added into the selected section.
- **Canvas:**
  - Storefront renderer in an **iframe** (same renderer as the live store, draft data via postMessage).
  - Click any section to select it: blue outline + label tab.
  - Click a block (heading, text, button) to select it.
  - The selected section shows a floating toolbar: Move up, Move down, Duplicate, Hide, Remove.
  - Device widths 1440/820/390.
- **Right panel, Settings tab** (per section schema):
  - **Image banner:** image (Select, Explore free images), overlay opacity slider, height (Small, Medium, Large, Full), content position (top/middle/bottom), alignment (left/centre/right), container toggle, colour scheme (4 swatches), mobile layout (stack images, alignment), Remove section.
  - **Featured collection / Explore:** heading, collection, products per row (desktop and mobile), colour scheme.
  - **Product grid:** products per row desktop/mobile, enable filtering, desktop filter layout (horizontal or side panel), card padding.
  - **Announcement bar:** messages (blocks), auto-rotate, interval, sticky, background/text colours.
  - **Header:** logo (from Brand kit), logo position, menu, sticky.
  - **Product information:** gallery layout (thumbnails below/left), blocks.
  - Collapsible **Theme settings** and **Custom CSS** at the bottom.
- **Right panel, Style tab** (Webflow-like, for the selection):
  - Layout display (Block/Flex/Grid/None).
  - Spacing box model (margin/padding).
  - Sizing (width, height, max).
  - Typography (font from theme, size, weight, colour).
  - Corners, shadow, animation on scroll.
  - Values save to section/block `style` overrides, constrained to theme tokens.
- **Theme settings panel:** colour schemes (from Brand kit), typography, buttons (corner style), cart (drawer/page), social, checkout (logo/colours only), favicon.
- **Apps panel:** Order on WhatsApp, Reviews by Peggy, Size chart, Countdown timer (toggle availability as blocks).
- **Themes view (library):** 8 themes with New badge, Preview, Use, Customize, and "Let Rex pick one".
- **Toasts** for add, duplicate and remove, each with Undo.

### 9.5 Storefront (shopper)

- Rendered from `ThemePage.sections` with the store's BrandKit + theme settings.
- **Pages:** Home, Collection (filters, sort, grid), Product, Cart, Checkout, Order status/track, About, Delivery and returns, Questions, Search.
- **Product page:** follows the **Breeze** layout.
  - Breadcrumb, title, price with compare-at, rating.
  - Description, colour swatches, size pills with Size chart, material chips.
  - Add to bag, Buy now, Chat (WhatsApp), Wishlist, Share.
  - Gallery with thumbnails (below or left).
  - Tabs: Description, Reviews, Discussion.
  - Product details list, Size and fit table, Explore more, video banner, newsletter.
- **Checkout:**
  - Guest, phone first.
  - Address with Google Places + NIPOST postcode.
  - Delivery options from live quotes; pay by card, transfer, USSD or pay on delivery (if eligible, after OTP).
  - Discount code, order summary.
  - Shopinbos-managed: sellers can't change the structure, only logo, colours and button style.
- **WhatsApp ordering:** "Order on WhatsApp" opens a prefilled chat; Peggy completes the order and sends a payment link.
- **Performance:** server components, cached per store with `revalidateTag(storeId)` on publish/product change; LCP < 2.5 s on 4G; images via Supabase transforms (WebP/AVIF, sized).

### 9.6 Store themes (seed data)

| Key | Name | Category | Feel | Defaults |
|---|---|---|---|---|
| `adire` | Adire | Fashion | Editorial, photo-led | Brand palette; Fraunces headings; pill buttons |
| `breeze` | Breeze | Fashion | Airy, clean, big product page | White bg, ink `#1B2228`, accent `#1FCAD6`, soft `#EEF8F9`; Plus Jakarta; radius 10 |
| `noir` | Noir | Luxury | Dark, premium, countdowns | bg `#121212`, ink `#F4EFE6`, gold `#C8A96A`; DM Serif uppercase headings with tracking; square buttons |
| `plain` | Plain | Any | Minimal and fast | White, ink `#121212`, radius 4; centred logo option |
| `pantry` | Pantry | Food | Warm and bold | `#FFF4DA` / `#3A2A00` / `#E2552B`; Bricolage |
| `ile` | Ilé | Home | Calm and roomy | `#E8EFEA` / `#15322A`; DM Serif |
| `plug` | Plug | Gadgets | Dark and sharp | `#16171C` / white / `#7CFFB2`; Space Grotesk |
| `stride` | Stride | Shoes | Loud and sporty | `#FFE9DD` / `#3A1A08` / `#FF5A1F`; Bricolage |

Each theme ships default page JSON for Home, Product, Collection, Cart, About, Questions using sections from the registry (11.2). Colour scheme 1 = theme bg/ink, 2 = inverted, 3 = accent, 4 = soft.

### 9.7 Supplier portal (web)

- **Dashboard:** new dropship orders with acceptance countdown, quotes waiting, wholesale orders, payouts.
- **Dropship orders:** Accept (within window), Print seller label (white label), Mark packed, book or hand to rider; Decline (with reason).
- **Catalogue:** products, dropship cost, suggested price, wholesale tiers, stock (bulk edit, CSV).
- **Quotes:** reply with offer; **Wholesale orders**: mark shipped, upload proof.
- **Payouts, team, profile:** location, ships within, white-label packing on/off.

### 9.8 Shopinbos Partners (delivery companies) — web console + native

Tabs on mobile: Today, Jobs, Riders, Cash, More. The web sidebar is the same plus Coverage and rates, Earnings, Performance, Connect your system and Company.

- **Today:**
  - "Taking new jobs" switch; delivered today, earned today; New/Active/Issues counts.
  - New requests with accept countdown (Decline / Accept and assign).
  - Live rider map; cash to pay in by 6pm.
- **Jobs:** tabs New, Active, Issues, Done.
- **Job detail:**
  - Map with route, pickup/drop-off, parcel, collect amount.
  - Progress (Accepted, needs a rider → Rider heading to pickup → Picked up → Delivered).
  - Proof (code + photo).
  - Pick a rider: closest first, free vs finishing soon, rating.
  - Failed attempt handling: Return to shop / Retry tomorrow; Peggy messages the customer.
  - Shop and customer contact (only while the job is open).
- **Riders:** status chips; list with ride, location, jobs, cash held, rating; add rider by WhatsApp invite (they onboard in the Riders app; partner approves).
- **Rider detail:** stats, jobs, papers (NIN, licence and plate, guarantor).
- **Cash on delivery:** to pay in by 6pm, collected vs paid in, dedicated pay-in account, per-rider rows with status.
- **Coverage and rates:** map, zone prices, services (bike same day, van, interstate, COD up to ₦50,000, evening runs), hours.
- **Earnings:** fees, jobs, Shopinbos fee, you get, by day, weekly statements.
- **Performance:** tier (Gold: first pick in areas), on time, first-try delivery, acceptance, rating, shop comments.
- **Connect your system:** live/sandbox keys (show once, then masked), webhook URL with "Send a test job", recent calls log.
- **Company:** CAC, goods-in-transit insurance, payout bank, team roles (Owner, Dispatcher without money access).

### 9.9 Shopinbos Riders (native)

Use the earlier "Riders app" prototype:
- Online toggle; offered jobs with accept.
- Navigation handoff (Google Maps deep link); pickup checklist.
- Delivery code entry, photo proof, cash collected.
- Today's earnings and cash held.
- Remit instructions.
- Background location while on a job (with clear permission copy), offline queue for status updates.

### 9.10 Admin (web)

Orgs and KYC review, store moderation, disputes and returns, ledger explorer, payout batches (approve, retry), fee config (versioned), delivery partners (keys, sandbox → live after test delivery), sourcing partners and rate cards, themes catalogue, feature flags, impersonation (read-only, audited), WhatsApp template status.

---

## 10. AI: Rex and Peggy

### 10.1 Architecture

- `packages/ai` contains: system prompts (versioned files), **tool definitions** (Zod → JSON schema), a runner (Anthropic Messages API, tool use loop, streaming), cost tracking, and guardrails.
- Each run creates an `AgentRun`; each tool call an `AgentAction`. Tools that change money, publish, message customers or spend are **PROPOSED** and need approval unless a `PeggyRule` allows it.
- Models via env (`AI_MODEL_SMART` for Rex builds and planning; `AI_MODEL_FAST` for chat replies, classification, drafts). Never hardcode model ids.
- Context: store profile, BrandKit voice, relevant products (search by text + embeddings if enabled), customer facts, last 20 messages. Keep prompts under a token budget; summarise long threads.
- Languages: English, Nigerian Pidgin, Yorùbá, Hausa, Igbo (reply in the customer's language).

### 10.2 Rex tools (builder)

`get_store`, `get_brand_kit`, `generate_logos(style, count)`, `set_brand_kit(palette, fonts, logoAssetId)`, `list_themes`, `switch_theme(key)`, `get_page(template)`, `update_section(pageId, sectionId, settings)`, `add_section(pageId, type, position, settings)`, `remove_section`, `move_section`, `write_page(handle, brief)`, `rewrite_copy(target, tone, language)`, `create_product_from_photo(assetId)`, `fill_missing_prices(importJobId)`, `translate_1688(url)`, `create_campaign_banner(offer, endsAt)`, `score_store_health`, `create_version(label)`, `publish(versionId)` (approval required), `undo(actionId)`.

### 10.3 Peggy tools (operations)

`search_products`, `get_stock`, `quote_delivery(address)`, `create_payment_link(orderDraft)`, `create_order_from_chat`, `send_message(conversationId, body)` (auto only for allowed topics), `draft_reply`, `get_customer`, `tag_customer`, `suggest_reorder`, `create_reorder` (approval), `draft_broadcast(segment)`, `plan_posts(week)`, `draft_ad(productId)`, `pause_ad(campaignId)` (auto when stop rule triggers), `daily_brief`, `weekly_report`, `offer_discount(code)` (only `peggyMayOffer`, within cap).

### 10.4 Guardrails

- Never invent prices, stock or delivery times: answer only from tool results.
- Never promise refunds or delivery dates beyond configured rules.
- Never message customers who haven't opted in, outside WhatsApp's 24-hour window, except with approved templates.
- Human handoff when: complaint, refund, abuse, payment dispute, or confidence low.
- Log every outbound AI message with the run id. Seller can see "Sent by Peggy" on every message.
- Evals in `packages/ai/evals`: 50+ chat cases (price question in Pidgin, out of stock, delivery to Enugu, angry customer, discount ask beyond cap), 20 Rex build cases. Run in CI on prompt changes.

### 10.5 Media AI

- Background removal on product photo upload (async job).
- Logo generation: an image model produces candidates; Rex also proposes typographic logos rendered from fonts (fast, always available) — store as SVG.
- Video: provider job from 3+ photos, style template, TTS voiceover in chosen language; output 9:16 MP4 for Reels, TikTok and Status.

---

## 11. Storefront rendering, themes and the builder

### 11.1 Multi-tenant routing

- `apps/web/middleware.ts` reads `Host`.
  - `app.shopinbos.com` → app routes.
  - `{slug}.shopinbos.com` or a custom domain → rewrite to `/_store/[storeId]/...`.
- Resolve host → store via `Domain` table with a Redis cache (5 min, bust on change).
- Unknown host → branded 404. Paused store → "Back soon" page.

### 11.2 Section registry (`packages/themes`)

Each section type has a schema:

```ts
defineSection({
  type: 'image-banner',
  name: 'Image banner',
  blocks: { heading: {...}, text: {...}, buttons: {...} },
  settings: z.object({
    image: assetRef, overlay: z.number().min(0).max(80).default(40),
    height: z.enum(['s','m','l','full']).default('l'),
    position: z.enum(['start','center','end']).default('end'),
    align: z.enum(['left','center','right']).default('center'),
    container: z.boolean().default(false),
    scheme: z.enum(['s1','s2','s3','s4']).default('s1'),
    mobileStack: z.boolean().default(false),
  }),
  style: styleOverridesSchema,
  render: ImageBanner,          // React server component used by storefront AND builder iframe
});
```

**Registry v1:**
- Announcement bar, Header, Footer, Cart drawer, Newsletter popup.
- Image banner, Slideshow, Countdown timer.
- Featured collection, Collection list, Product grid (with filters), Collection banner.
- Image with text, Video, Testimonials, Questions, Newsletter, Order on WhatsApp, Instagram feed.
- Product information (blocks: title, price, rating, swatches, size picker, material, buy buttons, share row), Product tabs, Size and fit, Explore more, Video banner.
- Cart items, About banner, Rich text, Custom HTML (admin-only).

### 11.3 Builder editor architecture

- Editor state (Zustand): `draft` (pages, settings), selection (`sectionId`, `blockId`), undo/redo stacks, dirty flag.
- **Preview iframe:**
  - Loads `/_store/[storeId]/preview?page=…&draft=1`.
  - Receives the draft via `postMessage`, re-renders on the client with the same section components.
  - Sends `select` events back on click.
  - Highlights hover and selection.
- **Save:** PATCH draft (debounced autosave every 3 s plus the Save button). **Publish:** creates a ThemeVersion and sets it as published, then revalidates the cache.
- **Schema-driven settings panel:** generated from the Zod settings (number → slider/stepper, enum → segmented or select, boolean → toggle, asset → picker with "Explore free images", colour scheme → swatch chips).
- **Style tab:** writes `style` overrides limited to tokens (spacing scale, radius scale, font scale).
- Keyboard: ⌘Z, ⇧⌘Z, ⌘S, Delete removes the selected section, ⌘D duplicates.

### 11.4 Domains (`DomainProvider`)

```ts
interface DomainProvider {
  addHostname(hostname: string): Promise<{ records: DnsRecord[]; providerRef: string }>;
  checkHostname(providerRef: string): Promise<'pending' | 'active' | 'failed'>;
  removeHostname(providerRef: string): Promise<void>;
  searchAvailability?(query: string): Promise<DomainOption[]>;  // buying
  register?(domain: string, contact: RegistrantContact): Promise<RegisterResult>;
}
```

- **Vercel implementation (default):** project domains API to add, verify and remove domains; the Vercel registrar for search and purchase if available on the account. Wildcard `*.shopinbos.com` handled at project level.
- **Cloudflare implementation (alternative):** Cloudflare for SaaS custom hostnames (100 free, then per-hostname fee); registrar API beta for supported TLDs only.
- `.ng` / `.com.ng` purchase needs a NiRA-accredited registrar: out of scope for v1; show "Coming soon" for those endings.
- **Bare domain:** sellers connect `www`. Redirect apex → www via an A record to a redirect service (Vercel supports apex A records on the project) and say so in the UI.
- **Background job** checks pending domains every 10 min for 24 h; push a notification when live; update store URL in labels and receipts.

---

## 12. Integrations (in `packages/integrations`)

| Integration | Use | Notes |
|---|---|---|
| Paystack | Checkout (card, transfer, USSD), webhooks, refunds, transfer recipients and transfers (payouts), dedicated virtual accounts (partner COD pay-in, seller "pay by transfer") | Verify webhook HMAC SHA512 with the secret key. Idempotent on `reference`. Confirm escrow/holding model with Paystack and a lawyer (open question 1). |
| WhatsApp Cloud API | Seller WhatsApp Business numbers (Embedded Signup), platform number for OTP/alerts, message templates, catalog sync, webhooks | 24-hour window rule; template approval flow in admin |
| Instagram / Facebook Graph | DMs, comments, posting (content publishing), shopping catalog | App review needed for permissions |
| Meta Marketing API | Click-to-WhatsApp and traffic ads, insights, pause rule | Ad account per seller (Meta Business onboarding) |
| TikTok Shop / TikTok API | Product sync, orders, posting | Regional availability check at build time; ship behind flag |
| Google Merchant Center | Free listings | Service account per platform; feed per store |
| Jumia, Konga | Marketplace listing applications | Start as "Apply" (manual), API later |
| Termii / Sendchamp | SMS and WhatsApp OTP fallback via Supabase Send SMS hook | Implement the hook as an Edge Function |
| Resend | Email OTP, receipts, payouts | React Email templates |
| Delivery adapters | Shipbubble, GIG, Kwik, Konga KOS, Dreacot, Travo | Sandbox first; admin enables live |
| NIPOST postcode API | Postcode lookup at checkout and pickup | Cache results |
| Google Maps / Places / Geocoding | Address autocomplete, rider map, distance for rider ranking | Separate browser/server keys |
| KYC (Dojah or Youverify) | BVN/NIN/CAC checks, selfie | Store only references + redacted results |
| Image/video/background removal providers | Rex and studio | Behind adapters; switchable |
| Expo push (APNs + FCM) | Notifications | Credentials stored in EAS |
| Sentry, PostHog | Errors, analytics, flags | Scrub PII |

---

## 13. Mobile apps (Expo)

- **Shared:** Expo Router, `packages/api-client`, `packages/tokens`, `packages/ui-native`, Supabase auth (phone OTP), secure storage for session, TanStack Query with persisted cache, Sentry, PostHog.
- **Seller app routes:**
  - `(tabs)/home`, `(tabs)/orders`, `(tabs)/chats`, `(tabs)/products`, `(tabs)/more`.
  - Stacks for every screen in 9.1; Create sheet as a modal route.
- **Device features:**
  - Camera: product photos, barcode scan (`expo-camera`).
  - Image picker; share sheet (store link, product).
  - Contacts: optional, for recording a sale.
  - Bluetooth thermal printer for labels (phase 6, via a native module or vendor SDK in a dev build).
  - Haptics.
- **Push:** order received, chat needs you, dropship update, import stage, payout sent, daily brief (opt-in). Deep links to the screen.
- **Offline:** read cached lists. Queue "record a sale" and stock adjustments while offline; sync with conflict rules (server wins on stock, show a notice).
- **OTA updates:** EAS Update channels `preview`, `production`.
- **Riders app:** background location only while on an active job; foreground service notification on Android; battery-aware pings (every 30 s moving, 2 min idle).
- **Partners app:** mirrors the web console's Today, Jobs, Riders, Cash and More.
- **Store releases:** EAS Build + Submit. Bundle ids `com.shopinbos.seller`, `com.shopinbos.riders`, `com.shopinbos.partners`.

---

## 14. Security, privacy and compliance

- Nigeria Data Protection Act 2023: privacy notice, consent capture for marketing messages, data export and delete on request, a DPO contact, breach process. Store consent with timestamp and source.
- Encrypt partner credentials and bank account numbers at app level (`ENCRYPTION_KEY`, AES-256-GCM) or Supabase Vault.
- Verify every webhook signature; reject replays (timestamp window).
- Rate-limit OTP; lock after 5 failed codes for 15 min. Never reveal whether a phone has an account.
- Staff permissions enforced server-side on every route.
- Audit log for money, permissions, publish, domain and payout bank changes.
- PII redaction in logs, Sentry and AI prompts (mask phone numbers in prompts unless the tool needs them).
- Content moderation for generated logos, images and product listings (block prohibited goods list).
- Backups: Supabase PITR on; weekly restore drill on staging.

---

## 15. Observability and quality

- Sentry on web, API and mobile, with release tracking. PostHog events for funnel steps (onboarding steps, first product, first order, first payout, Rex publish).
- Health checks: `/api/health` (db, redis, paystack ping).
- Coverage targets: `packages/money` 100%, services 80%, critical e2e flows:
  1. Seller signs up by phone, Rex builds the store, the seller publishes.
  2. Shopper buys with card; the seller books a rider; delivered; payout.
  3. Dropship: shopper pays; supplier accepts; partner delivers with code; split settles after 48 h.
  4. COD: rider collects; partner remits by virtual account; seller is credited.
  5. Builder: add section, edit, undo, publish; storefront shows it.
  6. Rex Studio: apply "payday sale", undo, restore.

---

## 16. Seed data

Use the prototype's demo world so screens look real in development:

- **Seller:** **Adaeze Studio** (Yaba, Lagos), owner Adaeze, staff Chinedu.
- **Products:** linen shirt ₦18,500 (cost ₦8,200, stock 3), knit jumper ₦15,800, olive blazer ₦32,000, camel wrap coat ₦38,500, floral slip dress ₦21,000 (draft), mini bucket bag ₦24,500 (dropship).
- **Customers:** Kemi O. (Lekki), Halima M. (VIP), Amaka I. (gone quiet), Seun D., Tobi A., Ngozi E. (Abuja), Femi O., Bisi K.
- **Orders:** SB-1036 to SB-1047, incl. dropship SB-1047 (Aba Leatherworks, leather slides) and SB-1043 (Kano Footwear Co., sneakers).
- **Suppliers:** Aba Leatherworks (Aba), Kano Footwear Co., Ọja Crafts (Ibadan), Mama Tola Textiles (Yaba), Ikorodu Cane Works, Computer Village Hub (Ikeja), Kwara Agro Foods (Ilorin), each with products and wholesale tiers.
- **Imports:** IMP-204 earbuds (shipping), IMP-198 bucket bags (customs), IMP-190 linen sets (in stock).
- **Delivery:** partner Swift Dispatch Ltd (Gold) with riders Musa Bello, Chika Obi, Tunde Ade, Ifeanyi Eze, Kunle Adeyemi (van), Bayo Lawal (offline); jobs J-8827 to J-8843.
- **Themes:** all 8 with default pages.
- **Images:** placeholder URLs; never ship stock photos to production without licences.

---

## 17. Build phases (do in order)

Each phase ends with the listed acceptance checks passing in CI and on a Vercel preview.

### Phase 0 — Foundation (repo, infra, design system)

- Monorepo, Turborepo, TS strict, ESLint, Prettier, Husky, commitlint, GitHub Actions.
- `packages/tokens`, `ui-web`, `ui-native` with Button, Card, Chip, Toggle, Input, Sheet, Tabs, Table, Badge, Stat, Stepper, Toast, plus Storybook (web) for review.
- Supabase project wired: Prisma schema v0 (identity, orgs, stores, brand kit, assets), RLS for those tables, storage buckets.
- Auth: phone OTP (WhatsApp via Send SMS hook → Termii/Sendchamp, SMS fallback), email OTP; web and Expo sign-in.
- Vercel project, env vars, wildcard domain, preview deployments; EAS projects for 3 apps building a hello screen.
- **Accept:** sign in by phone on web and iOS/Android dev builds; `/api/me` returns memberships; RLS cross-org test passes; Storybook deployed.

### Phase 1 — Seller core: onboarding, products, store, storefront v1

- Onboarding with Rex (6 steps) incl. **Build with Rex** brand flow (logos, palettes, fonts) → BrandKit.
- Products: list, detail, add/edit with variants, media upload + background removal, import (CSV, Instagram) with review.
- Themes package with the section registry v1 + 8 themes; storefront renderer; subdomain routing; Home, Collection, Product (Breeze layout), Cart, About, Questions.
- Your store, Brand kit, Templates, Domain (connect and verify via DomainProvider).
- **Accept:** e2e flow 1; Lighthouse ≥ 90 performance on product page (mobile); theme switch keeps products.

### Phase 2 — Orders, checkout, payments, money

- Storefront checkout (guest, OTP for COD), Paystack card/transfer/USSD, webhooks, order creation, receipts.
- Orders list/detail, record a sale, invoices with pay links.
- Ledger, balances, payouts (Friday batch + withdraw now), payout bank verification.
- Money screen, Reports v1.
- **Accept:** e2e flow 2 in Paystack test mode; ledger sums to zero; payout batch idempotent on retry.

### Phase 3 — Chats and Peggy

- WhatsApp Embedded Signup per seller, Instagram/Facebook DMs, unified inbox (web 3-pane, mobile list/thread).
- Peggy: drafts, auto-replies per PeggyRules, payment links in chat, order from chat, customer facts.
- Ask Peggy (assistant chat + web drawer), daily brief, suggestions on Home.
- Customers, segments, broadcasts (templates, consent, cost estimate).
- **Accept:** Peggy answers a Pidgin price question from real stock; sends a payment link; eval suite ≥ 90% pass.

### Phase 4 — Delivery, partners, riders, COD

- Delivery settings, zones, quotes and booking via adapters (native + Shipbubble first).
- Shopinbos Partners (web + native) and Riders (native) apps; job offer/accept/assign; proof with code + photo; failed attempts.
- COD: eligibility, collection, partner virtual accounts, remittance matching, late flags.
- Partner API `/api/v1` + OpenAPI + webhooks + keys; admin sandbox → live.
- Labels: price tags, hang tags, care labels, shipping 4×6 PDFs.
- **Accept:** e2e flow 4; partner in API mode completes a sandbox job via `/api/v1`.

### Phase 5 — Sourcing, dropship, wholesale, imports, supplier portal

- Supplier portal, catalogue, dropship links, stock sync, white-label labels.
- Dropship state machine with acceptance timer, reroute and settlement split.
- Quotes and wholesale orders with escrow; China imports with landed-cost quotes, stages, QC photos, arrival into stock.
- Find stock screens (Nigeria, China, Trending), supplier product page, imports.
- **Accept:** e2e flow 3 including a reroute after timeout; import moves to In stock and creates a product.

### Phase 6 — Growth: marketing, ads, video, discounts, affiliates, channels

- Discounts, affiliates (links, attribution, commissions).
- Content calendar with Peggy plans; Instagram/Facebook publishing; video studio with provider + TTS.
- Ads (Meta click-to-WhatsApp) with stop rule and ad spend ledger.
- Sell everywhere: WhatsApp catalog, IG/FB shop, Google free listings, TikTok Shop (flag), Jumia/Konga applications.
- Bluetooth label printing in the seller app.
- **Accept:** an ad launches in Meta sandbox/test ad account and pauses on the stop rule in a simulated run; catalog sync round-trip.

### Phase 7 — Rex Studio and the advanced builder (web only)

- Rex Studio (chat + live preview + health + pages + versions) on top of ThemeVersions and AgentActions.
- Advanced builder: iframe preview, section tree with blocks, insert panel, schema-driven settings, style tab, page picker, devices, undo/redo, autosave, publish, theme library, apps panel.
- Mobile "Advanced builder · web only" card with email link.
- **Accept:** e2e flows 5 and 6; publishing revalidates the storefront within 5 s.

### Phase 8 — Admin, hardening, launch

- Admin portal (9.10), disputes and returns, fee config, KYC review.
- Security review, load test checkout and webhooks, backups drill, privacy pages, app store listings, support playbooks.
- **Accept:** all e2e flows green on production-like staging; App Store and Play builds approved for internal testing.

---

## 18. Open questions (track in `docs/decisions/`)

1. **Holding customer money** for dropship/escrow: confirm the model with Paystack (subaccounts/split vs platform balance) and legal (CBN rules) before Phase 5 goes live.
2. Seller plan prices and any order commission: `[PRICE]`.
3. Delivery partner commission (15% is a placeholder) and dropship platform commission.
4. China sourcing partner, their rate card and FX source.
5. Which KYC provider (Dojah or Youverify).
6. Which image, video and background-removal providers.
7. TikTok Shop availability for Nigerian sellers at build time.
8. Domain purchase: Vercel registrar availability for the account; `.ng` support later via a NiRA registrar.
9. Supabase region (latency from Lagos vs feature availability).

---

## 19. Definition of done (every feature)

- Matches the screen spec (section 9) on mobile (390 wide) and web (1440 wide); responsive down to 360.
- Loading, empty, error and offline states designed (use the prototype's soft cards and plain copy).
- Accessible: labels, focus states, 44px targets, contrast.
- Server-side validation + permission check + audit log where money or publishing is involved.
- Tests added; Sentry clean on the preview; PostHog event for the key action.
- Docs: update `CLAUDE.md` if a convention changed; add an ADR for any decision.
