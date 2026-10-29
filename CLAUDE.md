# Shopinbos App + Marketplace API — Claude Code Instructions

## Production URL

The app lives at **https://app.shopinbos.com** (sellers, suppliers, delivery partners, admin, and stores at
`/s/<slug>`). Use it in docs, scripts, cron jobs, webhook and OAuth callback URLs, emails, and when testing.
Never use the old `shopinbos-app.vercel.app` domain; `*.vercel.app` hosts are only Vercel preview deployments.

Stores live at **`<slug>.mybos.store`** (or the seller's own domain). Use `.mybos.store` for store addresses in
placeholders, samples, demos, previews and copy (e.g. `yourshop.mybos.store`), never `<slug>.shopinbos.com`. In code,
build a real store's address with `buildStorefrontUrl` rather than hard-coding a host.

## Role

You are building the authenticated Shopinbos application, backend, portals, marketplace database, and shared API.
The public marketing website (shopinbos.com, WordPress) lives in `website/` — see `website/README.md`.

Your responsibility:
- Seller app (authenticated)
- AI store builder  
- Supplier marketplace + supplier portal
- Logistics marketplace + logistics partner portal
- Admin panel
- Public marketplace API consumed by the website

---

## Product

Shopinbos is an AI commerce operating system for African businesses.

Sellers can:
- Build online stores with AI (Chip)
- Discover supplier products in the marketplace
- Add products to their store (dropship or wholesale)
- Request quotes from suppliers
- Find and book logistics partners
- Grow with AI recommendations

---

## Tech Stack

- **Framework**: Next.js 16 App Router (TypeScript)
- **Database**: Supabase PostgreSQL via Prisma ORM
- **Auth**: Supabase Auth (JWT with role metadata)
- **Validation**: Zod
- **Styling**: Tailwind v4 with design tokens (navy/mint/cream)
- **Fonts**: Space Grotesk (display), Fraunces (accent), JetBrains Mono (data)
- **AI**: OpenAI / Claude API for Chip assistant

---

## Architecture

```
PostgreSQL (Supabase)
        ↓
  Prisma ORM
        ↓
  Next.js Route Handlers
  ┌─────────────┬───────────────────┐
  │             │                   │
Public API   App API          Portal APIs
/api/public  /api/app         /api/supplier
(no auth)    (role: seller)   /api/logistics
Consumed by                   /api/admin
website
```

---

## Design System

### Colors (Tailwind v4 @theme tokens)

| Token              | Value     | Usage              |
|--------------------|-----------|--------------------|
| `--color-navy`     | `#0E2A38` | Sidebar, dark bg   |
| `--color-mint`     | `#73D8C8` | Primary CTAs, Chip |
| `--color-cream`    | `#F4F1EA` | Light bg           |
| `--color-paper`    | `#FAF7F1` | Page bg            |
| `--color-amber`    | `#F2A93B` | Warning, logistics |
| `--color-coral`    | `#E86A4F` | Error, alert       |
| `--color-teal`     | `#2E7E78` | Success, active    |
| `--color-plum`     | `#6B4F8A` | Admin accent       |
| `--color-muted`    | `#6E6E68` | Secondary text     |

### Fonts

- `font-display` → Space Grotesk  
- `font-accent`  → Fraunces (italic for brand moments)
- `font-mono`    → JetBrains Mono (labels, data, eyebrows)

### UI Conventions

- Cards: `bg-white border border-navy/[0.06]` with `rounded-lg` (radius-lg = 18px)
- Dark panels: `bg-navy text-cream` + `.dot-grid` overlay
- Eyebrow: `font-mono text-[11px] tracking-[0.16em] uppercase text-teal-deep`
- Page title: `font-display text-[30px] font-medium tracking-[-0.025em]`
- Buttons: always `rounded-pill` (999px radius)

---

## API Conventions

### Response Shape

```ts
// Success (list)
{ data: T[], meta: { page: number, limit: number, total: number } }

// Success (single)
{ data: T }

// Error
{ error: { code: string, message: string } }
```

### Authentication

All authenticated routes require:
```
Authorization: Bearer <supabase-jwt>
```

Role read from `user_metadata.role` in the JWT.

### CORS Origins

```
https://shopinbos.com
https://www.shopinbos.com
http://localhost:3000
http://localhost:3001
```

---

## Environment Variables

See `.env.local.example`. Never commit `.env.local`.

Key vars:
- `DATABASE_URL` — Supabase PostgreSQL direct URL
- `DIRECT_URL` — Supabase direct connection (for migrations)
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `JWT_SECRET`
- `OPENAI_API_KEY`

---

## Database

Schema defined in `prisma/schema.prisma`. 14 models.

```bash
npx prisma generate      # regenerate client
npx prisma db push       # sync to Supabase
npx prisma db seed       # seed with African marketplace data
```

---

## Auth Flow

1. User signs up → Supabase Auth creates account
2. Role stored in `user_metadata.role` during signup
3. `User` row created in Prisma DB with `supabaseId`
4. All API calls include Supabase JWT
5. Middleware validates JWT + reads role

### Intent Redirects (from marketing website)

```
/signup?intent=add_product&productSlug=womens-leather-handbag
/signup?intent=dropship&productSlug=ankara-print-fabric
/supplier/signup
/logistics/signup
```

After auth, complete the intended action automatically.

---

## Portal Roles

| Role               | Portal Path  | API Base        |
|--------------------|--------------|-----------------|
| `seller`           | /home        | /api/app        |
| `supplier`         | /supplier    | /api/supplier   |
| `logistics_partner`| /logistics   | /api/logistics  |
| `admin`            | /admin       | /api/admin      |
