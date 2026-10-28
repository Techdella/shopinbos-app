// Who pays when things go wrong, first batch: the supplier rows (shared/order-refunds.ts). Shopinbos never holds money:
// the seller refunds the customer from their own bank, guided by the app, and whoever caused it pays the seller back
// (BusinessDebt). The pure rules, plus the places that must apply them.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const rules = await import("../shared/order-refunds.ts");
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("a refund moves customer → seller → customer, and the team steps in on a dispute", () => {
  assert.equal(rules.refundNext("awaiting_account").who, "customer");
  assert.equal(rules.refundNext("to_send").who, "seller");
  assert.equal(rules.refundNext("sent").who, "customer");
  assert.equal(rules.refundNext("disputed").who, "team");
  assert.equal(rules.refundNext("confirmed").who, null);
  for (const status of ["awaiting_account", "to_send", "sent", "disputed"]) assert.equal(rules.refundOpen(status), true, status);
  for (const status of ["confirmed", "cancelled"]) assert.equal(rules.refundOpen(status), false, status);
  for (const reason of rules.REFUND_REASONS) assert.ok(rules.REFUND_REASON_TEXT[reason], reason);
});

test("account numbers: 10 digits, and the customer only sees the last 4", () => {
  assert.equal(rules.cleanAccountNumber("012 345 6789"), "0123456789");
  assert.equal(rules.cleanAccountNumber("12345"), null);
  assert.equal(rules.cleanAccountNumber("01234567890"), null);
  assert.equal(rules.maskAccount("0123456789"), "•••• 6789");
  assert.equal(rules.maskAccount(null), "");
});

test("ship-by is the end of the day in Lagos, accepted plus the longest handling time (1 to 3 days)", () => {
  const accepted = new Date("2026-10-28T10:00:00Z"); // 11:00 in Lagos
  assert.equal(rules.shipByDate(accepted, [1]).toISOString(), "2026-10-29T22:59:59.000Z");
  assert.equal(rules.shipByDate(accepted, [1, 3, 2]).toISOString(), "2026-10-31T22:59:59.000Z");
  assert.equal(rules.shipByDate(accepted, [9]).toISOString(), "2026-10-29T22:59:59.000Z", "out of range counts as 1");
  assert.equal(rules.shipByDate(accepted, []).toISOString(), "2026-10-29T22:59:59.000Z");
  const late = new Date("2026-10-28T23:30:00Z"); // 00:30 the next day in Lagos
  assert.equal(rules.shipByDate(late, [1]).toISOString(), "2026-10-30T22:59:59.000Z");
});

test("late: accepted, not shipped, past ship-by; only then can the customer cancel it", () => {
  const shipBy = new Date("2026-10-29T22:59:59Z");
  const after = new Date("2026-10-30T08:00:00Z");
  assert.equal(rules.supplierLate({ status: "accepted", shipBy }, after), true);
  assert.equal(rules.supplierLate({ status: "accepted", shipBy }, new Date("2026-10-29T12:00:00Z")), false);
  assert.equal(rules.supplierLate({ status: "shipped", shipBy }, after), false);
  assert.equal(rules.supplierLate({ status: "accepted", shipBy: null }, after), false);
  assert.equal(rules.customerMayCancelLate({ status: "accepted", lateAt: after }), true);
  assert.equal(rules.customerMayCancelLate({ status: "accepted", lateAt: null }), false);
  assert.equal(rules.customerMayCancelLate({ status: "shipped", lateAt: after }), false, "it's on its way");
});

test("out of stock after payment: refund opened, the supplier owes the seller back, and gets a strike", () => {
  const server = read("src/lib/commerce/order-refunds.server.ts");
  assert.match(server, /reason === "out_of_stock"[\s\S]{0,200}missedOrders: \{ increment: 1 \}/);
  assert.match(server, /syncNotSentDebts\(/, "the not-sent debt is what the supplier owes back");
  assert.match(server, /sourceKey: `supplier:\$\{/);
  assert.match(read("src/lib/supplier-orders/service.server.ts"), /onSupplierPartFailed\(order\.id, "out_of_stock"\)/);
  assert.match(read("src/lib/supplier-orders/service.server.ts"), /setShipBy\(order\.id, now\)/);
});

test("supplier late: marked by the cron, a strike each, the team reviews at 3 in 90 days", () => {
  const server = read("src/lib/commerce/order-refunds.server.ts");
  assert.match(server, /missedReadyDates: \{ increment: 1 \}/);
  assert.match(server, /strikes >= LATE_STRIKES_FOR_REVIEW[\s\S]{0,80}notifyAdminsToReview/);
  assert.match(server, /customerMayCancelLate\(row\)/);
  const cron = read("src/lib/supplier-orders/acceptance.server.ts");
  for (const step of ["markLateSuppliers", "remindRefundsToSend", "autoConfirmSentRefunds"]) assert.match(cron, new RegExp(`await ${step}\\(now`), step);
});

test("wrong or damaged item: the seller says who caused it, with the packing and delivery photos as evidence", () => {
  const server = read("src/lib/commerce/order-refunds.server.ts");
  assert.match(server, /target: "supplier_order"[\s\S]{0,400}Packing photo: \$\{part\.packPhotoUrl\}/);
  assert.match(server, /target: "booking"[\s\S]{0,400}Delivery photo: \$\{job\.proofUrl\}/);
  const card = read("src/app/home/orders/[id]/RefundsCard.tsx");
  assert.match(card, /packPhotoUrl/);
  assert.match(card, /proofUrl/);
  assert.match(card, /value=\{`supplier:\$\{part\.id\}`\}/);
});

test("Shopinbos never holds the money: refunds of split orders go through the seller's own bank", () => {
  const refunds = read("src/lib/commerce/refunds.server.ts");
  assert.match(refunds, /onPaidOrderCancelled\(order\.id, why/);
  assert.match(refunds, /sourceKey: `late-payment:/);
  const server = read("src/lib/commerce/order-refunds.server.ts");
  assert.match(server, /resolveBankAccount\(/, "the account is checked with the bank, so the name shows");
  assert.doesNotMatch(server, /createRefund|\/refund"/, "no Paystack refund from Shopinbos's balance");
  // The customer sees only the last 4 digits; the seller sees all of it (they send the money).
  assert.match(server, /audience === "seller" \? row\.accountNumber \?\? "" : maskAccount\(row\.accountNumber\)/);
});

test("the customer's order page: give an account, confirm it arrived, cancel a late part", () => {
  const actions = read("src/app/s/[slug]/order/[orderId]/actions.ts");
  for (const name of ["giveRefundAccount", "customerAnswersRefund", "customerCancelsLatePart"]) assert.match(actions, new RegExp(name));
  for (const page of ["src/app/s/[slug]/order/[orderId]/page.tsx", "src/app/_domain/[domain]/order/[orderId]/page.tsx"]) {
    assert.match(read(page), /customerRefundPanel\(order\.id\)/, page);
  }
  assert.match(read("src/app/s/[slug]/order/[orderId]/OrderConfirmation.tsx"), /<RefundsPanel /);
});

test("the schema change ships as a migration", () => {
  const sql = read("docs/migrations/2026-12-08-who-pays-refunds.sql");
  assert.match(sql, /CREATE TABLE IF NOT EXISTS "OrderRefund"/);
  assert.match(sql, /"shipBy"/);
  assert.match(sql, /"lateAt"/);
  const schema = read("prisma/schema.prisma");
  assert.match(schema, /model OrderRefund \{/);
  assert.match(schema, /sourceKey\s+String\s+@unique/);
});
