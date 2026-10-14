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
2. In hPanel > Advanced > **SSH Access**: turn SSH on, note host, port (usually 65002) and username, and
   add a deploy public key (`ssh-keygen -t ed25519 -f hostinger_deploy -N ""`; paste `hostinger_deploy.pub`).
3. In GitHub > Settings > **Environments**, create `staging` and `production`, each with secrets
   `HOSTINGER_SSH_HOST`, `HOSTINGER_SSH_PORT`, `HOSTINGER_SSH_USER`, `HOSTINGER_SSH_KEY` (the private key)
   and `HOSTINGER_WP_PATH` (e.g. `domains/shopinbos.com/public_html`).
4. Actions > **Website deploy (Hostinger)** > Run workflow > staging. (From a laptop instead:
   `SSH_TARGET=user@host SSH_PORT=65002 SSH_KEY_FILE=~/.ssh/hostinger_deploy WP_PATH=… website/bin/deploy.sh`.)
5. First deploy only, over SSH: `wp theme activate shopinbos && wp plugin activate shopinbos-core && wp shopinbos setup`
   (add `--samples` on staging only).
6. Settings > Shopinbos: app URL, API base (`https://app.shopinbos.com/api/public`), support WhatsApp number,
   app store links, plan prices, Resend and PostHog keys. Secrets are better as constants in `wp-config.php`:
   `define( 'SIB_RESEND_API_KEY', '…' );` (any setting works as `SIB_` + its key in capitals).
7. Plugins from the plan: Rank Math (SEO, redirects), LiteSpeed Cache, Wordfence or Solid Security (two-step
   login). Nothing else. The Academy is built in (no LMS plugin needed).
8. Search Console and Bing: submit `/sitemap_index.xml` (Rank Math) and `/sitemap-marketplace.xml`.

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
| `/blog/` | Blog home and posts (`/blog/%postname%/`, categories under `/blog/category/`). Posts use the article blocks |
| `/academy/`, `/academy/{track}/`, `/academy/{track}/{lesson}/` | Academy: tracks (`sib_track`) and lessons (`sib_lesson`), progress saved on the visitor's phone |
| `/legal/` and `/legal/{document}/` | Legal documents (child pages of Legal, "Legal document" template) |
| `/about/` `/careers/` `/press/` | About (pattern `page-about`), careers and press text pages |
| `/lp/{campaign}/` | Campaign pages: minimal header, `noindex`, Meta/TikTok pixels after cookie consent |
| `/go/signup?intent=…` | Redirect into the app with intent, `source=website` and first-touch UTMs |

### Writing content

- **Blog posts:** use the blocks in **Shopinbos · Article** (callout, did you know, stats, checklist, steps, inline CTA,
  quote, do and don't, FAQ, takeaways). FAQ and Steps blocks also add FAQ/HowTo schema. In the post's custom fields,
  `sib_featured` = 1 makes it the lead story, `sib_lesson` (a lesson slug) shows the "Free lesson" card, and
  `sib_cover_fit` = contain suits cut-out photos. Category colours are term meta `sib_bg` / `sib_fg`.
- **Academy lessons:** each lesson is one **Lesson** block. Fill it in from the block sidebar: English and Pidgin intro,
  what you'll learn, steps (`heading | description`), try it, checklist, quick check, optional YouTube video. Order
  lessons with *Order* (page attributes). Track colours and icon are term meta (`sib_bg`, `sib_fg`, `sib_icon`, `sib_order`).
- **Legal:** each document has an "In plain words" block, then one group per section (class `lgl-sec`) with an H2,
  paragraphs and an "In short" paragraph (class `in-short`). Sections number themselves. Dates are page custom fields
  `sib_updated` and `sib_effective`.
- **Prices and fees** come from Settings > Shopinbos. Use `[sib_price key="price_grow_month"]` (or `fee_commission`,
  `fee_supplier`, `fee_partner`, `fee_broadcast`, `fee_video`, `starter_products`) in any text.

`wp shopinbos setup` creates all of this on a fresh site and replaces the first-install placeholder pages
(About, Careers, Press, Legal, the old Academy page) on an existing one. Pages someone has edited are left alone.

### Content from Google Docs

`tools/` turns the team's Google Docs into site content (needs pandoc, python3 with bs4 and Pillow, and Playwright):

- `python3 tools/convert.py article.docx` gives block markup plus meta title, description, slug and keyword. SEO briefs,
  keyword lists, internal-link notes and social posts are dropped from the body; FAQ sections become FAQ blocks;
  "Shopping Boss" becomes Shopinbos. Add the result to `plugins/shopinbos-core/includes/seed/articles.json`.
- `python3 tools/make_pdfs.py <folder of .docx> wp-content/themes/shopinbos <work>` then
  `node tools/print_pdfs.js <work>` prints branded PDFs (cover, contents, pages with header and page numbers, back
  page). Copy `<work>/pdf/*.pdf` and the cover images into `includes/seed/pdfs/` and the manifest into `seed/resources.json`.

`wp shopinbos setup` imports both, skipping any slug that already exists, so posts already on the live site are
never duplicated or overwritten. PDFs move to the private uploads folder and are only sent by signed link after the form.

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

## How the app finishes each intent
`src/lib/intent-routing.js` carries `intent, productSlug, supplierSlug, logisticsSlug, categorySlug, source,
template, plan, billing, tool` through sign-up and onboarding, then:

| Intent | After sign-up |
| --- | --- |
| `add`, `add_product`, `dropship`, `request_quote`, `view_products` | `/marketplace` with the product or supplier |
| `template` | `/builder/templates?template=…`, with that theme open in preview |
| `plan` | `/home/settings?tab=Billing&plan=…&billing=…` |
| `import` | `/home/imports` |
| `book_delivery` | `/home/logistics` with the partner |
| `tool_result` | `/home` |

Sign-up prefills the phone number from the website's `#phone=` fragment and shows the theme or plan the
visitor picked. Delivery partners show "Pay on delivery" when `deliveryTypes` contains `cod`.

## Still open (from the plan)
Legal documents are the canvas drafts and need a lawyer's review before launch. The Pidgin in Academy lessons
should be read by a native speaker. No lesson videos exist yet (lessons show "Read in a few minutes" until a
YouTube ID is added). Which delivery and channel partners can be named publicly; Resend tags per guide (today
confirmed contacts go to one audience; hook `sib_list_added`); Sunday WhatsApp sign-ups fire `sib_lead_whatsapp`
until the app's `/api/public/leads` exists.

## Checks
`find website/wp-content -name '*.php' -print0 | xargs -0 -n1 php -l` runs in CI (`.github/workflows/website.yml`).
