# Legal review: delivery partners and the logistics marketplace

`docs/logistics-marketplace.md` says: *"Get legal review of all 'Shopinbos is just the software' wording before launch."*
This is the pack for that review. It lists every statement in the app and on shopinbos.com about Shopinbos's role in
delivery and pay-on-delivery cash, and sets each one against what the code and the live database actually do.

Prepared 2026-10-22 from the code on `main` and read-only queries on the production database. It is a map for
counsel, not legal advice. Please answer the questions in section 5. Wording changes go in the files named.

## 1. What Shopinbos actually does (checked in code)

| | What happens | Where |
|---|---|---|
| Delivers parcels | **No.** Delivery partners are independent companies with their own riders. | `shared/delivery-market.ts` |
| Vets partners | **Yes.** Partners upload CAC and an insurance certificate (insurance is required for fleet operations). Shopinbos staff approve them before they can take jobs or show up for sellers. Verified partners get a badge. | `shared/verification-docs.ts`, `src/app/api/logistics/verification/*` |
| Prices delivery at checkout | **Yes.** It works out the size band, matches the partner's rate card and shows the customer the options and fees. | `src/lib/commerce/pricing.server.ts` |
| Picks who delivers | The seller connects partners. At checkout the customer picks from those. The seller can show the partner's name or **a generic label instead**. | `DeliveryConnection.showPartnerName`, `label` |
| Takes the delivery fee | **No.** It is split at checkout by Paystack straight to the partner's subaccount. | `src/lib/wallet/rules.ts` (`PaymentSplitPlan.delivery`) |
| Charges partners | Today, no fee on checkout delivery splits (`DELIVERY_COMMISSION_RATE = 0`). A plan-based "job fee" on fees the seller pays in the app exists, can be switched on by an admin, and is shown on `/logistics/billing` before it applies. | `shared/platform-pricing.ts`, `src/app/logistics/billing/page.tsx` |
| Handles pay-on-delivery (POD) cash | **No.** The rider collects it. The partner pays the seller directly (Paystack split to the seller's bank) or hands it over and the seller confirms. | `src/lib/logistics/seller-payins.server.ts` |
| Old "pay-in account" (cash paid into a Paystack virtual account) | **Switched off** (`PAYSTACK_DVA_ENABLED` unset). That money would land in *Shopinbos's* Paystack balance. Live database on 2026-10-22: **0 pay-in accounts issued, 0 pay-ins.** | `src/lib/logistics/paystack-dva.ts` |
| Enforces passing cash on | **Yes.** On the older cash-job flow, cash is due to the seller by 6pm Lagos (next day if collected after 6pm), plus 1 hour's grace. After that the partner is paused from new cash jobs: an admin is alerted at 24 hours and the case is flagged for review at 72 hours. | `src/lib/logistics/payin-deadline.ts` |
| Decides disputes | **Yes.** Lost or damaged parcel claims go to the "Money owed" flow. If the two sides don't agree, the Shopinbos team decides. | `src/lib/money-owed/*` |
| Takes debts out of payments | **Partly.** Up to half of what a partner is paid when a *seller pays a delivery fee in the app* goes to the debt. Delivery fees split at *customer checkout* are **not** deducted (see 4.3). | `src/lib/logistics/delivery-fee-payments.server.ts`, `src/lib/wallet/rules.ts` |
| Tracks riders | **Yes.** Precise GPS while a job is active, deleted 7 days after the job ends (`rider-trail-cleanup` cron). Used as evidence in disputes. | `RiderLocationPoint`, `docs/migrations/2026-11-14-delivery-jobs-cron.sql` |
| Shares buyer data | Name, phone and address go to the partner and rider for the delivery. The buyer's phone is verified with a code before a partner delivery order. | `src/lib/commerce/phone-verify.ts` |

Live state on 2026-10-22: 3 delivery partners (1 verified, 2 pending), 0 connections with pay on delivery switched on.

## 2. Statements to review

### Pay-on-delivery disclaimers (must be exact in every language)

The seller ticks a box to accept the first one before pay on delivery can be switched on for a connection
(`src/lib/delivery-market/manage.server.ts:184`).

| Key | Shown to | English |
|---|---|---|
| `delivery: pod.disclaimer` (= `POD_DISCLAIMER`, `shared/delivery-market.ts:911`) | Sellers and suppliers, web and app, with an "I accept" box | Pay on delivery is an arrangement between you and your logistics partner. Cash is collected by the partner, and settlement is between you and them. Shopinbos does not handle, hold or guarantee pay-on-delivery funds. |
| `delivery: pod.disclaimerPartner` (= `POD_DISCLAIMER_PARTNER`) | Partners, `/logistics/coverage` and `/logistics/connections` | Pay on delivery is an arrangement between you and the shop. Your rider collects the cash from the customer, and you settle it with the shop directly. Shopinbos does not handle, hold or guarantee pay-on-delivery funds. |
| `m_partner: cashScreen.sub` | Partners, app cash screen | Pay on delivery is between you and each seller. Shopinbos doesn't collect, hold or guarantee this cash. Marking it here is just a record you can both see. |
| `m_partner: job.podTitle` / `job.podBody` | Partners, app job screen | Pay on delivery · collect {cash} / You and {shop} agreed this. Settling up the cash is between you and them. |
| `logistics: cash.sub`, `cash.heldSub` | Partners, web cash page | Cash on delivery (COD) your riders collect at the door. It belongs to the sellers: pass it on to each one here. |
| `logistics: payinWords.paused` | Partners, late | You're paused from cash-on-delivery jobs until you pay the sellers. |

### "Shopinbos never holds it" (delivery fees)

| Key | English |
|---|---|
| `m_partner: moneyCard.note` | Customers pay the delivery fee at checkout. It goes to your payout account through our payment provider. Shopinbos never holds it. |
| `m_partner: setup.paySub` | Customers pay the delivery fee at checkout. It's sent to this account through our payment provider. Shopinbos never holds your money. |
| `logistics: fees.subOn` / `fees.subOff` | Shopinbos takes {rate}% of each in-app delivery fee on your plan, from your share. Lower it with a paid plan. / No job fee for now: you keep the whole delivery fee. When it starts it will be {rate}% on your plan. |

### Verification and trust

| Key | English |
|---|---|
| `m_partner: verify.verified.hint` | Shops can see you're checked. |
| `logistics: company.verifiedBody` | Your company is verified. Sellers see the verified badge on your page. |
| `m_partner: docs.sub` | Shopinbos checks these before sellers can see you. |

### Public terms on shopinbos.com

Source: `website/wp-content/plugins/shopinbos-core/includes/seed/legal.php`.
- **Delivery partner terms** (`delivery-partner-terms`): joining (CAC, goods-in-transit insurance, riders with checked papers), taking jobs, pay on delivery (the 6pm rule and pausing), how partners are paid ("Shopinbos never holds it"), failed deliveries, lost or damaged parcels (the partner is liable from pickup until the buyer gives the code; claims within 7 days; the Shopinbos team decides; up to half of delivery fees withheld; partners hidden from new shops after 7 days).
- **Terms of service**, "Suppliers and delivery partners": "independent businesses. We check their registration documents before they join, but we do not make or ship their products ourselves."
- **Refunds**, "Pay on delivery" (buyers): check the parcel before giving the code; you can refuse it and won't be charged.
- **Privacy**: delivery partners get only the buyer's name, phone and address.

## 3. Where the wording and the product pull in different directions

These are the points we most need counsel's view on. Each one is a place where "Shopinbos is just the software"
may be hard to defend, or where two texts disagree.

1. **The disclaimer says the cash is between the shop and the partner, but Shopinbos enforces it.** Partners are
   told Shopinbos "does not handle, hold or guarantee" POD cash and that "marking it here is just a record". The
   partner terms set a 6pm deadline, and the code pauses late partners from cash jobs, alerts an admin at 24
   hours and flags the case for review at 72 hours. Is enforcing without guaranteeing consistent? Should the
   disclaimers mention the deadline and the pause?
2. **Two pay-on-delivery set-ups, one set of terms.** The partner terms describe only the older cash-job flow
   (delivery code, 6pm, pause). The marketplace's per-connection pay on delivery (`docs/logistics-marketplace.md`,
   "Pay on delivery") is "a record only" and doesn't use the 6pm rule. Should the terms cover both, or should the
   two be merged?
