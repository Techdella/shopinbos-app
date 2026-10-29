// The shop is the seller's business (like Shopify, not a marketplace): Shopinbos suggests, the seller decides.
// Outcomes the system starts on its own are only proposed; customer reports are the seller's call; a shop's own
// money is never taken from its sales, it's never paused, and nothing is owed to Shopinbos; Shopinbos never judges
// between a shop and its customer, and customer-facing words speak as the shop.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("what the system starts on its own is only a suggestion until the seller accepts it", () => {
  const resolve = read("src/lib/faults/resolve.server.ts");
  assert.match(resolve, /status: proposed \? "proposed" : "applied"/);
  assert.match(resolve, /if \(proposed\) \{[\s\S]{0,700}return \{ ok: true, fresh: true, caseId, outcome, proposed: true \};\n  \}\n  await runOutcome\(/, "a proposal runs nothing: no refund, money owed, strikes or messages");
  assert.match(resolve, /export async function decideFaultCase\(sellerId: string[\s\S]{0,600}store\.userId !== sellerId/, "only the shop's owner decides");
  const customer = read("src/lib/faults/customer.server.ts");
  assert.match(customer, /key: `oos:\$\{row\.id\}`[^\n]*propose: true/, "out of stock");
  assert.match(customer, /key: `late:\$\{row\.id\}`[^\n]*propose: true/, "a late part the customer asked to cancel");
  assert.match(customer, /source: event === "pod_refused" \? "pod_refused" : "failed_delivery"[^\n]*propose: true/, "a delivery that came back");
  assert.doesNotMatch(customer.slice(customer.indexOf("export async function onSupplierRejected"), customer.indexOf("export async function latePartsFor")), /cancelOrderIfNothingLeft/, "the order isn't cancelled behind the seller's back");
  assert.match(read("src/lib/faults/returns.server.ts"), /propose: !store/, "a return trip delivered: the seller checks the item first");
  assert.doesNotMatch(read("src/lib/faults/strikes.server.ts"), /textLateCancelOffer/, "no texts to the shop's customer offering cancellations");
});

test("the customer's page shows only what the shop decided; the seller's earnings only what they accepted", () => {
  assert.match(read("src/lib/faults/customer.server.ts"), /line: row\.status === "applied" \? row\.lines\?\.customer \?\? null/);
  assert.match(read("src/lib/faults/seller.server.ts"), /faultCase\.findMany\(\{ where: \{ retailOrderId: order\.id, status: "applied" \}/);
});

test("a customer's report is the seller's call, not the team's", () => {
  const disputes = read("src/lib/faults/disputes.server.ts");
  assert.match(disputes, /export async function decideDispute\(seller: \{ id: string \}[\s\S]{0,400}owner\?\.userId !== seller\.id/);
  const action = read("src/app/actions/faults.ts");
  assert.match(action, /export async function decideDisputeAction[\s\S]{0,200}await seller\(\)/);
  assert.ok(existsSync(new URL("../src/app/home/orders/[id]/problems/[issueId]/page.tsx", import.meta.url)));
  assert.doesNotMatch(read("src/app/admin/delivery-issues/[id]/page.tsx"), /basePath=/, "the team's view is read-only");
  assert.match(read("src/lib/delivery-market/manage.server.ts"), /link: kind === "late" \? `\/home\/orders\/\$\{order\.id\}` : `\/home\/orders\/\$\{order\.id\}\/problems\/\$\{issue\.id\}`/);
});

test("a shop's money: never taken from its sales, never paused, nothing owed to Shopinbos", () => {
  assert.match(read("src/lib/wallet/wallet.server.ts"), /const debtors = new Map<string, string>\(\);/, "the seller isn't a debtor in its own split");
  const owed = read("src/lib/money-owed/money-owed.server.ts");
  assert.match(owed, /if \(!debt\.creditorUserId\) return \[\];/, "nothing is taken for Shopinbos");
  assert.match(owed, /if \(!input\.creditorEmail\?\.trim\(\)\) return \{ ok: false/, "the team can't record a debt to Shopinbos");
  assert.match(owed, /user\.role === "seller" \? \[\]/, "sellers are never paused");
});

test("Shopinbos doesn't judge refunds between a shop and its customer", () => {
  const refunds = read("src/lib/commerce/order-refunds.server.ts");
  assert.doesNotMatch(refunds, /notifyAdminsToReview|adminDecideRefund/);
  assert.match(refunds, /export async function sellerResendRefund/);
  assert.ok(!existsSync(new URL("../src/app/admin/refunds/page.tsx", import.meta.url)));
  assert.doesNotMatch(read("src/lib/nav.ts"), /\/admin\/refunds/);
  assert.doesNotMatch(read("src/app/s/[slug]/order/[orderId]/RefundsPanel.tsx"), /store and Shopinbos/);
});

test("customer-facing words speak as the shop", async () => {
  assert.doesNotMatch(read("src/app/s/[slug]/order/[orderId]/OrderConfirmation.tsx"), /Our team/);
  const trust = await import("../shared/storefront-trust.ts");
  const lines = trust.trustLines({ verifiedSupplier: true, verifiedDelivery: true, paidAtCheckout: true });
  assert.ok(lines.every((line) => !/Shopinbos|protection/i.test(`${line.title} ${line.detail}`)));
});

test("pay on delivery is the seller's own arrangement: on, no card needed, their own limit, the terms beside the switch", async () => {
  const pay = await import("../shared/checkout-payments.ts");
  assert.equal(pay.PAY_ON_DELIVERY_ON, true);
  const settings = { methods: { cod: true }, paystackReady: false, transferReady: false, codLimit: null, zones: [] };
  assert.deepEqual(pay.checkoutPaymentOptions(settings, { total: 900_000 }).map((option) => option.key), ["pay_on_delivery"], "no card needed, no Shopinbos limit");
  assert.equal(pay.isCodLimitChoice(null), true);
  assert.equal(pay.isCodLimitChoice(100_000), true);
  assert.equal(pay.isCodLimitChoice(123), false);
  assert.match(read("src/lib/seller-payments.server.ts"), /export async function saveSellerCodLimit/);
  const page = read("src/app/home/payments/PaymentMethods.tsx");
  assert.match(page, /t\("methods\.codTerms"\)/);
  assert.match(page, /t\("methods\.codNoLimit"\)/);
  const door = await import("../shared/pay-at-door.ts");
  assert.equal(door.payAtDoorBlock({ paymentMethod: "pay_on_delivery", status: "shipped" }, { codAmount: null }), null, "no Shopinbos rider rule");
  // The delivery fee upfront only when the store takes cards.
  assert.match(read("src/app/api/public/store/[slug]/checkout/route.ts"), /paymentMethod === "pay_on_delivery" && paymentSettings\.paystackReady \? podFeeKobo/);
});

test("pre-orders are easy to find: switch them on for a product from the Preorders page, linked from Products", () => {
  const actions = read("src/app/actions/preorders.ts");
  assert.match(actions, /export async function storeStartPreorderAction[\s\S]{0,900}fulfillmentType === "dropship"[\s\S]{0,600}preorderSaveData\(parsed\.value/);
  const page = read("src/app/home/preorders/page.tsx");
  assert.match(page, /<form action=\{storeStartPreorderAction\}/);
  assert.match(page, /t\("preorders\.start\.terms"\)/, "it's the seller's promise to their customers");
  assert.match(read("src/app/products/page.tsx"), /href="\/home\/preorders\?view=shop"/);
});
