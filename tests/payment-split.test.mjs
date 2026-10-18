import test from "node:test";
import assert from "node:assert/strict";

const split = await import("../src/lib/commerce/payment-split.ts");
const FEE = { rate: 1.5, minFee: 0, maxFee: 0 };
const base = { shippingFee: 0, supplierCost: 0, partnerDelivery: false, affiliateCommission: 0, balance: 0, fee: FEE };
const sumsUp = (plan, total) => assert.equal(Math.round((plan.sellerShare + plan.platformShare) * 100), Math.round(total * 100));

test("a plain store order: Shopinbos keeps its fee, the rest goes to the seller", () => {
  const plan = split.planSplit({ ...base, total: 10_000 });
  assert.equal(plan.fee, 150);
  assert.equal(plan.sellerShare, 9_850);
  assert.equal(plan.platformShare, 150);
  sumsUp(plan, 10_000);
  assert.equal(split.toKobo(plan.platformShare), 15_000);
});

test("the seller's own delivery stays with the seller; a partner's delivery fee is held and not charged a fee", () => {
  const own = split.planSplit({ ...base, total: 11_500, shippingFee: 1_500 });
  assert.equal(own.deliveryHeld, 0);
  assert.equal(own.fee, 172.5);
  const partner = split.planSplit({ ...base, total: 11_500, shippingFee: 1_500, partnerDelivery: true, supplierCost: 6_000 });
  assert.equal(partner.deliveryHeld, 1_500);
  assert.equal(partner.fee, 150); // 1.5% of the 10,000 the seller sells
  assert.equal(partner.supplierCost, 6_000);
  assert.equal(partner.sellerShare, 11_500 - 1_500 - 150 - 6_000);
  sumsUp(partner, 11_500);
});

test("affiliate commission is held for the affiliate", () => {
  const plan = split.planSplit({ ...base, total: 10_000, affiliateCommission: 500 });
  assert.equal(plan.affiliate, 500);
  assert.equal(plan.sellerShare, 10_000 - 150 - 500);
});

test("min and max fee", () => {
  assert.equal(split.platformFee(1_000, { rate: 1.5, minFee: 100, maxFee: 0 }), 100);
  assert.equal(split.platformFee(1_000_000, { rate: 1.5, minFee: 0, maxFee: 2_000 }), 2_000);
  assert.equal(split.platformFee(50, { rate: 1.5, minFee: 100, maxFee: 0 }), 50, "never more than the order");
  assert.equal(split.platformFee(0, FEE), 0);
});

test("no split when nothing (or too little) is left for the seller", () => {
  assert.equal(split.planSplit({ ...base, total: 5_000, supplierCost: 5_200 }), null, "dropship sold below cost");
  assert.equal(split.planSplit({ ...base, total: 90 }), null, "below Paystack's minimum");
});

test("a debt from refunds is taken from the seller's share, leaving at least the minimum", () => {
  const some = split.planSplit({ ...base, total: 10_000, balance: 2_000 });
  assert.equal(some.balanceApplied, 2_000);
  assert.equal(some.sellerShare, 7_850);
  sumsUp(some, 10_000);
  const big = split.planSplit({ ...base, total: 10_000, balance: 50_000 });
  assert.equal(big.sellerShare, split.MIN_SELLER_SHARE);
  assert.equal(big.balanceApplied, 9_850 - split.MIN_SELLER_SHARE);
  sumsUp(big, 10_000);
});

test("money Shopinbos owes the seller is paid back out of Shopinbos's part only", () => {
  const plan = split.planSplit({ ...base, total: 10_000, balance: -100 });
  assert.equal(plan.balanceApplied, -100);
  assert.equal(plan.sellerShare, 9_950);
  const capped = split.planSplit({ ...base, total: 10_000, supplierCost: 4_000, balance: -100_000 });
  assert.equal(capped.platformShare, 0, "pays back at most what Shopinbos would keep");
  assert.equal(capped.sellerShare, 10_000);
});

test("a refund puts back the seller's share and undoes what the order recovered", () => {
  // Owed 2,000; an order recovers it; the order is refunded: they now owe what they got plus the 2,000 again.
  const plan = split.planSplit({ ...base, total: 10_000, balance: 2_000 });
  const debt = split.refundDebt(plan);
  assert.equal(debt, 9_850);
  const balanceAfter = 2_000 - plan.balanceApplied + debt;
  assert.equal(balanceAfter, 2_000 + plan.sellerShare, "old debt is back, plus the share they kept");
  // Paid back 100 by an order that was then refunded: they owe the share minus the 100 that was theirs.
  const credit = split.planSplit({ ...base, total: 10_000, balance: -100 });
  assert.equal(split.refundDebt(credit), 9_850);
});

test("stored split reads back only well-formed values", () => {
  const plan = split.planSplit({ ...base, total: 10_000 });
  assert.equal(split.readStoredSplit({ mode: "split", subaccount: "ACCT_x", ...plan })?.mode, "split");
  assert.equal(split.readStoredSplit({ mode: "held", reason: "disabled" })?.mode, "held");
  assert.equal(split.readStoredSplit({ mode: "split" }), null);
  assert.equal(split.readStoredSplit(null), null);
  assert.equal(split.readStoredSplit("x"), null);
});
