// Guided refunds (shared/order-refunds.ts). Shopinbos never holds money: the seller sends their part of a refund from
// their own bank, guided by the app (who pays is shared/fault-matrix.ts). The pure rules, plus the places that apply them.
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

test("every fault event maps to a refund reason the customer understands, and who pays the seller back", async () => {
  const matrix = await import("../shared/fault-matrix.ts");
  for (const event of matrix.FAULT_EVENTS) {
    assert.notEqual(rules.refundReasonForFault(event), "other", event);
    assert.ok(rules.REFUND_REASON_TEXT[rules.refundReasonForFault(event)], event);
  }
  assert.equal(rules.refundFaultFor("out_of_stock"), "supplier");
  assert.equal(rules.refundFaultFor("damaged_in_transit"), "partner");
  assert.equal(rules.refundFaultFor("changed_mind"), "none");
});

test("the seller's part of a fault refund is guided, once per case", () => {
  const refunds = read("src/lib/commerce/refunds.server.ts");
  assert.match(refunds, /if \(sellerKobo > 0\) \{[\s\S]{0,1000}openRefund\(\{\s*sourceKey: `fault:\$\{input\.caseKey\}`/);
  assert.match(read("src/lib/faults/resolve.server.ts"), /refundFault\(\{[^)]*event: outcome\.event/);
});

test("account numbers: 10 digits, and the customer only sees the last 4", () => {
  assert.equal(rules.cleanAccountNumber("012 345 6789"), "0123456789");
  assert.equal(rules.cleanAccountNumber("12345"), null);
  assert.equal(rules.cleanAccountNumber("01234567890"), null);
  assert.equal(rules.maskAccount("0123456789"), "•••• 6789");
  assert.equal(rules.maskAccount(null), "");
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

test("the customer's order page: give an account, confirm it arrived; the cron reminds and closes", () => {
  const actions = read("src/app/s/[slug]/order/[orderId]/actions.ts");
  for (const name of ["giveRefundAccount", "customerAnswersRefund"]) assert.match(actions, new RegExp(name));
  const cron = read("src/lib/supplier-orders/acceptance.server.ts");
  for (const step of ["remindRefundsToSend", "autoConfirmSentRefunds"]) assert.match(cron, new RegExp(`await ${step}\\(now\\)`), step);
  for (const page of ["src/app/s/[slug]/order/[orderId]/page.tsx", "src/app/_domain/[domain]/order/[orderId]/page.tsx"]) {
    assert.match(read(page), /customerRefundPanel\(order\.id\)/, page);
  }
  assert.match(read("src/app/s/[slug]/order/[orderId]/OrderConfirmation.tsx"), /<RefundsPanel /);
});

test("the schema change ships as a migration", () => {
  const sql = read("docs/migrations/2026-12-08-who-pays-refunds.sql");
  assert.match(sql, /CREATE TABLE IF NOT EXISTS "OrderRefund"/);
  const schema = read("prisma/schema.prisma");
  assert.match(schema, /model OrderRefund \{/);
  assert.match(schema, /sourceKey\s+String\s+@unique/);
});
