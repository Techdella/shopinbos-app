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
7. **Coverage:** states, regions and nationwide, plus optional `State: Area` tokens for LGAs or cities.

## Pay on delivery

POD is off by default. It is allowed per connection only when the seller opts in (accepting the disclaimer), the partner opts in for that connection, and the partner offers it at all. Cash is settled between the seller and the partner. Shopinbos never collects it, so these jobs don't use the existing Shopinbos pay-in flow (`codAmount` stays empty).
- The partner can mark "cash paid to shop" and the seller confirms. This is a record only.
- Confirming marks the order paid.

**Get legal review of all "Shopinbos is just the software" wording before launch.**

## Release steps

1. Back up the database, then run `docs/migrations/2026-11-14-logistics-marketplace.sql` in the Supabase SQL editor. It is additive and safe to re-run. Run it before deploying.
2. Deploy.
3. Add the QStash schedule: `QSTASH_TOKEN=... node scripts/qstash-schedules.mjs https://app.shopinbos.com`.

## Not built yet (later phases)

- SMS/WhatsApp messages at each delivery stage. The existing order messages still fire.
- Verified customer phone numbers at checkout (OTP). Today the phone is required, not verified.
- LGA data lists (areas are free text).
- Partner and seller delivery analytics.
