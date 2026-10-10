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

1. Create the project in the region closest to Lagos (open question 9).
2. **Auth → Providers → Phone:** on. The SMS provider doesn't matter, because the hook replaces it.
3. **Auth → Hooks → Send SMS:** HTTPS, URL `https://app.shopinbos.com/api/auth/hooks/send-sms`.
   Generate the secret and set it as `SUPABASE_AUTH_HOOK_SECRET` in Vercel.
4. **Auth → Providers → Email:** on. Edit the "Magic link" template so it sends the code, not a link:
   `Your Shopinbos code is {{ .Token }}`.
5. **Auth → Phone → Test phone numbers:** add a test number and code for e2e (`E2E_TEST_PHONE`, `E2E_TEST_OTP`).
6. Keep the default asymmetric JWT signing keys. The API verifies tokens against the project JWKS.
7. Migrations: `DIRECT_URL=… pnpm db:migrate`. This creates the tables, the RLS policies (`packages/db/sql/0002_rls.sql`)
   and the storage buckets (`0003_storage.sql`).

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

Set `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` as EAS env vars.
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
