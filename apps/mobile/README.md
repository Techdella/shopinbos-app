# Shopinbos mobile (Expo)

The seller app for iOS and Android. It is built alongside the web app and talks to the same backend: Supabase Auth for sign-in, and the Next.js `/api` routes on app.shopinbos.com for everything else, authenticated with the Supabase access token as a `Bearer` header.

Screens follow the 2026 app prototypes, the same designs as the web screens:

| Area | Screens |
| --- | --- |
| Sign in | Welcome (Rex), create account (phone or email), enter code, log in (phone code, email code, password, Google), forgot password |
| Seller onboarding | Chat with Rex (5 languages) → brand (name, colours, look) → first products from photos → payments and delivery → launch fee (Paystack) → shop is live (share, QR poster) → finish setting up |
| Seller app | Home (sales, Peggy's tasks, quick actions, checklist, best sellers), Products, Chats, Orders and More tabs; "+" adds products from photos; order details (mark paid, sent, delivered; WhatsApp or call the buyer); record a sale; Ask Peggy |

Design tokens, phone helpers and onboarding copy come from `../../shared`, so web and mobile stay in step.

## Run it

```bash
cd apps/mobile
npm install
cp .env.example .env.local      # add the Supabase anon key
npx expo start                  # press i / a, or scan with Expo Go
npm run typecheck
npx expo-doctor
```

`EXPO_PUBLIC_API_URL` defaults to https://app.shopinbos.com. Point it at your machine's LAN address to use a local `npm run dev`.

## Supabase settings the app needs

Run `node scripts/configure-supabase-auth.mjs` from the repo root (see the script header). It adds `shopinbos://**` to the redirect allow-list and switches on Google and Twilio when their keys are set.

- **Google sign-in:** create an OAuth client in Google Cloud, then set `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` for the script, or add them under Auth → Providers → Google.
- **Phone codes:** WhatsApp codes need Twilio (or Twilio Verify) with a WhatsApp sender. SMS works with any Supabase SMS provider.
- **Email codes:** the Magic Link and Confirm signup email templates must include `{{ .Token }}`.

## Builds

Native folders are generated (Continuous Native Generation), so don't commit `ios/` or `android/`. Build with EAS: `npx eas-cli@latest build --profile development`. App ids are `com.shopinbos.app` on both platforms, and the deep-link scheme is `shopinbos`.

This folder is outside the web app's TypeScript project and its Next.js build. Vercel only installs the root package.

## Not in the app yet

Tools that open the web app for now: booking a rider, labels, the store editor, campaigns, ads, video studio, affiliates, payments and settings. `openWeb()` passes the app's session to `/auth/handoff`, so the seller stays signed in there (for up to an hour per open).

- Voice notes in the Rex chat (shows "coming soon"; the web app records them)
- Instagram product import (coming soon on web too)
- Spreadsheet import and the supplier marketplace open the web app
