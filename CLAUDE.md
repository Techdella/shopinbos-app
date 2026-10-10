# Shopinbos App + Marketplace API — Claude Code Instructions

## Role

You are building the authenticated Shopinbos application, backend, portals, marketplace database, and shared API.
Codex is building the public marketing website separately.

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
- Build online stores with AI (Rex)
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
- **Styling**: Tailwind v4 + CSS variables (ink/teal scale, see Design System)
- **Fonts**: Plus Jakarta Sans (body), Space Grotesk (display), Fraunces (accent), JetBrains Mono (data)
- **AI**: Claude / OpenAI API for Rex (builder) and Peggy (assistant)

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

The live seller, supplier and admin UI uses the **ink/teal scale** defined in
`:root` in `src/app/globals.css`. Use these for new UI. The older
navy/mint/cream `@theme` tokens remain for legacy screens only.

### Colors (CSS variables)

| Token | Value | Usage |
|---|---|---|
| `--teal-700` | `#16746b` | Primary buttons, active nav, links |
| `--teal-900` | `#0c4a44` | Brand dark (matches shopinbos.com) |
| `--teal-100` / `--teal-50` | `#e3f6f1` / `#f1faf7` | Soft fills, Peggy/Rex cards |
| `--ink-900` | `#0f1916` | Primary text |
| `--ink-500` | `#6b7672` | Secondary text |
| `--ink-100` | `#eef0ed` | Card borders, dividers |
| `--canvas` / `--paper` | `#f5f7f3` / `#ffffff` | Page / card background |
| `--success` `--warning` `--danger` `--info` (+ `-bg`) | | Status badges |
| `--amber-500` `--rose-500` `--berry-500` `--indigo-500` (+ `-100`) | | Category accents |

### Fonts (loaded with next/font in `src/app/layout.tsx`)

- `--font-sans` → Plus Jakarta Sans (body/UI, via `--font-jakarta`)
- `--font-display` → Space Grotesk (headings, big numbers)
- `--font-accent` → Fraunces (money, brand moments)
- `--font-mono` → JetBrains Mono (labels, data, eyebrows; via `--font-jetbrains`)

Never reference a font by its literal family name — next/font hashes it.

### UI Conventions

- Cards: `.card` — white, `1px solid var(--ink-100)`, 16px radius, `var(--shd-xs)`
- Buttons: `.btn` / `.dbtn` — 10px radius, teal-700 primary, ghost = white + ink-150 border
- Tables: `.tbl` — uppercase 11.5px headers on `--ink-50`
- Badges: `.badge` + `.badge-success|warn|danger|info|mint|soft`
- Sidebar: 240px, white, ink-100 right border

### AI assistants

- **Rex** — builds things (store builder, onboarding). Mascot: mint dinosaur, `public/brand/mascots/rex-*.png`.
- **Peggy** — runs the shop day to day (assistant, drafts, tips). Mascot: penguin, `public/brand/mascots/peggy-*.png`.
- "Chip" is a retired name still present in some code (`/chip` route, `ChipAvatar`, `chipMode`). Don't use it in new UI copy.

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

Schema defined in `prisma/schema.prisma` (56 models).

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
