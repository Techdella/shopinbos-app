# Logistics Marketplace

Shopinbos doesn't deliver anything. It is the software that connects sellers and suppliers with delivery partners, prices delivery at checkout, sends jobs to partners, and splits the delivery fee straight to the partner.

## Where things live

| Piece | Code |
|---|---|
| Pure rules (tested): areas, size bands, rate cards, checkout options, status timeline, exceptions, stats, chat guardrails | `shared/delivery-market.ts`, `tests/delivery-market.test.mjs` |
| Settings, connections and checkout options (server) | `src/lib/delivery-market/market.server.ts` |
| Rate cards, pickup points, coverage, finding partners, delivery problems | `src/lib/delivery-market/manage.server.ts` |
| Jobs: dispatch, ready, reassign, POD records, late-acceptance sweep | `src/lib/delivery-market/jobs.server.ts` |
| Job status rules (shared with the rider app and partner API) | `src/lib/logistics/job-rules.ts`, `src/lib/logistics/jobs.ts` |
| Checkout pricing and order creation | `src/lib/commerce/pricing.server.ts`, `src/app/api/public/store/[slug]/checkout/route.ts` |
| Delivery fee split | `src/lib/wallet/rules.ts` (`PaymentSplitPlan.delivery`), `src/lib/wallet/wallet.server.ts` |
| Schema migration | `docs/migrations/2026-11-14-logistics-marketplace.sql` |
| Cron (not accepted in time) | `/api/cron/delivery-jobs` every 15 minutes (`scripts/qstash-schedules.mjs`) |

## How it works

1. **Partners** set:
   - where they collect from and deliver to, as area tokens: `Lagos`, `Lagos: Ikeja`, `South-West`, `Nationwide`
   - their services: doorstep, pickup points, same-day, interstate
   - a structured public rate card (from zone, to zone, service, size band, price, days), plus re-attempt and return fees
   - pickup points
   - their business details, including the CAC number
2. **Sellers and suppliers** set "Where I sell" or "Where I ship from", then connect partners. For each partner they choose:
   - which services customers see
   - whether customers see the partner's name or a generic label
   - pay on delivery
3. **Checkout** uses delivery partners only when the seller switches *Delivery at checkout* to partners (`DeliverySettings.checkoutMode = "partners"`). Otherwise the store's own delivery zones work as before.
   - For each parcel, the server finds connected partners that cover origin → customer for the parcel's size band.
   - The most specific rate wins (area beats state, state beats region, region beats nationwide), then the cheaper one.
   - The customer sees pick up from seller, doorstep (and same-day) per partner or label, and pickup points in their state.
   - A cart with dropship items from another place is split into several parcels, each priced separately.
4. **The order** saves its delivery plan in `RetailOrder.logisticsDetails.delivery`, one entry per parcel with the price it was quoted.
   - Each partner's fee goes in the Paystack/Korapay split to the partner's wallet subaccount.
   - A partner without a ready wallet isn't in the split. The fee stays with the seller, who pays the partner in the app.
5. **Jobs** are created once the order is live (paid, or placed as pay on delivery).
   - The shop's own parcel is booked straight away.
   - A dropship parcel is booked when the supplier packs it and picks a pickup time, with the planned partner and fee.
   - Partners have `ACCEPT_WITHIN_HOURS` (4) to accept, or decline with a reason.
   - Declined, late and failed jobs show in the seller's **delivery exceptions**. From there the seller sends the job to another connected partner.
   - If the first partner was already paid, they owe the fee back through *Money owed*.
6. **Status list** (spec §9): pending (sent to partner) → confirmed (accepted) / declined → picked up → in transit → out for delivery or at pickup point → delivered. Failed attempts, returning, returned and cancelled are also possible. The shop marks a parcel *ready* (`readyAt`).
7. **Rate changes** never touch placed orders: the fee is kept on the order plan and the job, and old public cards are kept as `retired`.

## Decisions taken for v1 (spec §11)

Each decision is a constant or a single function in `shared/delivery-market.ts`, so it's easy to change.

