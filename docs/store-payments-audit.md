# Phone app payments: Google Play and App Store audit

Last checked: 26 October 2026, against the live policy pages:

- Google Play **Payments** policy: <https://support.google.com/googleplay/android-developer/answer/9858738>
- Apple **App Store Review Guidelines**, section 3.1: <https://developer.apple.com/app-store/review/guidelines/#payments>

Scope: the phone app in `apps/mobile/src`, plus the server answers it shows word for word. The website
(app.shopinbos.com in a browser) is not covered. It keeps selling AI credits, plans, themes and wallet top-ups.

## The rules we apply

| Source | What it says (short) | What it means for us |
|---|---|---|
| Play Payments, §1 | Payment for "in-app features or services, including any app functionality, digital content or goods" must use Play billing. Examples include virtual currencies, subscriptions and service upgrades, new features, and "cloud software and services". | AI credits, plans and upgrades, premium themes, a prepaid balance spent on Shopinbos services, and paid AI features are all digital. They can't be sold in the app without Play billing. |
| Play Payments, §2 | Play billing must **not** be used for physical goods, physical services, or peer-to-peer payments. | Orders, delivery, wholesale stock, prints and cash or money owed between businesses go through Paystack. |
| Play Payments, "may not lead users" | Apps "may not lead users to a payment method other than Google Play's billing system", including through "in-app webviews, buttons, links, messaging … or other calls to action" and sign-up flows. | No "top up on the website", no "we'll email you how", no "See plans", no upgrade link, no price for credits or plans. |
| Apple 3.1.1 | Unlocking features or functionality (subscriptions, in-app currencies, premium content) must use in-app purchase. | The same digital list as above. |
| Apple 3.1.1(a) / 3.1.3 | Outside the US storefront, apps "may not include buttons, external links, or other calls to action that direct customers to purchasing mechanisms other than in-app purchase". Communication **outside** the app (email the person didn't ask for from the app) is allowed. | Removing the in-app "Top up" email button is required. Lifecycle emails sent on their own (for example "credits low") are fine. |
| Apple 3.1.3(b) | Content or features bought on the website may be used in the app **if they are also offered as in-app purchases**. | See "What the owner must decide": credits and plans bought on the website still work in the app. |
| Apple 3.1.3(d) | Real-time person-to-person services may use other payment methods. | Not relied on. |
| Apple 3.1.3(e) | Physical goods or services consumed outside the app **must** use non-IAP payment. | Orders, delivery, wholesale, prints and the managed ads service. |
| Apple 3.1.3(g) | Advertising-management apps may sell ad campaigns shown in other media without IAP. Boosts shown inside the same app must use IAP. | Meta and TikTok ad spend goes to Meta and TikTok. The ads-team setup fee is a human service performed outside the app. |
| Apple 3.1.5(i) | Wallets for storing virtual currency need an organization developer account. | The prepaid balance is a stored balance: it stays off in store builds (see "Wallet balance"). |

## Inventory and decisions

Categories:

- **Physical**: physical goods, or a real-world service consumed outside the app.
- **B2B**: money between businesses.
- **Digital**: a Shopinbos feature used inside the app.
- **Grey**: decided below.

| Path | Category | Decision | File | Policy |
|---|---|---|---|---|
| Shop orders and checkout: customers pay the seller on the store (`/s/<slug>`), through payment links and invoices | Physical | **Keep.** Paystack on the seller's own store. The app only makes links and invoices and records sales. | `app/payment-links/*`, `app/invoices/*`, `app/record-sale.tsx` | Play §2 (physical goods); Apple 3.1.3(e) |
| Wholesale order: a seller pays a supplier for stock | Physical / B2B | **Keep.** The button now reads "Pay ₦X for this order". | `app/wholesale.tsx`, `lib/wallet.ts` `payWholesaleOrder` | Play §2; Apple 3.1.3(e) |
| Wholesale preorder deposit and balance: a seller pays a supplier part of a stock preorder when placing it ("Pay deposit ₦X", paid right after "Preorder N for ₦…" on Find), and the rest once the supplier says the stock is ready ("Pay balance ₦X") | Physical / B2B | **Keep.** The same wholesale Paystack path (`payWholesaleOrder`, split straight to the supplier's bank, `shopinbos://paid`); no new `payInApp(` caller. | `app/find/[slug].tsx`, `app/preorders.tsx`, `app/wholesale.tsx`, `lib/wallet.ts` `payWholesaleOrder` | Play §2; Apple 3.1.3(e) |
| Delivery fee: a seller pays a delivery partner for a booking | Physical service | **Keep.** The button now reads "Pay ₦X delivery fee by card". | `app/delivery/zones.tsx`, `lib/wallet.ts` `payDeliveryFee` | Play §2 (physical services: transportation); Apple 3.1.3(e) |
| Cash-on-delivery handover: a delivery partner pays a seller the cash its riders collected | B2B | **Keep.** The button now reads "Pay seller ₦X". | `components/PaySellersCard.tsx`, `lib/wallet.ts` `paySellerCash` | Play §2 (peer-to-peer); Apple 3.1.3(e) (remittance for physical goods) |
| Cash pay-in when overdue (a partner transfers collected cash to its account) | B2B | **Keep.** A bank transfer, with no purchase. | `components/PayInOverdueCard.tsx` | Play §2 |
| Money owed between businesses (claims, damaged goods, lost parcels) | B2B | **Keep.** The button now reads "Pay ₦X owed". | `components/MoneyOwedCard.tsx`, `lib/wallet.ts` `payDebt` | Play §2 (peer-to-peer); not a digital purchase |
| Print and packaging orders | Physical | **Keep.** The button now reads "Pay ₦X for prints". | `app/packaging.tsx`, `lib/packaging.ts` `orderPrints` | Play §2; Apple 3.1.3(e) |
| Ads: the Shopinbos team sets up and runs Meta or TikTok ads (setup fee) | Grey, decided physical | **Keep.** The button now reads "Pay the team's ₦X setup fee". See below. | `app/ads/new.tsx`, `lib/ads.ts` `sendAdRequest` | Apple 3.1.3(e), 3.1.3(g); Play §2 |
| Ads: "Boost it yourself" on Meta | Not a Shopinbos sale | **Keep.** Meta charges the seller's own ad account. Shopinbos charges nothing. | `app/ads/new.tsx` | Apple 3.1.3(g) |
| Withdraw to a bank, bank and settlement setup, payouts | Not a purchase | **Keep.** | `app/wallet.tsx`, `app/payouts.tsx`, `components/WalletBalanceCard.tsx` | n/a |
| Paystack return and confirmation (`shopinbos://paid`) | Physical / B2B only | **Keep.** Used only by the callers above. A test fails if a new `payInApp(` caller appears. | `lib/pay.ts`, `app/paid.tsx` | n/a |
| AI credits "Top up" button (email with the website steps): Rex, Create, Ask Peggy, Packaging, supplier Account, partner Business | Digital | **Removed.** Shows "N credits" and "Your plan's credits refill each month." No button, price, website or email. | `components/familiar/Credits.tsx`, `app/rex.tsx`, `app/supplier/account.tsx`, `app/logistics/(tabs)/more.tsx` | Play "may not lead users"; Apple 3.1.1, 3.1.3 |
| Out of AI credits during an action (`AI_CREDITS_NEEDED`) | Digital | **Calm line only:** "You're out of AI credits for now. Your plan's credits refill each month." | `lib/api.ts` `phoneMessage`, `shared/store-payments.ts` | Same |
| Auto top-up: the saved card is charged when credits run out | Digital | **Off for app requests.** The server skips it when the request carries `x-shopinbos-client: app`. The website keeps it. | `src/lib/ai/usage.ts`, `src/lib/ai/credits.server.ts` | Play §1; Apple 3.1.1 |
| Credits note from `/api/mobile/credits` ("…top up on the website") | Digital | **Reworded:** "You're out of AI credits for now. Your plan's credits refill each month." | `src/app/api/mobile/credits/route.ts` | Same |
| Peggy and Rex replies ("tell them to top up on the AI credits page", "upgrade in Settings") | Digital | **In-app rule added** to both agents' instructions when they answer in the app. The Rex tool's out-of-credits message no longer says to top up. | `src/app/api/mobile/peggy/route.ts`, `src/lib/ai/peggy/agent.ts`, `src/app/api/ai/rex/route.ts`, `src/lib/ai/rex/agent.ts`, `src/lib/ai/rex/tools.ts` | Same |
| Plan gates from the server (`PLAN_LIMIT`, `UPGRADE_REQUIRED`, any 402, any "Upgrade to X" line) | Digital | **Neutral:** "That isn't on your plan." No plan name, price or link. | `lib/api.ts` | Same |
| Shop looks (themes) locked to a plan, with "See plans on the website" | Digital | **Removed.** `ALL_THEMES_FREE` is on, so nothing is locked. If it's turned off, a lock only says "Not on your plan". No plan filter chips. | `app/templates.tsx` | Same |
| Onboarding "All of Nigeria: comes with the Growth plan" | Digital | **Neutral:** "Not on your plan" (no plan name). | `app/onboarding/where.tsx` | Same |
| Wallet balance "Top up" (email with the website steps) | Digital (grey: see below) | **Removed.** The card is off in store builds anyway (`EXPO_PUBLIC_PREPAID_BALANCE`). When on, it shows the balance and Withdraw only. | `components/WalletBalanceCard.tsx`, `lib/wallet.ts` | Play §1; Apple 3.1.1, 3.1.5(i) |
| Links from the server to purchase pages (`/home/credits`, `/logistics/billing`, `settings?tab=Billing`, `/pricing`) in notifications, Rex cards and home items | Digital | **Never open.** `openPath` and `openWeb` do nothing for them, with no "Open the website?" prompt either. | `lib/web.ts`, `shared/store-payments.ts` `isDigitalPurchasePath` | Play "may not lead users" |
| Bell items that sell credits ("Running low… Top up credits") | Digital | **Hidden in the app's bell.** They stay on the website's bell and in email. | `lib/notifications.ts` | Same; Apple 3.1.3 (communication outside the app is allowed) |
| Domain purchase ("Buy a new domain on the website", with the website badge) | Grey, decided digital | **Removed.** "Connect a domain you already own" stays. See below. | `app/domain.tsx` | Play §1 ("cloud software and services"); Apple 3.1.1 |
| Business registration (CAC) | Grey, decided physical | **Not in the app today.** It may be added with Paystack. See below. | n/a (web: `/register-business`) | Apple 3.1.3(e); Play §2 |
| Rewards: swap points for credits, referral rewards (free months or credits, never cash) | Not a purchase | **Keep.** No money changes hands. | `app/rewards.tsx`, `components/familiar/ReferCard.tsx` | n/a |
| Credit cost shown before an action ("Uses 10 credits") | Not a purchase | **Keep.** Shows usage only: no money price and no way to buy. | `app/video/studio.tsx` | n/a |
| Video studio "Finish on the web" (final render) | Not a purchase | **Keep for now.** See "What the owner must decide". | `app/video/studio.tsx` | Play "may not lead users" (risk only if the web page shows Buy credits) |
| Seller fee on store sales (Shopinbos's commission) | Physical | **Keep.** A fee on physical sales, taken at checkout. | `app/wallet.tsx` | Play §2 |

## Grey areas

### Ads setup fee: keep

The Shopinbos ads team calls the seller and then sets up, launches and watches the Meta or TikTok campaign. People do
this work, and they do it outside the app. The ads themselves run on Facebook, Instagram or TikTok, never inside
Shopinbos. Apple's 3.1.3(g) lets an app sell ad campaigns that run in other media without in-app purchase. Only
"boosts" shown inside the same app need IAP. Apple 3.1.3(e) covers services consumed outside the app. Google's
billing list covers app features, digital content and cloud software. A human agency service doesn't fit that list.

Change made: the pay button now says what is being paid for ("Pay the team's ₦X setup fee"). The notes already say
that the ad budget is paid to Meta or TikTok, not to Shopinbos.

Risk: medium-low. If a reviewer objects, the fallback is to collect the fee by bank transfer after the team's call,
with no in-app button.

### Domain purchase: remove from the app

A domain is a registration on the internet. It's bought, renewed and used on the web. Nothing physical is delivered,
and no person performs a service. Google's exemptions cover only physical goods and services and peer-to-peer
payments, and its "cloud software and services" example is close to domain registration. The app also linked to a
paid checkout with "Search for a name and pay there", which is the "lead users to a payment method" pattern. The phone
gains little from it.

Decision: the buy row is gone. Connecting a domain the seller already owns is free and stays. The website still sells
domains.

### Business registration (CAC): physical, allowed if added

Registering a business name with the Corporate Affairs Commission is a government filing. Shopinbos agents complete it
and a certificate is issued. It's a real-world legal service consumed outside the app, like paying a filing agent.
Apple 3.1.3(e) and Google's physical-services exemption fit, so Paystack is the right way to pay.

The app has no registration screen today. A server link to `/register-business` opens the website after "Open the
website?", which is fine because this isn't a digital good. If it moves into the app, the button should say "Pay ₦X
to register your business with CAC".

### Wallet balance: digital, keep out of store builds

The prepaid balance is spent on Shopinbos services: AI credit packs (`buyCreditsFromWallet`), plans and similar
items. Topping it up is a digital purchase under both stores' rules. A stored balance is also a digital wallet, a
financial feature Google lets only organization developer accounts ship (Apple 3.1.5(i) says the same for virtual
currency).

Decision:

- The balance card stays off in store builds (`EXPO_PUBLIC_PREPAID_BALANCE` unset).
- When it's on, it shows only the balance, past transactions and Withdraw to the person's own bank. There is no Top
  up, no email and no account number to transfer to.
- Sales never touch this balance: Paystack splits them straight to the bank.

## What changed in code

- `shared/store-payments.ts` (new): the app header (`x-shopinbos-client: app`), the in-app rule for Peggy and Rex,
  purchase-path and purchase-word detection, and `storeSafeKind` for error messages.
- **Phone app**
  - Every API call sends the app header. Plan-gate and credits errors are mapped to neutral words.
  - `openPath` and `openWeb` never open purchase pages, and bell items that sell credits are hidden.
  - The credits Top up and email flow is removed everywhere. The wallet Top up is removed.
  - The themes plan gate and the "See plans" link are removed. Onboarding plan names are removed. The domain Buy row
    is removed.
  - Payment buttons say what they pay for.
- **Server**
  - No auto top-up for app requests.
  - Peggy (mobile route) and Rex (when called from the app) get the in-app rule.
  - Rex's out-of-credits tool message no longer says to top up.
  - The `/api/mobile/credits` note is neutral.
  - The website's own flows are unchanged.
- **Kept for installed older builds:** `POST /api/mobile/credits/topup-email` and `/api/mobile/wallet/topup-email`.
  New builds never call them. Once old builds are gone, they can be deleted.
- **Tests:** `tests/store-payments.test.mjs`.
  - It fails if a purchase call to action for credits, plans, themes or a wallet top-up comes back in
    `apps/mobile/src`, in the `m_*` catalogs, or in web catalog words the app borrows.
  - It also fails on any new `payInApp(` caller that isn't on the physical or B2B list.

## How to answer the store questions

### Play Console: financial features declaration (App content › Financial features)

- Choose what the app actually does. Shopinbos lets businesses take card payments for their own sales (orders,
  payment links and invoices), pay other businesses (wholesale stock, delivery fees, cash handovers, money owed) and
  withdraw to their bank. A licensed third-party processor (Paystack) handles all of it.
- The closest options are the payments ones: mobile payments and transfers. Name Paystack as the processor wherever
  the form asks how payments are processed. Shopinbos doesn't lend, doesn't trade crypto and doesn't hold customer
  money in store builds.
- Don't declare a digital wallet while `EXPO_PUBLIC_PREPAID_BALANCE` stays off. Turning the balance on in a store
  build needs an organization developer account and a "digital wallet" declaration first.

### Play Console: in-app products and the Payments policy

- The app has no Play in-app products, and it doesn't need any: every in-app payment is for physical goods,
  real-world services or business-to-business payments, which Play billing must not be used for.
- AI credits and plans exist on the website only. The app shows the remaining credits and that they refill monthly,
  with no link, price or other call to action.

### App Store Connect: review notes (App Review Information › Notes)

> Shopinbos is a commerce app for small businesses in Nigeria. In-app card payments (processed by Paystack) are only
> for physical goods and services consumed outside the app: wholesale stock from suppliers, delivery fees to courier
> companies, printed packaging, a human-run ad setup service, and settling money between businesses (cash collected
> on delivery, claims). These follow guideline 3.1.3(e). The app doesn't sell digital content or subscriptions, and
> it contains no links, buttons or messages that send users to buy them elsewhere. Account features are included
> with each business's account.

- If review asks about AI features: Peggy and Rex use the account's monthly AI allowance. The app shows how much is
  left and never offers more for sale.
- If review asks about the website: business owners manage their account on the web, as with other business tools.
  The app doesn't link to purchase pages.

## What the owner must decide

1. **Apple 3.1.3(b), multiplatform services.** Credits and plans bought on the website still work in the iOS app.
   Apple allows that only "provided those items are also available as in-app purchases within the app". Many
   business tools ship without IAP by keeping all purchase prompts out of the app, which this audit does, but a
   reviewer can still ask for IAP. The options are:
   - (a) Ship as is and answer with the review note above.
   - (b) Add StoreKit and Play Billing products for credit packs and plans. Apple and Google take 15–30%.
   - (c) Make the iOS app use only the free allowance.
   Google has no such rule: content bought elsewhere may be used in a Play app as long as the app doesn't steer
   people to buy it.
2. **Web pages opened from the app** ("Finish on the web" in the video studio, product import, shop preview). They
   open the signed-in website, whose menus include AI credits and Billing. A strict reviewer can call that a link to
   another way to pay.
   - Suggestion: an app mode for pages opened through `/auth/handoff` that hides credits, billing and upgrade
     prompts.
   - Or bring those tools into the app.
3. **The ads setup fee** is kept as a physical service (above). If you'd rather take no risk on it, take it by
   transfer after the team's call instead.
4. **Retire the old top-up email routes** once installed builds older than this change are gone.
