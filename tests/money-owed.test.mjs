// Money owed between businesses: overdue debts are paid from the debtor's share of later sales (the split sends
// that part straight to the creditor's bank, Shopinbos holds nothing), payments never count twice, and claims
// stay within what the order was worth and the claim window.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const rules = await import("../src/lib/wallet/rules.ts");
const owed = await import("../src/lib/money-owed/rules.ts");

const sumShares = (plan) => rules.splitShares(plan).reduce((sum, share) => sum + share.kobo, 0) + (plan.platformKobo ?? 0);

test("an overdue supplier debt takes at most half the supplier's share, straight to the shop it's owed to", () => {
  const plan = rules.buildSplitPlan({
    totalKobo: 3_000_000,
    sellerSubaccount: "ACCT_seller",
    suppliers: [{ supplierId: "s1", subaccount: "ACCT_s1", costKobo: 1_200_000 }],
    debts: [{ debtId: "d1", from: "s1", to: "ACCT_shop2", availableKobo: 5_000_000 }],
  });
  assert.deepEqual(plan.deductions, [{ debtId: "d1", from: "s1", to: "ACCT_shop2", kobo: 600_000 }]);
  assert.equal(plan.suppliers[0].kobo, 600_000, "the supplier keeps half its cost");
  assert.equal(plan.sellerKobo, 1_800_000, "the seller's share doesn't change");
  assert.equal(sumShares(plan), 3_000_000, "the shares still add up to what the buyer paid");
  const params = rules.paystackSplitParams(plan);
  assert.deepEqual(params.split.subaccounts, [
    { subaccount: "ACCT_seller", share: 1_800_000 },
    { subaccount: "ACCT_s1", share: 600_000 },
    { subaccount: "ACCT_shop2", share: 600_000 },
  ]);
});

test("a supplier paying back the very shop selling its product: one share per account", () => {
  const plan = rules.buildSplitPlan({
    totalKobo: 3_000_000,
    sellerSubaccount: "ACCT_seller",
    suppliers: [{ supplierId: "s1", subaccount: "ACCT_s1", costKobo: 1_200_000 }],
    debts: [{ debtId: "d1", from: "s1", to: "ACCT_seller", availableKobo: 250_000 }],
  });
  assert.equal(plan.deductions[0].kobo, 250_000, "never more than is owed");
  const shares = rules.paystackSplitParams(plan).split.subaccounts;
  assert.deepEqual(shares, [{ subaccount: "ACCT_seller", share: 2_050_000 }, { subaccount: "ACCT_s1", share: 950_000 }]);
  assert.equal(shares.reduce((sum, row) => sum + row.share, 0), 3_000_000);
});

test("a seller owing Shopinbos (a chargeback): the part stays in Shopinbos's balance as the main account's charge", () => {
  const plan = rules.buildSplitPlan({ totalKobo: 2_000_000, sellerSubaccount: "ACCT_seller", suppliers: [], platformKobo: 30_000, debts: [{ debtId: "cb", from: "seller", to: null, availableKobo: 400_000 }] });
  assert.equal(plan.platformKobo, 430_000);
  assert.equal(plan.sellerKobo, 1_570_000);
  assert.deepEqual(rules.paystackSplitParams(plan), { subaccount: "ACCT_seller", transaction_charge: 430_000, bearer: "subaccount" });
  assert.equal(sumShares(plan), 2_000_000);
});

test("several debts from one business share the same half, oldest first, and tiny parts are skipped", () => {
  const plan = rules.buildSplitPlan({
    totalKobo: 1_000_000,
    sellerSubaccount: "ACCT_seller",
    suppliers: [],
    debts: [
      { debtId: "old", from: "seller", to: "ACCT_a", availableKobo: 300_000 },
      { debtId: "new", from: "seller", to: "ACCT_b", availableKobo: 300_000 },
      { debtId: "unknown", from: "s9", to: "ACCT_c", availableKobo: 300_000 },
    ],
  });
  assert.deepEqual(plan.deductions.map((row) => [row.debtId, row.kobo]), [["old", 300_000], ["new", 200_000]]);
  assert.equal(plan.sellerKobo, 500_000);

  const small = rules.buildSplitPlan({ totalKobo: 15_000, sellerSubaccount: "ACCT_seller", suppliers: [], debts: [{ debtId: "d", from: "seller", to: "ACCT_a", availableKobo: 100_000 }] });
  assert.equal(small.deductions, undefined, "a share too small to split is left alone");
  assert.equal(small.sellerKobo, 15_000);
});

test("no debts: the plan is exactly what it was", () => {
  const plan = rules.buildSplitPlan({ totalKobo: 2_500_000, sellerSubaccount: "ACCT_seller", suppliers: [] });
  assert.equal(plan.deductions, undefined);
  assert.deepEqual(rules.paystackSplitParams(plan), { subaccount: "ACCT_seller", transaction_charge: 0, bearer: "subaccount" });
  assert.deepEqual(rules.readSplitPlan(JSON.parse(JSON.stringify(plan))).deductions, []);
});