1. **Connecting is instant** on public rates. Private rate cards need the seller's acceptance. The partner can end a connection.
2. **Dropship:** the supplier's own partners ship from the supplier. A supplier with no partners yet falls back to the shop's partners collecting from the supplier.
3. **Size band:** the bigger of the largest item's band and the band of the summed weight. The product's own band wins over its weight, and the store default fills gaps.
4. **Payout timing:** instant split at payment.
5. **Partner name** at checkout is the seller's choice, per partner.
6. **Commission:** none on delivery fees. Shopinbos's platform fee is only on what the seller sells.
7. **Coverage:** states, regions and nationwide, plus optional `State: Area` tokens for LGAs or cities. An area token matches an address when its text is inside the address's area, or when both resolve to the same LGA (`shared/ng-lgas.ts`: all 774 LGAs plus common area names, so `Lagos: Eti-Osa` covers "Lekki Phase 1"). Area fields suggest the state's LGAs but still accept free text.

## Delivery updates to the buyer (spec §6.3)

WhatsApp/SMS order messages the seller turns on per channel in Marketing › Order messages (off by default; WhatsApp setup switches them on the first time it makes their templates):
- **Delivery booked** when the partner accepts (link to the order page, which shows the delivery code).
- **Out for delivery** with the 4-digit delivery code to give the rider.
- **Ready at the pickup point** with the point's name, address, hours and the code.
- **Delivery problem** for a failed attempt (the rider's reason in plain words) or a return ("We'll contact you").
- **Delivered** is the order's own message, sent when the job moves the order to delivered.

`transitionJob` calls `notifyDeliveryStage` (`src/lib/notifications/customer-messages.ts`) after saving the job, for jobs on a store order. The partner's name shows only when the seller shows it at checkout. Each message goes once per job step and channel: keyed by the job (a job handed to another partner messages again) and, for out for delivery and failures, the attempt number. Pure rules: `src/lib/notifications/delivery-messages.ts`, `tests/delivery-messages.test.mjs`. WhatsApp templates: `DELIVERY_TEMPLATE_PRESETS` in `src/lib/marketing/text-channels.ts`, submitted with the order templates.

## Pay on delivery

POD is off by default. It is allowed per connection only when the seller opts in (accepting the disclaimer), the partner opts in for that connection, and the partner offers it at all. Cash is settled between the seller and the partner. Shopinbos never collects it, so these jobs don't use the existing Shopinbos pay-in flow (`codAmount` stays empty).
- The partner can mark "cash paid to shop" and the seller confirms. This is a record only.
- Confirming marks the order paid.

**Get legal review of all "Shopinbos is just the software" wording before launch.**

## Verified phone at checkout

When the chosen delivery option books a delivery partner, the customer verifies their phone with a 6-digit code before the order goes in (checkout page and payment links, `src/components/storefront/checkout/PhoneCheck.tsx`).
- `POST /api/public/store/[slug]/checkout/phone-code` sends the code ("<store>: your delivery phone code is 123456", WhatsApp first when WhatsApp codes are set up, else SMS) and returns a signed `challenge`. `GET` says whether the store asks at all.
- `POST /api/public/store/[slug]/checkout/phone-verify` checks the code and returns a `phoneToken` (24 hours) for that phone and store. The checkout API refuses a partner-delivery order without a valid token for the buyer phone.
- No table: both are HMAC-signed (`src/lib/commerce/phone-verify.ts`) with `CHECKOUT_PHONE_SECRET`, else `JWT_SECRET`, else the service role key. Production refuses without one.
- Limits: 3 codes per phone per 10 minutes and 8 a day, 10 per IP per 10 minutes, 5 tries per code.
- With no SMS or WhatsApp code provider set up (local dev, staging), the check is skipped and logged once.

## Release steps

1. Back up the database, then run `docs/migrations/2026-11-14-logistics-marketplace.sql` in the Supabase SQL editor. It is additive and safe to re-run. Run it before deploying.
2. Deploy.
3. Add the QStash schedule: `QSTASH_TOKEN=... node scripts/qstash-schedules.mjs https://app.shopinbos.com`.

## Delivery analytics

- Partners: a "Marketplace jobs" section on /logistics/analytics (acceptance, time to accept, on-time and failed
  rates, weekly deliveries and fees, states, services, sizes, decline reasons, customer problems).
- Sellers: /home/logistics/analytics (spend, deliveries, exceptions, per-partner comparison). Suppliers:
  /supplier/delivery/analytics. Sums are pure and tested: src/lib/delivery-market/analytics.ts.

## Known limits

- An area token such as "Lagos: Lekki" covers that area only; naming the LGA ("Lagos: Eti-Osa") covers all of it.
- WhatsApp delivery templates carry the delivery code; Meta may decline or recategorise them as non-utility.
