// Who pays when things go wrong (shared/fault-matrix.ts): every row of the owner's table, on a dropship order with a
// supplier's share, delivery fees, a seller's own part (partial orders), pay on delivery, and the evidence rules.
import test from "node:test";
import assert from "node:assert/strict";

const m = await import("../shared/fault-matrix.ts");

// SB-1001: a supplier's parcel (₦20,000 of goods costing ₦15,000; 5% commission; ₦2,500 delivery by partner p1 whose
// card says ₦1,000 failed attempt and ₦1,500 return) and the seller's own ₦10,000 item (2% fee, collected in store).
const SUP = {
  key: "supplier:sup_a",
  supplierId: "sup_a",
  goodsKobo: 2_000_000,
  supplierPaidKobo: 1_425_000,
  platformKobo: 75_000,
  deliveryChargeKobo: 250_000,
  partner: { partnerId: "p1", paidKobo: 250_000, failedAttemptFeeKobo: 100_000, returnFeeKobo: 150_000 },
};
const OWN = { key: "own", supplierId: null, goodsKobo: 1_000_000, supplierPaidKobo: 0, platformKobo: 20_000, deliveryChargeKobo: 0, partner: null };
const order = (over = {}) => ({ orderNumber: "SB-1001", goodsPaid: true, split: true, parts: [SUP, OWN], ...over });
const supplierOnly = { partKeys: ["supplier:sup_a"] };
const margin = 2_000_000 - 1_500_000; // retail less the supplier's whole cost (their pay + Shopinbos's commission)

const debt = (outcome, from, to) => outcome.debts.filter((row) => row.from.role === from && row.to.role === to).reduce((sum, row) => sum + row.kobo, 0);
const sumNets = (outcome) => Object.values(m.partyNets(outcome)).reduce((sum, kobo) => sum + kobo, 0);

test("every outcome balances: what the customer gets back is exactly what the businesses and Shopinbos give up", () => {
  for (const event of m.FAULT_EVENTS) {
    for (const remedy of ["refund", "replacement"]) {
      if (remedy === "replacement" && !m.REPLACEABLE.includes(event)) continue;
      for (const keys of [undefined, ["supplier:sup_a"], ["own"]]) {
        const outcome = m.resolveFault({ event, order: order(), partKeys: keys, remedy });
        assert.equal(sumNets(outcome), 0, `${event}/${remedy}/${keys}`);
        assert.equal(outcome.refundKobo, outcome.refundFromSellerKobo + outcome.refundFromShopinbosKobo);
        assert.ok(outcome.debts.every((row) => row.kobo > 0), "no zero or negative debts");
      }
    }
  }
});

test("1. out of stock after payment: full refund, supplier unpaid with a strike, seller loses margin and fee, partner returns an unused fee", () => {
  const out = m.resolveFault({ event: "out_of_stock", order: order(), ...supplierOnly });
  assert.equal(out.refundKobo, 2_250_000, "goods and the delivery the customer paid");
  assert.equal(out.refundFromShopinbosKobo, 75_000, "Shopinbos gives back its commission ('no fee')");
  assert.equal(out.refundFromSellerKobo, 2_175_000);
  assert.equal(debt(out, "supplier", "seller"), 1_425_000, "the supplier's pay goes back to the shop");
  assert.equal(debt(out, "logistics", "seller"), 250_000, "a trip never made");
  assert.deepEqual(out.strikes, [{ supplierId: "sup_a", kind: "out_of_stock" }]);
  assert.equal(m.partyNets(out).seller, -margin, "the seller is left without the margin, nothing more");
  assert.equal(out.itemBack, false);
  assert.match(out.lines.customer, /Full refund: ₦22,500/);
  assert.match(out.lines.supplier, /₦14,250 deducted from your next payments.*strike/);
  assert.match(out.lines.seller, /No margin/);
  assert.match(out.lines.logistics, /Not involved/);
});