test("Korapay gets the same shares, merged per account", () => {
  const plan = rules.buildSplitPlan({
    gateway: "korapay",
    totalKobo: 3_000_000,
    sellerSubaccount: "KPY-SPA-seller",
    suppliers: [{ supplierId: "s1", subaccount: "KPY-SPA-s1", costKobo: 1_000_000 }],
    debts: [{ debtId: "d1", from: "s1", to: "KPY-SPA-seller", availableKobo: 200_000 }],
  });
  assert.deepEqual(rules.korapaySplitParams(plan).split_configuration.split_accounts, [
    { value: "22000.00", split_account_reference: "KPY-SPA-seller" },
    { value: "8000.00", split_account_reference: "KPY-SPA-s1" },
  ]);
});

test("a payment never counts twice: anything on top of what's owed is owed back", () => {
  assert.deepEqual(owed.applyPayment({ amountKobo: 500_000, paidKobo: 0 }, 200_000), { credit: 200_000, excess: 0, paidKobo: 200_000, settled: false });
  assert.deepEqual(owed.applyPayment({ amountKobo: 500_000, paidKobo: 400_000 }, 200_000), { credit: 100_000, excess: 100_000, paidKobo: 500_000, settled: true });
  assert.deepEqual(owed.applyPayment({ amountKobo: 500_000, paidKobo: 500_000 }, 50_000), { credit: 0, excess: 50_000, paidKobo: 500_000, settled: true });
});

test("checkouts in progress hold their part, so two sales can't both take the same debt", () => {
  const now = new Date("2026-11-10T12:00:00Z");
  assert.equal(owed.deductibleKobo({ amountKobo: 500_000, paidKobo: 100_000 }, 300_000), 100_000);
  assert.equal(owed.deductibleKobo({ amountKobo: 500_000, paidKobo: 100_000 }, 900_000), 0);
  assert.equal(owed.deductionHolds({ status: "planned", createdAt: new Date(now.getTime() - 60 * 60_000) }, now), true);
  assert.equal(owed.deductionHolds({ status: "planned", createdAt: new Date(now.getTime() - 3 * 60 * 60_000) }, now), false, "an unpaid checkout lets go after 2 hours");
  assert.equal(owed.deductionHolds({ status: "applied", createdAt: now }, now), false);
});

test("due in 3 days; overdue only while still owed", () => {
  const now = new Date("2026-11-10T12:00:00Z");
  assert.equal(owed.dueDate(now).toISOString(), "2026-11-13T12:00:00.000Z");
  const past = new Date("2026-11-09T12:00:00Z");
  assert.equal(owed.debtIsOverdue({ status: "open", dueAt: past, amountKobo: 100_000, paidKobo: 0 }, now), true);
  assert.equal(owed.debtIsOverdue({ status: "open", dueAt: past, amountKobo: 100_000, paidKobo: 100_000 }, now), false);
  assert.equal(owed.debtIsOverdue({ status: "disputed", dueAt: past, amountKobo: 100_000, paidKobo: 0 }, now), false, "nothing is owed while the team decides");
});

test("claims: the right reasons for the order, within its value, explained, and within 7 days of delivery", () => {
  const now = new Date("2026-11-10T12:00:00Z");
  const base = { target: "supplier_order", reason: "damaged", amountKobo: 500_000, maxKobo: 800_000, details: "Two of the bags arrived torn.", deliveredAt: new Date("2026-11-08T12:00:00Z"), now };
  assert.equal(owed.claimProblem(base), null);
  assert.match(owed.claimProblem({ ...base, reason: "lost_in_transit" }), /what went wrong/, "a supplier isn't responsible for a parcel after pickup");
  assert.equal(owed.claimProblem({ ...base, target: "booking", reason: "lost_in_transit" }), null);
  assert.match(owed.claimProblem({ ...base, amountKobo: 900_000 }), /at most ₦8,000/);
  assert.match(owed.claimProblem({ ...base, amountKobo: 5_000 }), /₦100/);
  assert.match(owed.claimProblem({ ...base, details: "bad" }), /what happened/);
  assert.match(owed.claimProblem({ ...base, deliveredAt: new Date("2026-11-01T12:00:00Z") }), /7 days/);
  assert.equal(owed.nairaToKobo("12,500.50"), 1_250_050);
  assert.equal(owed.nairaToKobo("abc"), null);
});

test("wired in: checkout holds deductions, a paid order applies them, the webhook confirms in-app payments", () => {
  const wallet = read("src/lib/wallet/wallet.server.ts");
  assert.match(wallet, /debts: orderId \? await debtsToDeduct\(debtors, gateway\) : \[\]/);
  assert.match(wallet, /holdPlannedDeductions\(orderId, plan\.deductions/);
  assert.match(wallet, /applyDeductions\(\{ key: order\.id/);
  const checkout = read("src/app/api/public/store/[slug]/checkout/route.ts");
  assert.equal((checkout.match(/shippingFee, order\.id\)/g) ?? []).length, 2, "both gateways pass the order");
  const webhook = read("src/app/api/webhooks/paystack/route.ts");
  assert.match(webhook, /startsWith\(DEBT_PAYMENT_PREFIX\)/);
  const server = read("src/lib/money-owed/money-owed.server.ts");
  assert.match(server, /FOR UPDATE/, "a debt row is locked while a payment is applied");
  assert.match(server, /transaction_charge: 0, bearer: "subaccount"/, "in-app payments go entirely to the creditor");
  const fees = read("src/lib/logistics/delivery-fee-payments.server.ts");
  assert.match(fees, /debtsToDeduct\(new Map\(\[\[booking\.logisticsPartner\.userId, "seller"\]\]\)/, "a delivery partner's debts come out of its delivery fees");
});
