# Paystack split payments

With `PAYSTACK_SPLITS=on`, the seller's share of every card order settles straight to their own bank through a
Paystack subaccount. Shopinbos never holds it. Shopinbos's balance keeps only what isn't the seller's.

| Part of the order | Goes to |
|---|---|
| Seller's share, less Paystack's charge (the seller bears it, `bearer: "subaccount"`) | Seller's subaccount → their payout bank |
| Shopinbos's fee: `PlatformFeeConfig.rate` % of the order minus partner delivery, within `minFee` / `maxFee` (no row = 1.5%) | Shopinbos |
| Dropship suppliers' cost (wholesale price × quantity) | Held by Shopinbos, paid to the supplier once they ship (suppliers can be switched or the order refunded before then) |
| Delivery fee on orders with dropship items (a Shopinbos delivery partner carries them) | Held for the partner |
| Affiliate commission | Held for the affiliate |

The arithmetic is in `src/lib/commerce/payment-split.ts`, with tests in `tests/payment-split.test.mjs`. The database
side is in `src/lib/commerce/payment-split.server.ts`.

## How it runs

1. **Subaccount.** It's created (or moved to the new bank) when the seller saves a payout bank (`src/lib/payout-bank.ts`).
   Sellers who saved a bank before this get one on their next card order, built from the account number Paystack
   returned back then.
2. **Checkout.** Every card order now starts on the server (`/transaction/initialize`), and the storefront popup
   resumes it with the access code (`PaystackResumeButton`, `@paystack/inline-js`). The reference is always the
   order ID, and the split goes in as `subaccount` + `transaction_charge` (Shopinbos's part, in kobo) + `bearer`.
   The browser can't change any of it.
3. **The order records how it was paid** in `RetailOrder.paymentSplit`:
   - `{ mode: "split", subaccount, sellerShare, platformShare, fee, supplierCost, deliveryHeld, affiliate, balanceApplied }`
   - `{ mode: "held", reason }`, where `reason` is one of:
     - `disabled`: splits are off
     - `no_subaccount`: no bank, or Paystack refused the subaccount
     - `nothing_to_seller`: the costs use up the order, or the share is under ₦100
     - `error`: Paystack refused the split. Checkout then charges without it, so the buyer can still pay and the money comes to Shopinbos.

   Held orders are paid to Shopinbos as before.

## Refunds and the seller's balance

Paystack takes a refund from Shopinbos's balance, but by then the seller's share has usually settled. So each
refunded split order adds what the seller received to their balance, a `refund` entry in `SellerBalanceEntry`.
Their next card orders take it back from their share, leaving at least ₦100 per order; each one adds a `recovered`
entry once it's paid. If Shopinbos ever owes the seller (negative balance), the next orders pay it back out of
Shopinbos's part.

- Entries are one per order and kind, so replayed webhooks can't count twice.
- An order that's never paid recovers nothing.
- The seller sees what they owe on `/home/payouts`, and the phone app gets it as `splitBalance` from `GET /api/app/payouts`.

**Confirm with Paystack before turning splits on:** that refunds and chargebacks on split transactions come out of
the main balance, not the subaccount. Their docs don't say. If Paystack takes it from the subaccount, the
seller would be charged twice: switch the recovery off by not recording `refund` entries
(`recordRefundedSplit` in `src/lib/commerce/refunds.server.ts`).

Only refunds Shopinbos starts (`refundLatePayment`, `refundCancelledOrder`) are tracked. A refund made by hand
in the Paystack dashboard isn't, so add a `SellerBalanceEntry` (kind `adjustment`) for it.

## Turning it on

1. Run `docs/migrations/2026-11-08-paystack-split.sql`, then deploy.
2. Ask Paystack to confirm that split payments (subaccounts) are enabled on the live business, and how refunds on
   split transactions are funded (see above).
3. Optional: set the fee. Add a `PlatformFeeConfig` row (`rate`, `minFee`, `maxFee`); with none, it's 1.5%.
4. Set `PAYSTACK_SPLITS=on` in Vercel and redeploy.
5. Check one real order. In the Paystack dashboard the transaction should show the subaccount, and its split
   should match `RetailOrder.paymentSplit`.

To turn it off, unset `PAYSTACK_SPLITS`. New orders are paid to Shopinbos again, and existing balances stay recorded.
