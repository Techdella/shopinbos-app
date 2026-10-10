# Setup (phase 0)

What the owner sets up, and how to check it works. Accounts are listed in SPEC 2.1.

## Local development

```bash
corepack enable            # pnpm 10 via packageManager
pnpm install
cp .env.example apps/web/.env.local   # fill in Supabase keys and DATABASE_URL
pnpm db:migrate            # prisma migrate deploy
pnpm db:seed               # Adaeze Studio, Aba Leatherworks, Swift Dispatch
pnpm dev                   # http://localhost:3000
```

Store subdomains work locally: `http://adaeze.localhost:3000` serves the seeded store.

With no WhatsApp or Termii keys and `NODE_ENV=development`, the Send SMS hook prints the code
to the server log instead of sending it.

## Supabase

Shopinbos uses the existing project **`zdnwdkykcqaarlpwqjow`**. It also holds the legacy app's tables in `public`.
Everything new lives in the `shopinbos` schema (ADR 0006).

1. **Back up the database first** (Database → Backups), then apply migrations with the direct connection:
   `DIRECT_URL="postgresql://…:5432/postgres?schema=shopinbos" pnpm db:migrate`.
   This creates the `shopinbos` schema, tables, RLS policies and the `sb-*` storage buckets, and touches nothing in `public`.
   Then `pnpm db:seed` for the demo world (optional on production).
2. **Auth → Providers → Phone:** on. The SMS provider doesn't matter, because the hook replaces it.
3. **Auth → Hooks → Send SMS:** HTTPS, URL `https://app.shopinbos.com/api/auth/hooks/send-sms`.
   Generate the secret and set it as `SUPABASE_AUTH_HOOK_SECRET` in Vercel.
4. **Email codes:** the "Magic link" template must contain `{{ .Token }}` to send a code. It's shared with the legacy app,
   so change it only when the legacy app no longer depends on magic links.
5. **Auth → Phone → Test phone numbers:** add a test number and code for e2e (`E2E_TEST_PHONE`, `E2E_TEST_OTP`).
6. The API verifies tokens with `supabase.auth.getClaims` (JWKS for asymmetric keys, with a server check for legacy HS256 keys).

## WhatsApp OTP (platform number)

Create an **authentication** template named `shopinbos_otp` (language `en`) with a copy-code button,
and set `WHATSAPP_PHONE_NUMBER_ID`, `META_SYSTEM_USER_TOKEN`, `WHATSAPP_OTP_TEMPLATE`.
SMS fallback: `TERMII_API_KEY`, `TERMII_SENDER_ID` (sender ID approval takes days).

## Vercel

- New project from this repo, **root directory `apps/web`**, framework Next.js.
  Install and build commands come from `apps/web/vercel.json`.
- Domains: `app.shopinbos.com`, plus the wildcard `*.shopinbos.com` (needs the domain's nameservers on Vercel).
- Env vars: everything in `.env.example` under Core, Supabase, Messaging and Jobs.

## Expo / EAS

For each of `apps/seller`, `apps/riders`, `apps/partners`:

```bash
cd apps/seller
npx eas init                 # links the EAS project and writes its id into app.json
npx eas build --profile development --platform ios     # or android
```

Set `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` as EAS env vars.
Phone sign-in on a dev build: `maestro test -e PHONE=… -e OTP=… .maestro/sign-in.yaml`.

## Storybook

`pnpm storybook` locally. CI deploys it to GitHub Pages on pushes to `main`. Turn on
**Settings → Pages → Source: GitHub Actions** once.

## Checks

```bash
pnpm turbo run typecheck lint test
RLS_DATABASE_URL=postgresql://postgres@localhost:5432/postgres pnpm test:rls
pnpm --filter @shopinbos/web build && pnpm --filter @shopinbos/web e2e
```
