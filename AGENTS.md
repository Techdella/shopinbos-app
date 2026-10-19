<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

<!-- BEGIN:session-summary -->
# Session Summary

## Pages & Content Management (Current)
- Rewrote `/home/pages/page.tsx` — system-generated items removed, status badges now gate on store status (Draft · Store Not Live shown when store is unpublished), Edit routes to `/home/pages/[id]`, SEO status column added
- Created `/home/pages/[id]/page.tsx` — Page Details server page with AppFrame wrapper
- Created `/home/pages/[id]/PageDetailsClient.tsx` — Full page details UI with Details/SEO/Navigation tabs, publishing controls, preview/live URLs, Save/Publish/Delete actions
- Created `PATCH /api/store/pages/[id]/route.ts` — API endpoint for updating pages (title, slug, content, isPublished, seo, navigation fields) plus DELETE endpoint
- Created `GET /api/store/pages/[id]/route.ts` — Returns page data + store status

## Visual Section Previews (Current)
- Created `SectionPreview.tsx` — `SectionPreviewCard` renders an SVG-based layout preview for each section kind (hero-split, featured-products, testimonials, newsletter, etc.) with color-coded blocks and item indicators. `SectionPreviewPopover` wraps any element and shows the preview card on hover.
- Wired into `EditorClient.tsx` section library — each section entry shows a preview popover on hover
- Wired into `StoreEditor.tsx` elements sidebar and section picker modal — element items with `TEMPLATE_KIND_BY_ELEMENT` mappings show preview popovers

## Previous Completed Work
- Upgraded useCart with variant support (`variant`, `maxQuantity`; `add`/`remove`/`update` keyed on productId+variant)
- Upgraded ProductDetailClient: Buy Now, stock warnings, configurable cart labels, wishlist toggle
- Upgraded CheckoutClient: multi-step mobile-first (Contact → Delivery → Review & Pay), transparent fee breakdown
- Built FulfillmentPanel: status timeline, logistics selection, tracking code; PATCH endpoint for shippedAt/deliveredAt
- Upgraded OrderConfirmation: order timeline dots, tracking display, color-coded badges
- Restructured seller sidebar (nav.ts): Website/Catalog/Commerce/Operations/Marketing/Settings
- Created categories CRUD page at `/home/categories` with API endpoints
- Created cart system-route info at `/home/commerce/cart`
- Created taxes stub at `/home/taxes`
- Upgraded SetupBanner with full setup checklist

## Completed This Session
- Schema: Added `status` (draft/published/hidden/scheduled/archived), `draftContent`, `publishedContent`, `publishAt`, `archivedAt` to StorePage model
- Publish API (`/api/store/editor/publish`): Now sets `status: "published"`, `publishedContent`, preserves `draftContent`
- Page API (`/api/store/pages/[id]`): PATCH saves to `draftContent` instead of `content`, supports `status` changes and scheduling
- Storefront rendering (`StorefrontClient`): `buildPublishedPagesSnapshot` prefers `publishedContent` over `content`
- Preview route (`/preview/store/[slug]/[pageId]`): New page that renders single-page draft preview with "Preview Mode" banner
- PageDetailsClient: Added Scheduling tab (publishAt datetime, schedule/cancel), Archive/Restore, Unsaved draft changes indicator, individual Publish/Unpublish buttons
- Pages list: Preview button now points to `/preview/store/${slug}/${id}` for draft pages
- SectionPreview: SVG layout icons for all section kinds, wired into both editors' component pickers

## Key Decisions
- Page Details is at `/home/pages/[id]` — separates CMS from the visual builder
- Store publishing status (`store.status`) gates page visibility — if store is unpublished, no page shows Published
- Edit button on pages list → `/home/pages/[id]` (Page Details), not the builder directly
- Builder is entered only from "Edit Page Design" inside Page Details
- Section previews use inline SVG layout icons per kind, shown in hover popovers
- Legal pages shown separately at bottom of pages list
- Draft edits (SEO, nav) go into `draftContent`; publish snapshots go into `content` + `publishedContent`
- Per-page previews render at `/preview/store/[slug]/[pageId]` using a single-page snapshot
<!-- END:session-summary -->

## Product analytics (Mixpanel, also PostHog / GA4 when their keys are set)

Shopinbos's own analytics run on the app and portals only, never on sellers' storefronts. Keys come from env
(`NEXT_PUBLIC_MIXPANEL_TOKEN`, see `.env.local.example`); never hardcode a token. Identity is the Supabase user id
(`identify` on sign-in, `reset` on sign-out, `src/components/analytics/ProductAnalytics.tsx`); never an email, name
or phone, and no personal data in event properties.

| Event | Sent from | Properties |
|---|---|---|
| `$mp_web_page_view` | browser, each app page | — |
| `sign_up_completed` | server, `onAccountCreated` (src/lib/lead-growth/service.server.ts) | `role`, `from_lead` |
| `lead_captured` | server, website lead form | `kind`, `source`, `utm_*` |
| `store_published` | server, `publishStoreDraft` | `is_first_publish` |
| `product_added` | server, every seller product create (not Rex's draft samples) | `source`, `product_count`, `is_from_supplier` |
| `first_order_received` | server, first paid or pay-on-delivery order (`$insert_id` per store) | `order_total`, `currency`, `payment_method` |

Seller events go through `src/lib/platform-analytics/seller-events.server.ts` (runs after the response, never
throws). New events: snake_case, past-tense verb + noun, booleans prefixed `is_`, fired only after the action succeeds,
one event per bulk action (never inside a loop).