3. **Shopinbos decides disputes and takes money from payments.** Disputes go to the Shopinbos team, debts are
   deducted from payments, and partners are hidden from new shops. That is more than software. Does this need an
   arbitration or appeal clause beyond "write to legal@shopinbos.com"? Do the Paystack split deductions need the
   partner's express prior consent at signup?
4. **Vetting and the verified badge.** Shopinbos checks documents and shows a badge. Does that create a duty of
   care to sellers or buyers if a verified partner loses goods? The insurance certificate is only *required* for
   fleet operations (`shared/verification-docs.ts:89`). The terms say goods-in-transit insurance is needed to join.
5. **Hiding the partner from the customer.** Sellers can show a generic label instead of the partner's name.
   Under consumer protection rules (FCCPA 2018), does the buyer need to know who is carrying their goods, or that
   it isn't the shop?
6. **Riders joining directly.** The terms say "Riders joining directly need a valid ID, a roadworthy bike and a
   guarantor". The app has no way for a rider to join on their own: riders are added by a delivery company. Remove
   the clause or keep it for later?
7. **Rider location.** The privacy policy mentions only "approximate location" for app users. The Riders app
   records precise GPS during jobs, keeps it for 7 days and uses it as dispute evidence. Do riders need their own
   notice or consent under the NDPA?
