# Shopinbos

Commerce operating system for Nigerian sellers: store builder, sourcing and dropshipping,
selling everywhere, delivery with pay on delivery, and two AI agents. **Rex** builds; **Peggy** runs the shop.

- Spec: [`docs/SPEC.md`](docs/SPEC.md) (source of truth). Working rules: [`CLAUDE.md`](CLAUDE.md).
- Setup: [`docs/setup.md`](docs/setup.md). Decisions: [`docs/decisions/`](docs/decisions/).
- The previous app is kept read-only in [`legacy/`](legacy/) for reference (ADR 0001).

## Layout

```
apps/
  web/        Next.js: seller web, storefront, portals, admin, API
  seller/     Expo: Shopinbos (sellers)
  riders/     Expo: Shopinbos Riders
  partners/   Expo: Shopinbos Partners
packages/
  config/       business.ts (fees, limits, placeholders), tsconfig bases, flags
  tokens/       design tokens → tokens.css (web) + theme (native), mascots
  ui-web/       web components + Storybook
  ui-native/    native components (same names)
  validation/   Zod schemas shared by web, mobile and API
  api-client/   typed API client, TanStack Query hooks, mobile auth
  db/           Prisma schema, migrations, RLS SQL, seed
  integrations/ WhatsApp/Termii OTP, Standard Webhooks, rate limits
```

## Build status

| Phase | Scope                                                                         | Status      |
| ----- | ----------------------------------------------------------------------------- | ----------- |
| 0     | Foundation: repo, design system, schema v0 + RLS, phone/email OTP, apps hello | In review   |
| 1–8   | See SPEC section 17                                                           | Not started |

## Commands

```bash
pnpm install
pnpm dev                       # web on :3000
pnpm turbo run typecheck lint test
pnpm test:rls                  # needs RLS_DATABASE_URL
pnpm storybook
```
