# Shopinbos mobile (Expo)

The seller app for iOS and Android. It is built alongside the web app and talks to the same backend: Supabase Auth for sign-in, and the Next.js `/api` routes on app.shopinbos.com for everything else, authenticated with the Supabase access token as a `Bearer` header.

Screens follow the 2026 app prototypes, the same designs as the web screens:

| Area | Screens |
| --- | --- |
| Sign in | Welcome (Rex), create account (phone or email), enter code, log in (phone code, email code, password, Google), forgot password |
| Seller onboarding | Chat with Rex (5 languages) → brand (name, colours, look) → first products from photos → payments and delivery → launch fee (Paystack) → shop is live (share, QR poster) → finish setting up |
| Seller app | Home (sales, Peggy's tasks, quick actions, checklist, best sellers), Products, Chats, Orders and More tabs; "+" adds products from photos; order details (mark paid, sent, delivered; WhatsApp or call the buyer); record a sale; Ask Peggy |
| Selling tools | Start here checklist; Chats = the all-in-one inbox (every channel, Open / Unread / Snoozed / Done, reply or private note, snooze, done) with Auto-replies and Peggy chatbot settings; partner messages (suppliers, logistics); Find products (Nigeria / China · 1688 / Trending, Cost / Sell / You keep, dropship price stepper, wholesale quotes, add to store); Reviews (reply, Peggy drafts, review links to share); Marketing (campaign stats, discount codes, email templates); Rex Studio chat; Legal pages; store link to share |

Design tokens, phone helpers and onboarding copy come from `../../shared`, so web and mobile stay in step.

## Run it

```bash
cd apps/mobile
npm install
cp .env.example .env.local      # add the Supabase anon key
npx expo start                  # press i / a, or scan with Expo Go
npm run typecheck
npm run lint                    # expo lint (eslint-config-expo)
npx expo-doctor
```

`EXPO_PUBLIC_API_URL` defaults to https://app.shopinbos.com. Point it at your machine's LAN address to use a local `npm run dev`.

## Supabase settings the app needs

Run `node scripts/configure-supabase-auth.mjs` from the repo root (see the script header). It adds `shopinbos://**` to the redirect allow-list and switches on Google sign-in and SMS phone codes (Supabase's Send SMS hook → the app's Termii / Africa's Talking / Sendchamp account) when their keys are set.

- **Google sign-in:** create an OAuth client in Google Cloud, then set `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` for the script, or add them under Auth → Providers → Google.
- **Phone codes:** SMS codes go through the Send SMS hook (`/api/webhooks/supabase-sms`) and the platform SMS provider. WhatsApp codes aren't sent by these providers, so ask for SMS.
- **Email codes:** the Magic Link and Confirm signup email templates must include `{{ .Token }}`.

## Builds

Native folders are generated (Continuous Native Generation), so don't commit `ios/` or `android/`. Build with EAS (profiles in `eas.json`):

1. Once, from `apps/mobile`: `npx eas-cli@latest init`. It creates the Expo project and writes `extra.eas.projectId` into `app.json`; commit that. Push notifications need the project id to get a token (`src/lib/push.ts`).
2. Add the app's settings as EAS environment variables in the `preview` and `production` environments, which `eas.json` maps to each profile: `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_SUPPORT_WHATSAPP`.
3. `npx eas-cli@latest build --profile preview` builds an installable test app: an APK for Android, ad hoc for registered iPhones. `--profile simulator` builds for the iOS simulator. `--profile production` builds for the stores, and the build number goes up by itself.
4. `npx eas-cli@latest credentials` sets up the APNs key (iOS push) and the FCM key (Android push), which Expo's push service needs.
5. `npx eas-cli@latest submit --profile production` uploads to App Store Connect / Google Play. App ids are `com.shopinbos.app` on both platforms, and the deep-link scheme is `shopinbos`.

This folder is outside the web app's TypeScript project and its Next.js build. Vercel only installs the root package.

## Not in the app yet

Tools that open the web app for now: booking a rider, labels, the store editor, campaigns, ads, video studio, affiliates, payments and settings. `openWeb()` passes the app's session to `/auth/handoff`, so the seller stays signed in there (for up to an hour per open).

- Voice notes in the Rex chat (shows "coming soon"; the web app records them)
- Instagram product import (coming soon on web too)
- Spreadsheet import and the supplier marketplace open the web app
