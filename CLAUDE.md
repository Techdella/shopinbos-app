# Shopinbos — Claude Code instructions

Read `docs/SPEC.md` in full before starting any task. It is the source of truth for product, data model, money rules, screens and build phases.

## Working rules

- Build phase by phase (SPEC section 17). Do not start a phase until the previous phase's acceptance checks pass.
- After each phase: typecheck, lint, unit tests, e2e for that phase. Then commit and open a PR. Never merge without the owner.
- Money is integer kobo everywhere. Never floats. Fees and limits live in `packages/config/business.ts`, never inline.
- Unknown business numbers are `[PLACEHOLDER]`/`[PRICE]` in config. Do not invent them.
- Never commit `.env.local` or any secret. Add every new env var to `.env.example` with a comment.
- Ask the owner before: deleting data, changing money rules, adding a paid service not in the spec, changing auth.
- When the spec is silent, copy the prototype's behaviour. When they disagree, the spec wins. Record decisions as short ADRs in `docs/decisions/`.

## Stack (short)

pnpm + Turborepo monorepo · Next.js App Router on Vercel (`apps/web`: seller web, storefront, portals, admin, API) · Expo apps (`apps/seller`, `apps/riders`, `apps/partners`) · Supabase (Postgres, Auth, Storage, Realtime) via Prisma · Zod · TanStack Query · Tailwind v4 · Paystack · WhatsApp Cloud API · Anthropic API for Rex and Peggy (model ids from env) · QStash + Vercel Cron · Sentry · PostHog.

## API shape

- List: `{ data: T[], meta: { page, limit, total } }`
- Single: `{ data: T }`
- Error: `{ error: { code, message, details? } }`
- Auth: `Authorization: Bearer <supabase-jwt>`; partner API uses `sk_live_…` keys.
- Every handler: Zod input → membership + permission check → service function → DTO.
- Idempotency-Key on money and external-effect POSTs.

## Roles

`seller` (+ staff permissions), `supplier`, `logistics_partner` (owner, dispatcher), `rider`, `admin`.

## Design

Tokens in `packages/tokens` (SPEC section 5): ink `#16141F`, sub `#6B6779`, line `#ECEAF2`, canvas `#F6F5F9`, accent `#FF6A2B`, AI teal `#0C4A44` / `#E2F6F1`. Plus Jakarta Sans. Pill buttons, 24px cards. Sentence case, plain words.

AI names: **Rex** builds; **Peggy** runs the shop. Never use "Chip" (retired).

## Git

Commit messages end with:

```
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```

PR descriptions end with:

```
🤖 Generated with [Claude Code](https://claude.com/claude-code)
```
