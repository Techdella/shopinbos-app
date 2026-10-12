# Shopinbos — AI Commerce OS for African Businesses

**Rex builds your shop. Peggy runs it.**

Shopinbos is the AI commerce operating system for African businesses. A seller signs up, tells Rex what they sell in one sentence, and gets a branded mobile-first storefront live in under ten minutes.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Next.js 16 App Router                    │
│                                                             │
│  /api/public/*    → Read-only marketplace API (no auth)     │
│  /api/app/*       → Seller API (role: seller)               │
│  /api/supplier/*  → Supplier API (role: supplier)           │
│  /api/logistics/* → Logistics API (role: logistics_partner) │
│  /api/admin/*     → Admin API (role: admin)                 │
│  /api/ai/*        → AI endpoints (Rex + Peggy)              │
│  /api/webhooks/*  → Payment/Social webhook handlers         │
│                                                             │
│  /s/{slug}        → Public storefront rendering             │
│  /home/*          → Seller dashboard                        │
│  /supplier/*      → Supplier portal                         │
│  /logistics/*     → Logistics partner portal                │
│  /admin/*         → Admin panel                             │
│  /builder/*       → AI store builder (Rex)                  │
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────┐
│              Prisma ORM → Supabase PostgreSQL                │
│  Users · Stores · Suppliers · Products · Orders · Logistics │
└─────────────────────────────────────────────────────────────┘
```

## Tech Stack

- **Framework:** Next.js 16 (App Router) with TypeScript
- **Database:** Supabase PostgreSQL via Prisma ORM (14 models)
- **Auth:** Supabase Auth (JWT with role metadata)
- **Validation:** Zod
- **Styling:** Tailwind v4 with custom design tokens
- **Fonts:** Space Grotesk (display), Fraunces (accent), JetBrains Mono (data)
- **AI:** OpenAI GPT / Anthropic Claude (Rex store builder + Peggy writer)
- **Payments:** Paystack (with Flutterwave, Opay, M-Pesa scaffolded)
- **Storage:** Supabase Storage (R2/S3-compatible)

## Getting Started

```bash
# Install dependencies
npm install

# Generate Prisma client
npm run prisma:generate

# Copy and configure environment
cp .env.local.example .env.local
# Edit .env.local with your Supabase credentials

# Push schema to database
npm run db:push

# Seed with African marketplace data
npm run db:seed

# Start development server
npm run dev
```

### Prerequisites

- Node.js 20+
- Supabase project (free tier works)
- PostgreSQL database (via Supabase)

## Environment Variables

See `.env.local.example` for all required variables. Key ones:

| Variable | Description |
|---|---|
| `DATABASE_URL` | Prisma connection pooling URL (Supabase) |
| `DIRECT_URL` | Direct DB URL for migrations |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anonymous key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key |
| `JWT_SECRET` | Must match Supabase JWT secret |
| `OPENAI_API_KEY` | For Rex/Peggy AI features |
| `ANTHROPIC_API_KEY` | Alternative AI provider |
| `NEXT_PUBLIC_ROOT_DOMAIN` | Root domain for storefronts |

## Database

Schema defined in `prisma/schema.prisma` — 14 models, 8 enums.

```bash
npm run db:generate    # Regenerate Prisma client
npm run db:push        # Sync schema to database
npm run db:seed        # Seed with African marketplace data
```

### Models

- **User** — Core user with role (seller/supplier/logistics_partner/admin)
- **Store** — One per seller, brand settings, slug, custom domain
- **StorePage** — CMS pages per store (home, products, about, contact)
- **Supplier** — Business profile, verification, trust score
- **Category** — Hierarchical product categories
- **SupplierProduct** — Marketplace products with pricing tiers, MOQ, trend score
- **StoreProduct** — Products added to a seller's store
- **DropshipRelationship** — Links seller↔supplier↔product for dropship
- **SupplierQuoteRequest** — Bulk quote requests from sellers to suppliers
- **WholesaleOrder** — Bulk wholesale orders
- **LogisticsPartner** — Delivery company profiles
- **DeliveryQuoteRequest** — Delivery quote requests
- **DeliveryBooking** — Actual delivery bookings with tracking
- **RetailOrder** — End-customer orders with Paystack integration

## Roles

| Role | Portal | API Base | Description |
|---|---|---|---|
| `seller` | `/home/*` | `/api/app/*` | Store owner |
| `supplier` | `/supplier/*` | `/api/supplier/*` | Wholesaler/manufacturer |
| `logistics_partner` | `/logistics/*` | `/api/logistics/*` | Delivery company |
| `admin` | `/admin/*` | `/api/admin/*` | Platform operator |

## AI Features

- **Rex** — Store builder: generates complete storefronts from one sentence
- **Peggy** — Writer: SEO content, product descriptions, blog articles
- **Logo generation** — 3 AI-generated logo variants per request
- **Color palettes** — AI-designed 5-color brand palettes
- **Audio transcription** — Voice input for onboarding

## API Response Format

```typescript
// List responses
{ data: T[], meta: { page: number, limit: number, total: number } }

// Single responses
{ data: T }

// Error responses
{ error: { code: string, message: string, details?: any[] } }
```

## Testing

```bash
npm test              # Run API integration tests
# Requires the dev server to be running
```

## Build Phases

| Phase | Status | Description |
|---|---|---|
| 0 — Foundations | ✅ Complete | Monorepo, Prisma schema, auth, portals scaffolded |
| 1 — Seller Core | ✅ Complete | Onboarding, Rex builder, products CRUD, orders, payments |
| 2 — Marketplace | ✅ Complete | Browse, dropship, wholesale, quotes |
| 3 — Peggy MVP | ✅ Complete | Chat, tools, preferences, daily brief |
| 4 — Logistics | ✅ Complete | Quote requests, bookings, tracking |
| 5 — Social Selling | ✅ Complete | WhatsApp, Instagram, TikTok connections |
| 6 — Multi-Currency | ✅ Complete | FX rates, multi-currency checkout |
| 7 — Templates | ✅ Complete | Importer CLI, admin approval, Rex adaptation |
| 8 — Mobile MVP | ✅ Complete | Seller, supplier, logistics mobile apps |
| 9 — i18n | Built | Multi-language UI |
| 10 — Advanced AI | Built | Photo upgrade, bulk jobs, evals |
| 11 — Enterprise | Built | Multi-store, custom agents, FX hedging |

## Design System

See `CLAUDE.md` and `src/app/globals.css` for full design tokens.

| Token | Value | Usage |
|---|---|---|
| `--color-navy` | `#0E2A38` | Sidebar, dark backgrounds |
| `--color-mint` | `#73D8C8` | Primary CTAs, Rex |
| `--color-cream` | `#F4F1EA` | Light backgrounds |
| `--color-paper` | `#FAF7F1` | Page background |
| `--color-amber` | `#F2A93B` | Warnings, logistics |
| `--color-coral` | `#E86A4F` | Errors, alerts |

## Key Directories

```
src/
├── app/              # Next.js App Router pages + API routes
│   ├── api/          # All API endpoints (public, app, supplier, logistics, admin, ai, webhooks)
│   ├── home/         # Seller dashboard
│   ├── supplier/     # Supplier portal
│   ├── logistics/    # Logistics portal
│   ├── admin/        # Admin panel
│   ├── builder/      # AI store builder
│   ├── s/            # Public storefront
│   └── marketplace/  # Marketplace browsing
├── components/       # Reusable React components
├── hooks/            # Custom hooks (useCart, etc.)
├── lib/              # Server utilities, auth, DB client, AI clients
│   ├── ai/           # AI clients (OpenAI, Anthropic)
│   ├── api/          # API utilities (CORS, cache, response helpers)
│   ├── auth/         # Auth middleware, types, JWT verification
│   ├── db/           # Prisma client singleton
│   ├── supabase/     # Supabase browser + server clients
│   └── store-templates/ # Template system
├── proxy.ts          # Next.js 16 Proxy (auth + storefront routing)
└── actions/          # Server Actions for forms
prisma/
├── schema.prisma     # Database schema
└── seed.ts           # African marketplace seed data
tests/                # API + integration tests
```

## Deployment

- **Web:** Vercel (atomic deploys)
- **Mobile:** EAS Build + EAS Submit
- **Database:** Supabase managed PostgreSQL
- **Storage:** Supabase Storage (S3-compatible)

## License

Proprietary — Shopinbos Inc.
