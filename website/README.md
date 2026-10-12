# shopinbos.com (WordPress)

The public website, built to the **Shopinbos website build plan** (WordPress on Hostinger, custom block
theme, one plugin, no page builder) and the **website prototype** (home, find stock, product, for suppliers,
for delivery, templates, pricing).

```
website/
  wp-content/themes/shopinbos/        design: tokens, styles, header/footer, templates, patterns
  wp-content/plugins/shopinbos-core/  behaviour: marketplace pages, content types, tools, forms, schema, sitemaps
  bin/dev.sh                          local WordPress (PHP + SQLite, no MySQL)
  bin/deploy.sh                       rsync theme + plugin to Hostinger over SSH
```

The plan names a separate `Techdella/shopinbos-website` repo. That repo doesn't exist yet, so the code lives
here; `website/` is self-contained and can be moved as-is.

## Run it locally

```bash
website/bin/dev.sh          # first run installs WordPress, runs `wp shopinbos setup --samples`
open http://localhost:8088  # admin / admin at /wp-admin
```

Delete `website/.dev` to start over. Local installs show sample marketplace data (Settings > Shopinbos >
"Use sample marketplace data"), so no app is needed.

## Put it on Hostinger

1. Hostinger **Cloud** plan, install WordPress, PHP 8.1+. Turn on LiteSpeed Cache.
2. Deploy the theme and plugin: `SSH_TARGET=… WP_PATH=… website/bin/deploy.sh` (staging first).
3. Activate the **Shopinbos** theme and **Shopinbos Core** plugin, then on the server:
   `wp shopinbos setup` (add `--samples` on staging only).
4. Settings > Shopinbos: app URL, API base (`https://app.shopinbos.com/api/public`), support WhatsApp number,
   app store links, plan prices, Resend and PostHog keys. Secrets are better as constants in `wp-config.php`:
   `define( 'SIB_RESEND_API_KEY', '…' );` (any setting works as `SIB_` + its key in capitals).
5. Plugins from the plan: Rank Math (SEO, redirects), LiteSpeed Cache, Wordfence or Solid Security (two-step
   login), Tutor LMS (academy). Nothing else.
6. Search Console and Bing: submit `/sitemap_index.xml` (Rank Math) and `/sitemap-marketplace.xml`.

DNS: `shopinbos.com` and `www` → Hostinger; `app.` and `*.shopinbos.com` store subdomains → Vercel.

## What's where

| URL | What renders it |
| --- | --- |
| `/` `/for-suppliers/` `/delivery/` `/pricing/` | Pages built from theme patterns (`patterns/page-*.php`), editable in the block editor |
| `/marketplace/`, `/marketplace/{category}/`, `/marketplace/products/{slug}/`, `/suppliers/{slug}/`, `/delivery/partners/{slug}/` | Virtual pages, server-rendered from the app API (`includes/marketplace.php`, `views/`) |
| `/features/` `/solutions/` `/industries/` `/sell-online/` `/compare/` `/integrations/` | Content types, each starting from a block template of patterns |
| `/templates/` | Store template content type (colours, key, demo URL in the Shopinbos box) |
| `/tools/{tool}/` | Tool content type; pick the tool in the Shopinbos box |
| `/resources/{guide}/` | Guides; gated PDFs move to `uploads/sib-private` and go out by signed 7-day links |
| `/help/`, `/help/{category}/{article}/` | Help centre with instant search, votes, WhatsApp chat button |
| `/blog/` | Posts (`/blog/%postname%/`, categories under `/blog/category/`) |
| `/lp/{campaign}/` | Campaign pages: minimal header, `noindex`, Meta/TikTok pixels after cookie consent |
| `/go/signup?intent=…` | Redirect into the app with intent, `source=website` and first-touch UTMs |

### Marketplace data
- Reads `/products`, `/products/{slug}`, `/categories`, `/suppliers`, `/suppliers/{slug}`,
  `/logistics/partners`, `/logistics/partners/{slug}` from the app's public API.
- Cached 15 minutes. If the API is down the last good copy is served for up to 7 days, and prices are hidden
  once that copy is older than 24 hours. With no copy at all the page answers 503 with Retry-After.
- Deleted products/suppliers/partners that were once in the sitemap answer **410**; out-of-stock products stay
  up with a note. Search results are `noindex`; paginated lists are canonicalised.
- Product page maths matches the prototype: Paystack fee 1.5% + ₦100 (₦100 waived under ₦2,500, capped
  at ₦2,000) on price + ₦2,500 example delivery.

### Sign-up links
Every button points at `/go/…`; nothing in page content hard-codes the app domain.

| Intent | Lands on |
| --- | --- |
| `dropship`, `add`, `request_quote`, `view_products` (+ `productSlug` / `supplierSlug`) | `/signup` → app marketplace |
| `template` (+ `template=breeze`), `plan` (+ `plan`, `billing`), `tool_result` (+ `tool`) | `/signup` |
| `book_delivery` (+ `logisticsSlug`) | `/signup` → app logistics |
| `supplier_signup` | `/supplier/signup` |
| `partner_signup` | `/logistics/signup` |

Each page has a **Primary sign-up intent** in its Shopinbos box; plain "Start your shop" buttons on that page
pick it up automatically. The home hero passes the typed WhatsApp number in the URL fragment
(`#phone=+234…`) so it never reaches server logs.

## For the app team
- `src/lib/intent-routing.js` keeps only `intent, productSlug, supplierSlug, logisticsSlug, categorySlug,
  source`. To complete the new intents after sign-up it also needs `template`, `plan`, `billing`, `tool`,
  and routes for `template`, `plan` and `tool_result` (today they fall through to `/home`).
- Signup could prefill the phone from `#phone=` in the URL fragment.
- Delivery partners show "Pay on delivery" when `deliveryTypes` contains `cod` (or `pay_on_delivery`).

## Still open (from the plan)
Plan prices and fees are placeholders (`[PRICE]`, `[FEE]`) until agreed; legal pages need real text; which
delivery and channel partners can be named publicly; Tutor LMS vs own course type (default Tutor LMS, not
installed here); Resend tags per guide (today confirmed contacts go to one audience; hook `sib_list_added`).

## Checks
`find website/wp-content -name '*.php' -print0 | xargs -0 -n1 php -l` runs in CI (`.github/workflows/website.yml`).
