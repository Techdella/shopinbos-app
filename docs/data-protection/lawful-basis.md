# Lawful basis and record of processing

Shopinbos's record of what personal data it processes, why, and on which lawful basis, under the **Nigeria Data
Protection Act 2023 (NDPA) s.25** and the NDPC's **General Application and Implementation Directive (GAID) 2025**.
It is the internal record the NDPA expects a data controller to keep (s.24–s.29, s.31, s.41–s.43) and the source for
the public privacy policy at https://shopinbos.com/privacy. Keep it in step with the code: when a feature starts
collecting something new, or a new processor is added, update the tables here in the same change.

- **Controller:** Shopinbos (legal name and postal address: `SHOPINBOS_LEGAL_NAME`, `SHOPINBOS_POSTAL_ADDRESS`).
- **Contact for data requests:** support@shopinbos.com. Requests are answered within 30 days (account deletion:
  `src/lib/account-deletion.server.ts`, `/delete-account`).
- **Regulator:** Nigeria Data Protection Commission (NDPC), https://ndpc.gov.ng.
- Shopinbos is the **controller** for its own users (sellers, suppliers, delivery partners, admins) and for leads on
  the marketing site. For a store's shoppers, the **seller is the controller** and Shopinbos is their **processor**:
  the store's checkout, cookie banner (`components/storefront/StoreConsent.tsx`), marketing lists and opt-outs belong
  to the seller.

Retention periods below are the policy. Account deletion and the status purge cron enforce some of them today; the
rest still need scheduled clean-up jobs, so treat any period without a job as a to-do, not a guarantee.

## Lawful bases used (NDPA s.25(1))

| Basis | NDPA | Used for |
| --- | --- | --- |
| Contract | s.25(1)(b) | Running the account the person signed up for: sign-in, the shop, orders, payouts, deliveries. |
| Legal obligation | s.25(1)(c) | KYC/KYB for payments (CBN AML/CFT rules), tax and accounting records, regulator requests. |
| Legitimate interests | s.25(1)(e) | Security, fraud prevention, error monitoring, service emails and messages about the account, product improvement from aggregate data. Balanced against the person's interests below. |
| Consent | s.25(1)(a), s.26 | Product analytics cookies and session replay, marketing email/SMS/WhatsApp, biometric face check, ID lookups (`verification_consent`). Withdrawable at any time, as easily as given. |

## Record of processing

| # | Activity | People | Data | Purpose | Lawful basis | Where in the code | Retention |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Account and sign-in | Sellers, suppliers, delivery partners, admins | Name, email, phone, role, password hash (Supabase), sign-in events, IP and device for security | Create and secure the account | Contract; legitimate interests (security) | `src/app/api/auth/*`, `src/lib/auth/*`, `src/proxy.ts` | While the account is open; auth events 12 months |
| 2 | Age confirmation | Everyone who signs up | "I'm 18 or older" tick and time (`User.preferences.ageConfirmedAt`), date of birth from the ID check | Accounts are for adults only (NDPA s.31: no child's data without a guardian's consent) | Legal obligation; contract | `src/lib/auth/age.ts`, `src/app/api/auth/sync-user` | With the account |
| 3 | Web session security | Signed-in web users | Signed "last active" cookie (`sib_active`), session id | Sign out idle sessions (60 min, 15 for admins) and old ones (7 days, 8 h admins) | Legitimate interests (security) | `src/lib/auth/idle.ts`, `src/lib/auth/session-claims.ts` | Session only |
| 4 | Running the shop | Sellers and their staff | Store details, products, prices, legal pages, business address | Provide the store builder and storefront | Contract | `src/lib/storefront`, `src/lib/products` | While the account is open |
| 5 | Orders and checkout (as processor) | Shoppers | Name, phone, email, delivery address, order items, payment reference | Take and deliver the seller's orders | Seller's contract with the shopper (Shopinbos as processor) | `src/lib/commerce`, `src/app/api/public/store` | Seller's records; tax records 6 years |
| 6 | Payments and payouts | Sellers, suppliers, delivery partners | Bank account (last 4 shown), Paystack/Korapay subaccounts, settlements | Split payments to each business's own bank | Contract; legal obligation | `src/lib/wallet`, `src/lib/paystack.ts`, `src/lib/korapay.ts` | 6 years after the last payment (accounting) |
| 7 | KYC (identity) | Wallet owners | NIN or BVN (only last 4 digits and a keyed hash stored), name, date of birth, Korapay reference | Confirm who owns the wallet and its account number (CBN KYC) | Legal obligation; consent to the lookup | `src/lib/wallet/identity.server.ts`, `src/lib/korapay.ts` | 5 years after the relationship ends (AML) |
| 8 | Face check (liveness + face match) | Wallet owners on the phone app | Live selfie video processed by Korapay; we keep only the result, time and Korapay reference, never the images | Stop impersonation of the ID's owner | **Explicit consent** (biometric data is sensitive, NDPA s.30) and legal obligation (KYC) | `apps/mobile/src/app/face-check.tsx`, `src/lib/korapay-liveness.ts` | Result: as KYC. Images: not stored by Shopinbos |
| 9 | KYB (business) | Suppliers, delivery partners, wallets | BN/RC number, registered name, address, directors' names from CAC | Verify the business is real and the owner is on its record | Legal obligation; legitimate interests (marketplace trust) | `src/lib/kyb/*` (Korapay first) | 5 years after the relationship ends |
| 10 | Verification documents | Suppliers, delivery partners | Uploaded certificates and IDs (private bucket) | Manual review where the instant check can't confirm | Legal obligation; legitimate interests | `src/lib/verification-utils.ts`, private storage bucket | Until verified + 5 years |
| 11 | Service messages | All users | Email, phone | Order, payout, security and account notices (always sent) | Contract; legitimate interests | `src/lib/notifications`, `src/lib/email/compliance.server.ts` | Delivery logs 12 months |
| 12 | Shopinbos marketing | Users who didn't opt out; leads | Email, WhatsApp number, language | Product news, tips, onboarding nudges, win-back | Consent / soft opt-in for existing customers (NDPA s.26, GAID); every message has Unsubscribe or STOP/START | `src/lib/member-messaging`, `src/lib/email/preferences*.ts`, `src/lib/lead-growth` | Until they opt out; suppression kept so they're never re-added |
| 13 | Store marketing (as processor) | Store subscribers | Email, phone, topics, consent history | The seller's newsletters, SMS and WhatsApp | Seller's consent records; STOP, unsubscribe and preference centre for every message | `src/lib/marketing`, `src/lib/campaigns`, `src/lib/marketing/opt-outs.ts` | Seller's choice; opt-outs kept |
| 14 | Review requests (as processor) | Shoppers | Name, email or phone, order | Ask for a review after an order | Seller's legitimate interests; honours unsubscribes and STOP, every message says how to stop | `src/lib/reviews/requests.ts` | 12 months |
| 15 | Product analytics | App users who allow it | Pseudonymous user id and role, pages, clicks | Understand and improve the app | **Consent** (cookie banner, `src/lib/analytics/consent.ts`) | `src/components/analytics/ProductAnalytics.tsx` | 14 months (provider setting) |
| 16 | Session replay | App users who allow it | Recording of the page with all text, inputs and media masked | Find bugs | **Consent**; masked by default | `src/lib/analytics/replay.ts` | 30 days (Sentry) |
| 17 | Error monitoring | All app users | Error, page, browser, pseudonymous id; no default PII | Keep the app working | Legitimate interests | `src/instrumentation-client.ts`, `sentry.*.config.ts` | 90 days |
| 18 | AI assistants (Rex, Peggy, Chip) | Sellers | What they type or say, shop data | Answer questions and do tasks in the app | Contract | `src/lib/ai` | Chat history while the account is open |
| 19 | Admin access to personal data | All users | Masked contact details; reveal logged with a reason | Support, verification, safety | Legitimate interests; purpose limitation (NDPA s.24) | `shared/privacy.ts`, `src/lib/admin/data-access.server.ts` | Access log 2 years |
| 20 | Support | Anyone who contacts us | Messages, attachments, contact details | Answer them | Legitimate interests; contract | `src/lib/support` | 2 years after the last message |

