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
- [ ] Apply `docs/migrations/2026-10-10-schema-alignment.sql` (staging first) and review the remaining Prisma/database drift.
- [x] Run route smoke checks against a local database: 204/204 pages and API routes pass for every role (`scripts/smoke/`).
- [x] Visual QA of seller, supplier and logistics onboarding at 1440px and 390px; mobile overflow fixed on the path picker and Rex screen.

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
