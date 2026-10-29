# iPhone app: App Store setup

Everything needed to put the Expo app (`apps/mobile`) on the App Store. The app is already set up for iOS: bundle id
`com.shopinbos.app`, Sign in with Apple, permission texts, push, account deletion, no in-app digital sales
(`docs/store-payments-audit.md`), and EAS build profiles. What's left is the Apple side, in this order.

## 1. App Store Connect app record

App Store Connect › Apps › + › New App:

| Field | Value |
| --- | --- |
| Platform | iOS |
| Name | `listing/name.txt` (Shopinbos: Sell Online) |
| Primary language | English (U.K.) |
| Bundle ID | com.shopinbos.app (register it first under Certificates, IDs & Profiles › Identifiers if it isn't listed; `eas build` also registers it) |
| SKU | shopinbos-ios |

Then note two numbers:

- **Apple ID of the app**: App Information › General › Apple ID (numeric, like 6741234567).
- **Team ID**: developer.apple.com › Membership details (10 characters, like AB12CD34EF).

## 2. Settings that use those numbers

| Where | Setting | Value |
| --- | --- | --- |
| Vercel (Production) | `APPLE_TEAM_ID` | the Team ID. Serves https://app.shopinbos.com/.well-known/apple-app-site-association, so app.shopinbos.com links open the app (`shared/app-links.ts`). |
| expo.dev › Environment variables (`production`, and `preview` for test builds) | `EXPO_PUBLIC_IOS_APP_STORE_URL` | `https://apps.apple.com/app/id<Apple ID>`. iPhone builds made with it check Admin › App updates and open the App Store from "Update now". |
| `apps/mobile/eas.json` › `submit.production.ios` | `ascAppId`, `appleTeamId` | the Apple ID and the Team ID, so `eas submit` doesn't ask. Commit them (they aren't secrets). |

```json
"submit": {
  "production": {
    "android": { "track": "internal", "releaseStatus": "draft" },
    "ios": { "ascAppId": "6741234567", "appleTeamId": "AB12CD34EF" }
  }
}
```

After deploying the web app, check the file opens as JSON (no redirect, no sign-in):

```bash
curl -i https://app.shopinbos.com/.well-known/apple-app-site-association
```

Apple fetches it through its CDN when the app is installed or updated. `https://app-site-association.cdn-apple.com/a/v1/app.shopinbos.com` shows Apple's copy.

## 3. Build and send to TestFlight

From `apps/mobile`:

```bash
npx eas-cli@latest credentials --platform ios
```

Sign in with the Apple account. Let EAS create the distribution certificate and provisioning profile, and the APNs key
for push. It also turns on the capabilities the app uses (Sign in with Apple, Push Notifications, Associated Domains).
For `eas submit` without a password prompt, also add an App Store Connect API key (Users and Access › Integrations ›
App Store Connect API, role App Manager).

```bash
npx eas-cli@latest build --platform ios --profile production
```

```bash
npx eas-cli@latest submit --platform ios --profile production --latest
```

The build shows up in App Store Connect › TestFlight after Apple processes it (about 15 minutes). Add the team as
internal testers. Test sign-in (Apple, Google, email, phone code), push, the camera, the Peggy call and a universal
link (send yourself https://app.shopinbos.com/home/orders in Notes and tap it).

## 4. The listing

App Store Connect › the app › the version:

| Field | File |
| --- | --- |
| Promotional text (170) | `listing/promotional-text.txt` |
| Description (4000) | `listing/description.txt` |
| Keywords (100) | `listing/keywords.txt` |
| Subtitle (30) | `listing/subtitle.txt` |
| Support URL | a shopinbos.com page with contact details (support@shopinbos.com); Apple checks it opens |
| Marketing URL | https://shopinbos.com |
| Privacy policy URL | https://shopinbos.com/legal/privacy |
| Category | Business (primary), Shopping (secondary) |
| Age rating | 4+ (no objectionable content; the chats are between businesses and their customers) |
| Copyright | 2026 <the company's registered name> |
| Screenshots, 6.9" iPhone | `screenshots/iphone-6.9/` (1320×2868, in order). Apple scales them down for smaller iPhones. |
| App Review information | `review-notes.txt`: create the demo seller account first and put its email and password there. |
| App Privacy | `app-privacy.md` |
| Price | Free. No in-app purchases. |

The screenshots are the Google Play ones (`docs/play-store/listing/screenshots`) made taller with
`make-screenshots.py`. Their phone frame has a round front camera like an Android phone. Apple doesn't allow images of
other platforms (guideline 2.3.10), so replace them with iPhone captures from TestFlight if review objects. The
iPhone 16 Pro Max simulator saves 1320×2868 screenshots that fit the same frames.

## 5. Before "Submit for Review"

- Demo account in `review-notes.txt` works on the TestFlight build, with a published shop and a few orders.
- Store builds don't set `EXPO_PUBLIC_PREPAID_BALANCE` or `EXPO_PUBLIC_WALLET_ACCOUNT_NUMBER` (`apps/mobile/.env.example`).
- `docs/store-payments-audit.md` › "What the owner must decide": Apple 3.1.3(b) lets credits and plans bought on the
  website work in the app only when they're also sold as in-app purchases. Decide before the first review.
- Admin › App updates › iPhone app: leave it at 0 until the first version is live; then set the latest build to the
  build number App Store Connect shows in brackets.

## Files

| File | What |
| --- | --- |
| `listing/` | Name, subtitle, keywords, promotional text, description |
| `screenshots/iphone-6.9/` | 8 screenshots, 1320×2868 |
| `review-notes.txt` | App Review notes and demo account |
| `app-privacy.md` | App Privacy answers |
| `make-screenshots.py` | Makes the iPhone screenshots from the Play ones |
