// Shopinbos Wallet: payments are split by Paystack straight to each business's own bank (Shopinbos gets nothing),
// KYC input checks, and the account-name check against the verified ID.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const rules = await import("../src/lib/wallet/rules.ts");
const refunds = await import("../src/lib/commerce/refunds.ts");

test("one seller: the whole payment goes to the seller's subaccount, Shopinbos's charge is zero, the seller bears the fee", () => {
  const plan = rules.buildSplitPlan({ totalKobo: 2_500_000, sellerSubaccount: "ACCT_seller", suppliers: [] });
  assert.equal(plan.sellerKobo, 2_500_000);
  assert.deepEqual(plan.suppliers, []);
  assert.deepEqual(rules.paystackSplitParams(plan), { subaccount: "ACCT_seller", transaction_charge: 0, bearer: "subaccount" });
});

test("dropship: each supplier with a wallet gets exactly its cost, the seller the rest, and the shares add up to the total", () => {
  const plan = rules.buildSplitPlan({
    totalKobo: 3_000_000,
    sellerSubaccount: "ACCT_seller",
    suppliers: [
      { supplierId: "s1", subaccount: "ACCT_s1", costKobo: 1_200_000 },
      { supplierId: "s2", subaccount: null, costKobo: 500_000 },
      { supplierId: "s3", subaccount: "ACCT_s3", costKobo: 0 },
    ],
  });
  assert.equal(plan.sellerKobo, 1_800_000, "the supplier without a wallet's cost stays with the seller");
  assert.deepEqual(plan.suppliers, [{ supplierId: "s1", subaccount: "ACCT_s1", kobo: 1_200_000 }]);
  assert.deepEqual(plan.sellerSettles, [{ supplierId: "s2", kobo: 500_000 }]);
  const params = rules.paystackSplitParams(plan);
  assert.equal(params.split.type, "flat");
  assert.equal(params.split.bearer_type, "all-proportional");
  const shares = params.split.subaccounts.reduce((sum, row) => sum + row.share, 0);
  assert.equal(shares, plan.totalKobo, "nothing is left over for the main (Shopinbos) account");
});

test("suppliers' costs above the total: nobody but the seller is split, so Paystack is never asked for more than was paid", () => {
  const plan = rules.buildSplitPlan({ totalKobo: 100_000, sellerSubaccount: "ACCT_seller", suppliers: [{ supplierId: "s1", subaccount: "ACCT_s1", costKobo: 150_000 }] });
  assert.equal(plan.sellerKobo, 100_000);
  assert.deepEqual(plan.suppliers, []);
  assert.deepEqual(plan.sellerSettles, [{ supplierId: "s1", kobo: 150_000 }]);
  assert.equal(rules.readSplitPlan(JSON.parse(JSON.stringify(plan))).sellerKobo, 100_000);
  assert.equal(rules.readSplitPlan(null), null);
  assert.equal(rules.readSplitPlan({ version: 2 }), null);
});

test("KYC input: 11-digit IDs, adults only, five failed checks a day", () => {
  assert.equal(rules.cleanIdNumber("2222 2222 222"), "22222222222");
  assert.equal(rules.cleanIdNumber("1234567890"), null);
  assert.equal(rules.cleanIdNumber("2222222222a"), null);
  const today = new Date("2026-11-07T10:00:00Z");
  assert.equal(rules.adultDateOfBirth("1990-02-28", today), true);
  assert.equal(rules.adultDateOfBirth("2010-01-01", today), false, "under 18");
  assert.equal(rules.adultDateOfBirth("1990-02-30", today), false, "not a real date");
  assert.equal(rules.adultDateOfBirth("28/02/1990", today), false);
  const day = rules.lagosDay(today);
  assert.equal(rules.kycAttemptAllowed({ kycAttempts: 5, kycAttemptDay: day }, today), false);
  assert.equal(rules.kycAttemptAllowed({ kycAttempts: 4, kycAttemptDay: day }, today), true);
  assert.equal(rules.kycAttemptAllowed({ kycAttempts: 5, kycAttemptDay: "2026-11-06" }, today), true, "a new day starts again");
  assert.equal(rules.lagosDay(new Date("2026-11-06T23:30:00Z")), "2026-11-07", "Lagos is an hour ahead");
});