test("1b. the seller's own part out of stock: the seller refunds it, no strike, nobody else owes", () => {
  const out = m.resolveFault({ event: "out_of_stock", order: order(), partKeys: ["own"] });
  assert.equal(out.refundKobo, 1_000_000);
  assert.equal(out.refundFromShopinbosKobo, 20_000, "Shopinbos returns its fee on the line");
  assert.deepEqual(out.debts, []);
  assert.deepEqual(out.strikes, []);
  assert.equal(out.lines.supplier, null);
});

test("2. shipped late, cancelled by the customer: full refund, a late strike, margin lost", () => {
  const out = m.resolveFault({ event: "shipped_late", order: order(), ...supplierOnly });
  assert.equal(out.refundKobo, 2_250_000);
  assert.deepEqual(out.strikes, [{ supplierId: "sup_a", kind: "late" }]);
  assert.equal(out.debts.find((row) => row.from.role === "supplier").reason, "shipped_late");
  assert.equal(m.partyNets(out).seller, -margin);
});

test("2b. the whole order (two parts) cancelled: refund both, only the supplier is struck", () => {
  const out = m.resolveFault({ event: "shipped_late", order: order() });
  assert.equal(out.refundKobo, 3_250_000);
  assert.equal(out.refundFromShopinbosKobo, 95_000);
  assert.equal(out.strikes.length, 1);
});

test("3. wrong or damaged item (packing photo shows it), refund: supplier pays back its pay, the delivery and the return trip", () => {
  const out = m.resolveFault({ event: "wrong_item", order: order(), ...supplierOnly });
  assert.equal(out.refundKobo, 2_250_000);
  assert.equal(debt(out, "supplier", "seller"), 1_675_000, "its pay and the delivery the customer paid");
  assert.equal(debt(out, "supplier", "logistics"), 150_000, "the trip back (rate card)");
  assert.deepEqual(out.trips, [{ partKey: "supplier:sup_a", partnerId: "p1", kind: "return", feeKobo: 150_000, paidBy: "supplier" }]);
  assert.equal(m.partyNets(out)["logistics:p1"], 150_000, "paid for both trips: kept the first fee, gets the return");
  assert.equal(m.partyNets(out).seller, -margin, "a refund undoes the sale");
  assert.ok(out.itemBack);
});

test("3b. wrong item, replacement: the customer pays nothing, the seller keeps the margin, the supplier pays both new trips", () => {
  const out = m.resolveFault({ event: "wrong_item", order: order(), ...supplierOnly, remedy: "replacement" });
  assert.equal(out.refundKobo, 0);
  assert.deepEqual(out.replacements, [{ partKey: "supplier:sup_a", supplierId: "sup_a" }]);
  assert.equal(debt(out, "supplier", "logistics"), 400_000, "return ₦1,500 + the replacement's ₦2,500");
  assert.equal(m.partyNets(out).seller, 0, "keeps margin on the replacement");
  assert.deepEqual(out.trips.map((trip) => [trip.kind, trip.paidBy]), [["return", "supplier"], ["replacement", "supplier"]]);
  assert.match(out.lines.customer, /replacement/);
  assert.match(out.lines.seller, /keep your margin/);
});

test("3c. wrong item from the seller's own stock: the seller bears it", () => {
  const out = m.resolveFault({ event: "wrong_item", order: order(), partKeys: ["own"] });
  assert.equal(out.refundKobo, 1_000_000);
  assert.deepEqual(out.debts, []);
});

test("4. damaged in transit (packing photo fine): the partner pays the refund (deposit first), supplier and seller keep theirs", () => {
  const out = m.resolveFault({ event: "damaged_in_transit", order: order(), ...supplierOnly });
  assert.equal(out.refundKobo, 2_250_000);
  assert.equal(out.refundFromShopinbosKobo, 0, "the sale stands: Shopinbos keeps its commission");
  assert.equal(debt(out, "logistics", "seller"), 2_250_000, "the goods and its own fee");
  assert.equal(m.partyNets(out).seller, 0, "seller paid");
  assert.equal(m.partyNets(out)["supplier:sup_a"] ?? 0, 0, "supplier paid");
  const deposit = m.resolveFault({ event: "damaged_in_transit", order: order(), ...supplierOnly, partnerDepositKobo: 500_000 });
  assert.equal(deposit.depositKobo, 500_000);
  assert.equal(deposit.debts.filter((row) => !row.fromDeposit).reduce((sum, row) => sum + row.kobo, 0), 1_750_000, "the rest is owed");
  assert.match(deposit.lines.logistics, /₦5,000 from your deposit; ₦17,500 deducted/);
});