8. **Pay-in accounts, if switched back on.** `PAYSTACK_DVA_ENABLED=true` would make cash land in Shopinbos's
   Paystack balance. That contradicts every "never holds" line and may need a licence. Recommend it stays off
   unless counsel clears it.

## 4. Inconsistencies found and what was done

1. **Fixed (this change):** the late-cash card told partners to "Pay in the usual way, then tell us how much you
   paid on the Cash page". That was left over from the pay-in model. It now says "Pay each seller straight to
   their bank, or hand them the cash and they'll confirm it." (`logistics: payin.usualWay`,
   `m_partner: overdue.manual`, all five languages).
2. **Fixed (this change):** the web cash page showed "Paid to the seller" and "Seller confirmed" in English only,
   and the app listed those payments as "Transfer". Both now use translated labels (`cash.method.seller*`,
   `money.method.seller*`).
3. **Open, product decision:** the partner terms promise that "up to half of each delivery fee paid to you in the
   app goes to the shop" while a claim is unpaid. The code only deducts from fees a *seller pays in the app*, not
   from fees split at customer checkout, which is the main way partners get paid in the marketplace. Either change
   the terms ("fees a shop pays you in the app") or extend the deduction to checkout splits.
4. **Still in the app but unreachable while pay-in accounts are off:** "To your pay-in account" and "Settled with
   the Shopinbos team" labels for older pay-ins. They only show for historic records, and there are none in
   production.

## 5. Questions for counsel (please answer each)

- [ ] Approve or reword the three pay-on-delivery disclaimers (section 2), including whether they should mention
      the 6pm rule and the pause.
- [ ] Is it consistent to say Shopinbos doesn't "guarantee" pay-on-delivery cash while it enforces passing it on
      (3.1)?
- [ ] Should one set of terms cover both pay-on-delivery set-ups (3.2)?
- [ ] Dispute decisions and payment deductions: is the current wording and consent enough (3.3)?
- [ ] Verified badge and insurance: what wording limits Shopinbos's liability (3.4)? Should insurance be required
      for every partner?
- [ ] Is the generic delivery label allowed (3.5)?
- [ ] Drop or keep the clause on riders joining directly (3.6)?
- [ ] Do riders need a separate location notice (3.7)?
- [ ] Confirm pay-in accounts stay off (3.8).
- [ ] Translations: the Pidgin, Yorùbá, Hausa and Igbo versions of the disclaimers must say exactly the same as
      the English. They are in `shared/i18n/messages/delivery/<lang>.ts` (`pod.disclaimer*`) and
      `shared/i18n/messages/m_partner/<lang>.ts` (`cashScreen.sub`, `job.podBody`). All are AI drafts awaiting a
      native speaker (see `docs/i18n-review-logistics.md`).

When counsel signs off, remove the `LEGAL REVIEW` note at the top of `shared/i18n/messages/delivery/en.ts` and the
line in `docs/logistics-marketplace.md`, and tick the item in `SHOPINBOS_APP_SYNC.md`.