test("the bank account must be in the verified person's name (any order, punctuation and case ignored)", () => {
  const person = { firstName: "Adaeze", lastName: "Obi" };
  assert.equal(rules.accountNameMatches("OBI, ADAEZE CHIOMA", person), true);
  assert.equal(rules.accountNameMatches("adaeze obi", person), true);
  assert.equal(rules.accountNameMatches("ADA STORES LIMITED", person), false, "a company account goes to the team");
  assert.equal(rules.accountNameMatches("ADAEZE NWOSU", person), false);
  assert.equal(rules.accountNameMatches("ADAEZE OBI", { firstName: null, lastName: "Obi" }), false);
  assert.equal(rules.maskAccountNumber("0123456789"), "******6789");
});

test("a split order's refund is the seller's to make: Shopinbos never held the money", () => {
  assert.equal(refunds.refundRoute({ id: "o1", paymentMethod: null, paystackRef: "o1", paymentSplit: { version: 1 } }), "manual");
  assert.equal(refunds.refundRoute({ id: "o1", paymentMethod: null, paystackRef: "o1" }), "paystack");
});

test("checkout: card only with the seller's wallet, split started on the server, and only that transaction pays the order", () => {
  const checkout = read("src/app/api/public/store/[slug]/checkout/route.ts");
  assert.match(checkout, /paystackSecretReady\(paystackSecret\) && \(await storeTakesCards\(store\.id\)\)/);
  assert.match(checkout, /split: paystackSplitParams\(plan\)/);
  assert.match(checkout, /paymentSplit: JSON\.parse\(JSON\.stringify\(plan\)\)/);
  assert.match(checkout, /cancelUnstartedOrder\(order\.id/);
  const action = read("src/app/actions/payments.ts");
  assert.match(action, /if \(order\.paymentSplit && reference !== orderId\)/, "a client-made transaction would land in Shopinbos's account");
  const popup = read("src/components/payments/PaystackCheckout.tsx");
  assert.match(popup, /resumeTransaction\(accessCode/);
  assert.match(read("src/lib/commerce/order-paid.server.ts"), /recordOrderShares\(orderId\)/);
  // Each subaccount keeps the main account's share at zero.
  assert.match(read("src/lib/paystack.ts"), /percentage_charge: 0,/);
  // No ID check runs any more (tests/wallet-checks.test.mjs), and no full ID number is ever stored.
  assert.doesNotMatch(read("src/lib/wallet/wallet.server.ts"), /kycIdHash: |kycIdLast4: id/);
  assert.doesNotMatch(read("prisma/schema.prisma"), /kycIdNumber|bvnNumber/);
  assert.match(read("next.config.ts"), /frame-src https:\/\/js\.paystack\.co https:\/\/checkout\.paystack\.com/);
});

test("Shopinbos's fee: rate on the sale (not delivery), within min and max, never more than the base", () => {
  const fee = { rate: 1.5, minFee: 0, maxFee: 0 };
  assert.equal(rules.platformFeeKobo(1_000_000, fee), 15_000);
  assert.equal(rules.platformFeeKobo(1_000_000, null), 0, "no fee config: no fee");
  assert.equal(rules.platformFeeKobo(1_000_000, { rate: 0, minFee: 0, maxFee: 0 }), 0);
  assert.equal(rules.platformFeeKobo(100_000, { rate: 1.5, minFee: 100, maxFee: 0 }), 10_000, "minimum ₦100");
  assert.equal(rules.platformFeeKobo(100_000_000, { rate: 1.5, minFee: 0, maxFee: 2_000 }), 200_000, "maximum ₦2,000");
  assert.equal(rules.platformFeeKobo(5_000, { rate: 1.5, minFee: 100, maxFee: 0 }), 5_000, "never more than the sale");
});

test("the fee stays with Shopinbos: the seller's flat charge, or what a multi-split's shares leave over", () => {
  const solo = rules.buildSplitPlan({ totalKobo: 1_000_000, sellerSubaccount: "ACCT_seller", suppliers: [], platformKobo: 15_000 });
  assert.equal(solo.sellerKobo, 985_000);
  assert.equal(solo.platformKobo, 15_000);
  assert.deepEqual(rules.paystackSplitParams(solo), { subaccount: "ACCT_seller", transaction_charge: 15_000, bearer: "subaccount" });

  const multi = rules.buildSplitPlan({
    totalKobo: 1_500_000,
    sellerSubaccount: "ACCT_seller",
    suppliers: [{ supplierId: "s1", subaccount: "ACCT_s1", costKobo: 600_000 }],
    platformKobo: 22_500,
  });
  assert.equal(multi.sellerKobo, 1_500_000 - 600_000 - 22_500);
  const shares = rules.paystackSplitParams(multi).split.subaccounts.reduce((sum, row) => sum + row.share, 0);
  assert.equal(1_500_000 - shares, 22_500, "the remainder is Shopinbos's fee");
  const korapay = rules.korapaySplitParams({ ...multi, gateway: "korapay" }).split_configuration.split_accounts.reduce((sum, row) => sum + Number(row.value), 0);
  assert.equal(Math.round((15_000 - korapay) * 100), 22_500);
});

test("the fee never takes the seller below ₦100, and there's none when suppliers' costs use up the order", () => {
  const thin = rules.buildSplitPlan({ totalKobo: 700_000, sellerSubaccount: "ACCT_seller", suppliers: [{ supplierId: "s1", subaccount: "ACCT_s1", costKobo: 680_000 }], platformKobo: 15_000 });
  assert.equal(thin.sellerKobo, rules.MIN_SELLER_KOBO);
  assert.equal(thin.platformKobo, 700_000 - 680_000 - rules.MIN_SELLER_KOBO);
  const under = rules.buildSplitPlan({ totalKobo: 100_000, sellerSubaccount: "ACCT_seller", suppliers: [{ supplierId: "s1", subaccount: "ACCT_s1", costKobo: 150_000 }], platformKobo: 1_500 });
  assert.equal(under.platformKobo ?? 0, 0);
  assert.equal(under.sellerKobo, 100_000);
  const old = rules.buildSplitPlan({ totalKobo: 1_000_000, sellerSubaccount: "ACCT_seller", suppliers: [] });
  assert.equal(rules.paystackSplitParams(old).transaction_charge, 0, "no fee asked for: unchanged");
});

test("October 2026 fees: the supplier's commission comes off their share and stays with Shopinbos", async () => {
  const rules = await import("../src/lib/wallet/rules.ts");
  assert.equal(rules.supplierCommissionKobo(1_400_000, 6), 84_000, "6% of ₦14,000 is ₦840");
  assert.equal(rules.supplierCommissionKobo(0, 6), 0);
  assert.equal(rules.supplierCommissionKobo(100, 200), 100, "never more than the wholesale value");
  // The worked example: ₦20,000 dropship sale, ₦14,000 wholesale, supplier on Free (6%); the seller's fee is
  // waived on dropship lines, so only the supplier's commission is taken.
  const plan = rules.buildSplitPlan({
    totalKobo: 2_000_000,
    sellerSubaccount: "ACCT_seller",
    platformKobo: 0,
    suppliers: [{ supplierId: "sup1", subaccount: "ACCT_sup", costKobo: 1_400_000, commissionKobo: 84_000 }],
  });
  assert.equal(plan.suppliers[0].kobo, 1_316_000, "supplier nets ₦13,160");
  assert.equal(plan.suppliers[0].commissionKobo, 84_000);
  assert.equal(plan.sellerKobo, 600_000, "the seller keeps the ₦6,000 margin");
  assert.equal(plan.platformKobo, 84_000, "Shopinbos keeps the commission");
  assert.equal(plan.sellerKobo + plan.suppliers[0].kobo + plan.platformKobo, 2_000_000, "every kobo is accounted for");
  // A supplier without a wallet is paid by the seller: no commission can be taken in the split.
  const settles = rules.buildSplitPlan({ totalKobo: 2_000_000, sellerSubaccount: "ACCT_seller", suppliers: [{ supplierId: "sup1", subaccount: null, costKobo: 1_400_000, commissionKobo: 84_000 }] });
  assert.equal(settles.platformKobo, 0);
  assert.deepEqual(settles.sellerSettles, [{ supplierId: "sup1", kobo: 1_400_000 }]);
});

test("the seller's fee follows their plan and skips delivery and dropship lines", () => {
  const server = readFileSync(new URL("../src/lib/wallet/wallet.server.ts", import.meta.url), "utf8");
  assert.match(server, /storeFeeConfig\(prices, planKeyFor\("seller", seller\?\.aiCredits\)\)/);
  assert.match(server, /totalKobo - Math\.round\(Math\.max\(0, shippingNaira\) \* 100\) - dropshipKobo/);
  assert.match(server, /supplierCommissionPct\(book, planKeyFor\("supplier"/);
  const delivery = readFileSync(new URL("../src/lib/logistics/delivery-fee-payments.server.ts", import.meta.url), "utf8");
  assert.match(delivery, /jobFee\.effectiveRate/, "the job fee is 0 until switched on");
});

test("the prepaid balance is spend-only: no withdrawals, and any still in line go back on the balance", () => {
  const balance = read("src/lib/wallet/balance.server.ts");
  assert.doesNotMatch(balance, /withdrawToBank|"\/transfer"|createPaystackTransferRecipient/, "nothing pays the balance out");
  assert.match(balance, /canWithdraw: false,/);
  assert.match(balance, /export async function returnQueuedWithdrawals/);
  assert.match(read("src/app/api/cron/lifecycle/route.ts"), /returnQueuedWithdrawals\(\)/);
  const route = read("src/app/api/app/wallet/withdraw/route.ts");
  assert.match(route, /apiError\("BAD_REQUEST", "Your Shopinbos balance is for AI credits/);
  assert.doesNotMatch(read("src/components/wallet/WalletBalanceCard.tsx"), /wallet\/withdraw|> Withdraw/);
});

test("Paystack money is recognisably from Shopinbos and always told in the app and by email", async () => {
  const paystack = await import("../src/lib/paystack.ts").catch(() => null);
  const source = read("src/lib/paystack.ts");
  // Subaccounts carry "Shopinbos - <business>", once (never "Shopinbos - Shopinbos - …").
  assert.match(source, /business_name: shopinbosSubaccountName\(input\.businessName\)/);
  if (paystack?.shopinbosSubaccountName) {
    assert.equal(paystack.shopinbosSubaccountName("Tofs Variety Store"), "Shopinbos - Tofs Variety Store");
    assert.equal(paystack.shopinbosSubaccountName("Shopinbos - Tofs"), "Shopinbos - Tofs");
  }
  // Settlements are looked up by the subaccount's numeric id (the ACCT_ code matches nothing).
  assert.match(source, /settlement\?subaccount=\$\{encodeURIComponent\(id\)\}/);
  // A paid order is emailed to the seller too, whatever their settings.
  const events = read("src/lib/notifications/events.server.ts");
  assert.match(events.slice(events.indexOf("export function notifyOrderPaid")), /email: "transactional"/);
  assert.match(read("src/lib/wallet/settlements.server.ts"), /email: "transactional"/);
});