### Legitimate interests balancing (summary)

Security, fraud prevention and error monitoring are expected by users of a payments product, use the minimum data
(pseudonymous ids, masked replays, last-4 digits), and protect users themselves; the impact on them is low. Service
messages are limited to what the account needs and can be tuned in notification settings. Product improvement uses
aggregate data only; anything that profiles an individual's behaviour in detail (analytics, replay) is on consent.

## Processors and international transfers (NDPA s.41–s.43)

Each is bound by its data processing terms. Transfers outside Nigeria rely on the processor's contractual safeguards
(standard contractual clauses or equivalent) under NDPA s.42–s.43.

| Processor | What for | Data | Location |
| --- | --- | --- | --- |
| Supabase | Database, auth, file storage | All account data | Region of the Supabase project |
| Vercel | Hosting, logs | Requests, IPs (logs) | Global edge, US |
| Korapay (Kora) | Identity (NIN/BVN, liveness, face match, CAC), checkout, payouts | ID numbers, selfie (processed, not kept by us), business numbers, payments | Nigeria |
| Paystack | Card payments, subaccounts, transfers, account numbers | Payment and bank data | Nigeria |
| CAC (VAS), Youverify, Dojah | Fallback CAC and ID checks (only when Korapay can't answer or isn't set) | Business numbers, ID numbers | Nigeria |
| Resend | Email delivery | Email address, message | US |
| Termii, Africa's Talking, Sendchamp, BulkSMS Nigeria, Brevo | SMS delivery | Phone, message | Nigeria / EU |
| Meta (WhatsApp Cloud API) | WhatsApp messages | Phone, message | Global |
| OpenAI, Anthropic | AI assistants, product content | Prompts and shop data | US |
| ElevenLabs | Voice (Call Peggy, narration) | Voice audio | US / EU |
| Sentry | Errors; session replay with consent | Pseudonymous, masked | US / EU |
| Google Analytics, Mixpanel, PostHog | Product analytics, with consent only | Pseudonymous id, usage | US / EU |
| Upstash | Rate limits, queues | Keys (user ids, IP hashes) | Region of the database |
| Google (Maps, Search Console, Merchant), TikTok | Features the seller connects | What the seller connects | Global |

## Rights (NDPA s.34–s.38)

Access, correction, deletion, restriction, objection (including to direct marketing at any time), portability and
withdrawal of consent: through support@shopinbos.com, `/delete-account`, the email preference centre, STOP/START on
SMS and WhatsApp, and "Cookie settings" in the account menu. Complaints can go to the NDPC.

## Children

Shopinbos isn't for anyone under 18. Sign-up requires "I'm 18 or older" (web and app), and the ID check refuses a
date of birth under 18 (`src/lib/auth/age.ts`). An account found to belong to a child is closed and its data deleted.

## Breaches (NDPA s.40)

Notify the NDPC within 72 hours of becoming aware of a breach likely to risk people's rights, and tell the people
affected without delay where the risk is high. The admin access log and Sentry are the first places to look.