test("4b. damaged in transit, replacement: the partner pays the supplier for another one and redelivers free", () => {
  const out = m.resolveFault({ event: "damaged_in_transit", order: order(), ...supplierOnly, remedy: "replacement" });
  assert.equal(out.refundKobo, 0);
  assert.equal(debt(out, "logistics", "supplier"), 1_425_000);
  assert.deepEqual(out.trips, [{ partKey: "supplier:sup_a", partnerId: "p1", kind: "replacement", feeKobo: 0, paidBy: "logistics" }]);
  assert.equal(m.partyNets(out).seller, 0);
});

test("5. customer unreachable: refund less the delivery fee and the trip back; supplier gets the item back; partner paid", () => {
  const out = m.resolveFault({ event: "customer_unreachable", order: order(), ...supplierOnly });
  assert.equal(out.customerChargedKobo, 250_000, "failed attempt ₦1,000 + return ₦1,500 from the rate card");
  assert.equal(out.refundKobo, 1_750_000, "₦20,000 goods − ₦2,500 trips; the ₦2,500 delivery fee isn't refunded");
  assert.equal(debt(out, "supplier", "seller"), 1_425_000);
  assert.equal(debt(out, "seller", "logistics"), 250_000, "kept from the refund, paid on to the partner");
  assert.equal(m.partyNets(out).seller, -margin);
  assert.equal(m.partyNets(out)["logistics:p1"], 250_000);
  assert.ok(out.itemBack);
  assert.match(out.lines.customer, /₦2,500 kept for the failed delivery/);
});

test("6. customer changed their mind: return at their own cost; supplier unpaid until resold; partner paid both trips", () => {
  const out = m.resolveFault({ event: "changed_mind", order: order(), ...supplierOnly });
  assert.equal(out.refundKobo, 1_850_000, "goods less the ₦1,500 return; the first delivery isn't refunded");
  assert.equal(debt(out, "supplier", "seller"), 1_425_000);
  assert.equal(debt(out, "seller", "logistics"), 150_000);
  assert.equal(m.partyNets(out).seller, -margin);
  const sellerPays = m.resolveFault({ event: "changed_mind", order: order(), ...supplierOnly, returnPayer: "seller" });
  assert.equal(sellerPays.refundKobo, 2_000_000);
  assert.equal(m.partyNets(sellerPays).seller, -margin - 150_000, "the seller's free returns cost them the trip");
});

test("7. pay on delivery, customer won't pay at the door: loses the fee paid upfront, nobody owes, nothing refunded", () => {
  const pod = order({ goodsPaid: false });
  const out = m.resolveFault({ event: "pod_refused", order: pod });
  assert.equal(out.refundKobo, 0);
  assert.deepEqual(out.debts, []);
  assert.ok(out.itemBack);
  assert.match(out.lines.customer, /delivery fee paid upfront isn't refunded/);
  assert.match(out.lines.logistics, /no cash handled/i);
  // Out of stock on a pay-on-delivery order: only the upfront fee was paid, and it comes back.
  const oos = m.resolveFault({ event: "out_of_stock", order: pod, ...supplierOnly });
  assert.equal(oos.refundKobo, 250_000);
  assert.equal(debt(oos, "supplier", "seller"), 0, "the supplier was never paid");
  assert.equal(debt(oos, "logistics", "seller"), 250_000);
});

test("orders without a split: no Shopinbos refund, nothing to take back from a supplier the seller pays directly", () => {
  const plain = order({ split: false, parts: [{ ...SUP, supplierPaidKobo: 0, partner: { ...SUP.partner, paidKobo: 0 } }, OWN] });
  const out = m.resolveFault({ event: "out_of_stock", order: plain, ...supplierOnly });
  assert.equal(out.refundFromShopinbosKobo, 0);
  assert.deepEqual(out.debts, []);
  assert.equal(out.strikes.length, 1);
});

test("debts under ₦100 are let go (Paystack can't settle them from a payment)", () => {
  const tiny = order({ parts: [{ ...SUP, partner: { ...SUP.partner, returnFeeKobo: 5_000 } }] });
  const out = m.resolveFault({ event: "wrong_item", order: tiny });
  assert.equal(debt(out, "supplier", "logistics"), 0);
});

test("problems: replacement only for wrong or damaged items, parts must exist", () => {
  assert.match(m.faultProblem({ event: "out_of_stock", order: order(), remedy: "replacement" }), /replaced/);
  assert.match(m.faultProblem({ event: "wrong_item", order: order(), partKeys: ["supplier:nope"] }), /isn't in this order/);
  assert.match(m.faultProblem({ event: "nope", order: order() }), /Pick what happened/);
  assert.throws(() => m.resolveFault({ event: "out_of_stock", order: order(), remedy: "replacement" }));
});

test("the evidence pre-selects the outcome: the sealed-parcel photos decide most disputes", () => {
  const all = { contentsPhoto: true, sealedPhoto: true, pickupPhoto: true, handoverPhoto: true, delivered: true, jobFailed: false, pickedUp: true };
  assert.equal(m.suggestFault("wrong_item", all).event, "wrong_item");
  assert.equal(m.suggestFault("damaged", all).event, "damaged_in_transit");
  assert.equal(m.suggestFault("damaged", { ...all, sealedPhoto: false }).event, "wrong_item", "no packing photo: the sender's");
  assert.equal(m.suggestFault("damaged", { ...all, contentsPhoto: false }).event, "wrong_item");
  assert.equal(m.suggestFault("not_delivered", all).event, null, "the handover photo shows it was delivered");
  assert.equal(m.suggestFault("not_delivered", { ...all, handoverPhoto: false }).event, "damaged_in_transit", "delivered without proof: lost");
  assert.equal(m.suggestFault("not_delivered", { ...all, delivered: false, jobFailed: true }).event, "customer_unreachable");
  assert.equal(m.suggestFault("not_delivered", { ...all, delivered: false, pickedUp: false }).event, "shipped_late");
  assert.equal(m.suggestFault("late", all).event, null);
});

test("ship-by: handling days are working days, ending 6pm in Lagos", () => {
  // Wednesday 28 Oct, 2 handling days → Friday 30 Oct 18:00 Lagos (17:00 UTC).
  assert.equal(m.shipByDate(new Date("2026-10-28T10:00:00Z"), 2).toISOString(), "2026-10-30T17:00:00.000Z");
  // Friday, 1 day → Monday.
  assert.equal(m.shipByDate(new Date("2026-10-30T10:00:00Z"), 1).toISOString(), "2026-11-02T17:00:00.000Z");
  // Late at night UTC is already the next day in Lagos.
  assert.equal(m.shipByDate(new Date("2026-10-28T23:30:00Z"), 1).toISOString(), "2026-10-30T17:00:00.000Z");
  assert.equal(m.shipByDate(new Date("2026-10-28T10:00:00Z"), null).toISOString(), "2026-10-29T17:00:00.000Z");
  const now = new Date("2026-10-31T09:00:00Z");
  assert.equal(m.isShippedLate({ status: "accepted", shipBy: "2026-10-30T17:00:00Z" }, now), true);
  assert.equal(m.isShippedLate({ status: "accepted", shipBy: "2026-10-30T17:00:00Z", shippedAt: "2026-10-30T12:00:00Z" }, now), false);
  assert.equal(m.isShippedLate({ status: "shipped", shipBy: "2026-10-30T17:00:00Z" }, now), false);
  assert.equal(m.isShippedLate({ status: "accepted", shipBy: null }, now), false);
});

test("strikes last 90 days; three still counting send the supplier to the team for review", () => {
  const now = new Date("2026-10-28T12:00:00Z");
  const at = (days) => ({ expiresAt: m.strikeExpires(new Date(now.getTime() - days * 86_400_000)) });
  const strikes = [at(10), at(50), at(89), at(91)];
  assert.equal(m.activeStrikes(strikes, now).length, 3);
  assert.equal(m.needsReview(m.activeStrikes(strikes, now).length), true);
  assert.equal(m.needsReview(2), false);
});

test("returns: the store's switch and window", () => {
  const now = new Date("2026-10-28T12:00:00Z");
  const delivered = { status: "delivered", deliveredAt: "2026-10-25T12:00:00Z" };
  assert.match(m.returnProblem({ returnsAllowed: false, returnWindowDays: 7, returnShippingPayer: "customer" }, delivered, now), /doesn't take returns/);
  assert.equal(m.returnProblem({ returnsAllowed: true, returnWindowDays: 7, returnShippingPayer: "customer" }, delivered, now), null);
  assert.match(m.returnProblem({ returnsAllowed: true, returnWindowDays: 2, returnShippingPayer: "customer" }, delivered, now), /close 2 days/);
  assert.match(m.returnProblem({ returnsAllowed: true, returnWindowDays: 7, returnShippingPayer: "customer" }, { status: "shipped", deliveredAt: null }, now), /once your order is delivered/);
  assert.equal(m.cleanReturnWindow(99), 30);
  assert.equal(m.cleanReturnWindow("x"), 7);
});

test("a parcel that came back: customer-side reasons resolve on their own; pay on delivery unpaid is row 7", () => {
  for (const reason of ["Customer didn't pick up calls", "Customer not at the address", "Customer refused the parcel", "Wrong or incomplete address", "Customer couldn't pay"]) {
    assert.ok(m.customerSideFailure(reason), reason);
  }
  assert.equal(m.customerSideFailure("Bike broke down"), false, "the partner's own problem waits for the team");
  assert.equal(m.returnedEvent({ paymentMethod: "pay_on_delivery", goodsPaid: false }), "pod_refused");
  assert.equal(m.returnedEvent({ paymentMethod: "pay_on_delivery", goodsPaid: true }), "customer_unreachable");
  assert.equal(m.returnedEvent({ paymentMethod: null, goodsPaid: true }), "customer_unreachable");
});

const rules = await import("../src/lib/wallet/rules.ts");
const owed = await import("../shared/money-owed.ts");

test("money owed is taken from every party's next payment: a delivery partner's fee in the split too", () => {
  const plan = rules.buildSplitPlan({
    totalKobo: 3_000_000,
    sellerSubaccount: "ACCT_shop",
    suppliers: [{ supplierId: "sup_a", subaccount: "ACCT_sup", costKobo: 1_500_000 }],
    delivery: [{ shipmentKey: "supplier:sup_a", partnerId: "p1", subaccount: "ACCT_p1", kobo: 400_000 }],
    debts: [
      { debtId: "d_partner", from: "partner:p1", to: "ACCT_shop", availableKobo: 150_000 },
      { debtId: "d_supplier", from: "sup_a", to: "ACCT_shop", availableKobo: 300_000 },
    ],
  });
  assert.equal(plan.delivery[0].kobo, 250_000, "the partner's fee less what it owes");
  assert.equal(plan.suppliers[0].kobo, 1_200_000, "the supplier's share less what it owes");
  assert.deepEqual(plan.deductions.map((row) => [row.debtId, row.kobo]).sort(), [["d_partner", 150_000], ["d_supplier", 300_000]]);
  const shares = rules.splitShares(plan);
  assert.equal(shares.reduce((sum, row) => sum + row.kobo, 0) + (plan.platformKobo ?? 0), 3_000_000, "the split still adds up to what was paid");
  // At most half the fee, and never leaving less than ₦100.
  const capped = rules.buildSplitPlan({ totalKobo: 3_000_000, sellerSubaccount: "ACCT_shop", suppliers: [], delivery: [{ shipmentKey: "own", partnerId: "p1", subaccount: "ACCT_p1", kobo: 400_000 }], debts: [{ debtId: "big", from: "partner:p1", to: null, availableKobo: 5_000_000 }] });
  assert.equal(capped.delivery[0].kobo, 200_000);
  assert.equal(capped.platformKobo, 200_000, "owed to Shopinbos stays in its balance");
});

test("the deduction line says how much, for which order and why", () => {
  assert.equal(
    owed.deductionLine(1_425_000, "order SB-1001: wrong or damaged item, the packing photo showed it. Your pay goes back to the shop.", "wrong_item", "order SB-2002"),
    "₦14,250 deducted for order SB-1001: wrong or damaged item, the packing photo showed it (from order SB-2002)",
  );
  assert.equal(owed.deductionLine(50_000, null, "return_trip", "the delivery fee for DLV-1"), "₦500 deducted for delivery trip back (from the delivery fee for DLV-1)");
  assert.ok(owed.deductsAutomatically("fault:issue:abc:1"));
  assert.ok(owed.deductsAutomatically("notsent:so_1"));
  assert.equal(owed.deductsAutomatically("claim:booking:b1"), false);
  for (const reason of ["out_of_stock", "shipped_late", "delivery_not_made", "delivery_failed", "returned", "return_trip"]) assert.ok(owed.isDebtReason(reason), reason);
});

const pay = await import("../shared/seller-payments.ts");

test("C9: 'Paid' counts only money that is in", () => {
  const at = new Date("2026-10-28T10:00:00Z");
  const row = (over) => ({ total: 1000, status: "shipped", paymentMethod: null, createdAt: at, paystackStatus: "success", ...over });
  assert.equal(pay.moneyIsIn(row()), true, "card checkout confirmed");
  assert.equal(pay.moneyIsIn(row({ paystackStatus: "pending" })), false, "card not confirmed");
  assert.equal(pay.moneyIsIn(row({ paymentMethod: "pay_on_delivery", paystackStatus: "pending" })), false, "pay on delivery on its way isn't money in");
  assert.equal(pay.moneyIsIn(row({ paymentMethod: "pay_on_delivery", paystackStatus: "success", status: "delivered" })), true, "paid at the door");
  assert.equal(pay.moneyIsIn(row({ paymentMethod: "cash", paystackStatus: null, status: "paid" })), true, "recorded as paid by the seller");
  assert.equal(pay.moneyIsIn(row({ status: "pending" })), false);
  const { total, status, paymentMethod, createdAt } = row({ paymentMethod: "pay_on_delivery" });
  assert.equal(pay.moneyIsIn({ total, status, paymentMethod, createdAt }), true, "older callers without paystackStatus keep the status rule");
  const summary = pay.summarizeMoney([row(), row({ paymentMethod: "pay_on_delivery", paystackStatus: "pending" }), row({ paymentMethod: "pay_on_delivery", paystackStatus: "success" })], at);
  assert.equal(summary.paidCount, 2);
});

test("C10: the seller's margin on one order, from the split or estimated", () => {
  const split = pay.orderEarnings({
    totalKobo: 2_250_000,
    plans: [{ sellerKobo: 500_000, suppliers: [{ kobo: 1_425_000, commissionKobo: 75_000 }], delivery: [{ kobo: 250_000 }], platformKobo: 75_000, deductions: [] }],
  });
  assert.deepEqual([split.basis, split.customerPaidKobo, split.suppliersKobo, split.deliveryKobo, split.feeKobo, split.earnKobo], ["split", 2_250_000, 1_500_000, 250_000, 0, 500_000]);
  const owing = pay.orderEarnings({ totalKobo: 1_000_000, plans: [{ sellerKobo: 780_000, suppliers: [], platformKobo: 20_000, deductions: [{ from: "seller", to: "ACCT_sup", kobo: 200_000 }] }], faultsKobo: -100_000 });
  assert.equal(owing.earnKobo, 980_000, "what went to the seller's debts is still earned");
  assert.equal(owing.toDebtsKobo, 200_000);
  assert.equal(owing.feeKobo, 20_000);
  assert.equal(owing.netKobo, 880_000);
  const estimate = pay.orderEarnings({ totalKobo: 1_000_000, plans: [null], supplierCostKobo: 600_000, partnerFeesKobo: 150_000 });
  assert.deepEqual([estimate.basis, estimate.earnKobo], ["estimate", 250_000]);
});
