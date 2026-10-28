// Pay on delivery without cash (shared/pay-at-door.ts): the customer pays in the app at the door and only then gets
// the code; no code, no drop; riders never hold cash. The pure rules, plus the places that must apply them.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const door = await import("../shared/pay-at-door.ts");
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const pod = (over = {}) => ({ paymentMethod: "pay_on_delivery", status: "shipped", paystackStatus: "pending", ...over });

test("pay on delivery is paid only once the money is in, or the seller marked it paid", () => {
  assert.equal(door.payAtDoorPaid(pod()), false, "on the way isn't paid");
  assert.equal(door.payAtDoorPaid(pod({ paystackStatus: "success" })), true);
  assert.equal(door.payAtDoorPaid(pod({ paystackStatus: "offline" })), true, "the seller marked it paid");
  assert.equal(door.payAtDoorPaid(pod({ status: "paid" })), true);
  assert.equal(door.payAtDoorPaid({ paymentMethod: "paystack", status: "paid", paystackStatus: "success" }), false, "not a pay-on-delivery order");

  assert.equal(door.payAtDoorDue(pod()), true);
  assert.equal(door.payAtDoorDue(pod({ status: "pending" })), true);
  assert.equal(door.payAtDoorDue(pod({ paystackStatus: "success" })), false);
  for (const status of ["cancelled", "delivered", "returned", "refunded"]) assert.equal(door.payAtDoorDue(pod({ status })), false, status);
  assert.equal(door.payAtDoorDue({ paymentMethod: "transfer", status: "pending" }), false);
});

test("no payment, no drop: a pay-on-delivery job can't be closed until it's paid; older cash jobs still can", () => {
  assert.match(door.payAtDoorBlock(pod(), { codAmount: null }), /hasn't paid yet/);
  assert.equal(door.payAtDoorBlock(pod({ paystackStatus: "success" }), { codAmount: null }), null);
  assert.equal(door.payAtDoorBlock(pod(), { codAmount: 12000 }), null, "a job from before carries cash: recorded the old way");
  assert.equal(door.payAtDoorBlock({ paymentMethod: "paystack", status: "paid", paystackStatus: "success" }, { codAmount: null }), null);
  assert.equal(door.payAtDoorBlock(null, { codAmount: null }), null, "a booking without a shop order");

  // Every way of closing a drop goes through transitionJob, which checks it whoever the actor is.
  const jobs = read("src/lib/logistics/jobs.ts");
  assert.match(jobs, /input\.to === "delivered" && job\.orderId[\s\S]{0,300}payAtDoorBlock\(order, job\)/);
});

test("the code is the customer's proof of payment: hidden until paid, on the page and in messages", () => {
  assert.equal(door.codeVisible(pod()), false);
  assert.equal(door.codeVisible(pod({ paystackStatus: "success" })), true);
  assert.equal(door.codeVisible({ paymentMethod: "paystack", status: "shipped" }), true);
  assert.match(read("src/app/s/[slug]/order/[orderId]/order-props.ts"), /deliveryCode: codeVisible\(order\)/);
  const messages = read("src/lib/notifications/customer-messages.ts");
  assert.match(messages, /deliveryCode: unpaid \? null : job\.deliveryCode/);
  assert.match(messages, /if \(unpaid && \(to === "out_for_delivery" \|\| to === "at_pickup_point"\)\) \{[\s\S]{0,160}sendPayAtDoorLink\(order\.id\)/);
  // The rider's photo-instead-of-code shortcut is gone for pay on delivery on the phone (the server blocks it anyway).
  assert.match(read("apps/mobile/src/app/rider/job.tsx"), /!ok && !drop\.payInApp \?/);
});

test("door payments: their own reference, verified with Paystack, split like a card order, recorded once", () => {
  assert.ok(door.PAY_AT_DOOR_PREFIX.length > 3);
  assert.deepEqual([...door.PAY_AT_DOOR_CHANNELS], ["bank_transfer", "card", "ussd"]);
  const server = read("src/lib/commerce/pay-at-door.server.ts");
  assert.match(server, /verifyPaystackTransaction\(reference\)/, "never the browser's word");
  assert.match(server, /splitPlanForOrder\(/);
  assert.match(server, /OR: \[\{ paystackStatus: null \}, \{ paystackStatus: \{ notIn: \["success", "offline"\] \} \}\]/, "only an unpaid order moves");
  assert.match(server, /Math\.round\(Number\(payment\.amount\)\) < owed/, "the whole amount");
  assert.match(read("src/app/api/webhooks/paystack/route.ts"), /startsWith\(PAY_AT_DOOR_PREFIX\)[\s\S]{0,200}confirmPayAtDoor/);
  assert.match(read("src/app/actions/payments.ts"), /startsWith\(PAY_AT_DOOR_PREFIX\)[\s\S]{0,200}confirmPayAtDoor\(reference\)/);
  assert.match(read("src/lib/paystack.ts"), /channels: input\.channels/);
});

test("riders never get cash for pay on delivery", () => {
  const bookings = read("src/app/api/app/logistics/bookings/route.ts");
  assert.match(bookings, /order\.paymentMethod !== "pay_on_delivery" &&/);
  const web = read("src/app/rider/[token]/page.tsx");
  assert.doesNotMatch(web, /payOnDeliveryOf/, "marketplace pay on delivery isn't cash any more");
  assert.match(web, /payInApp: order && isPayOnDelivery\(order\)/);
  assert.match(read("src/app/api/mobile/logistics/rider/route.ts"), /payInApp: order && isPayOnDelivery\(order\)/);
  // The seller marking a pay-on-delivery order paid lets the rider hand it over.
  assert.match(read("src/lib/orders/update-status.ts"), /updateData\.paymentMethod === "pay_on_delivery"\) updateData\.paystackStatus = "offline"/);
});

test("the delivery fee is paid at checkout; the order waits for it, then the door payment is the rest", async () => {
  const at = new Date("2026-10-28T10:00:00Z");
  const waiting = pod({ status: "pending", paymentDueAt: at, depositPaidAt: null });
  assert.equal(door.podFeeDue(waiting), true);
  assert.equal(door.payAtDoorDue(waiting), false, "nothing to pay at the door before the fee is in");
  assert.equal(door.podFeeDue(pod({ status: "pending", paymentDueAt: null, depositPaidAt: at })), false);
  assert.equal(door.podFeePaid(pod({ depositPaidAt: at })), true);
  assert.equal(door.podFeeDue(pod({ status: "pending", paymentDueAt: null })), false, "free delivery: nothing upfront");
  assert.equal(door.podFeeKobo(1500), 150000);
  assert.equal(door.podFeeKobo(-3), 0);
  assert.equal(door.doorAmountKobo({ total: 20000, depositPaidAt: at }, 150000), 1850000, "the rest: total less the fee");
  assert.equal(door.doorAmountKobo({ total: 20000, depositPaidAt: null }, 150000), 2000000, "fee not paid upfront: all of it");

  // Nothing is sent to suppliers or booked until the fee is in; an unpaid fee expires like a card order.
  const pure = await import("../src/lib/supplier-orders/pure.ts");
  assert.equal(pure.readyForSuppliers({ status: "pending", paymentMethod: "pay_on_delivery", paymentDueAt: at, depositPaidAt: null }), false);
  assert.equal(pure.readyForSuppliers({ status: "pending", paymentMethod: "pay_on_delivery", paymentDueAt: null, depositPaidAt: at }), true);
  assert.equal(pure.readyForSuppliers({ status: "pending", paymentMethod: "pay_on_delivery" }), true, "free delivery goes live at once");
  const holds = await import("../src/lib/commerce/stock-holds.ts");
  const order = { status: "pending", paymentMethod: "pay_on_delivery", createdAt: new Date(at.getTime() - 3_600_000), stockHold: [{ source: "store", productId: "p", quantity: 1, name: "x" }], paystackStatus: "pending" };
  assert.equal(holds.isExpirableOrder({ ...order, paymentDueAt: at }, new Date(at.getTime() + 60_000), 30), true);
  assert.equal(holds.isExpirableOrder({ ...order, paymentDueAt: null }, new Date(at.getTime() + 60_000), 30), false, "once the fee is in it never expires");

  const checkout = read("src/app/api/public/store/[slug]/checkout/route.ts");
  assert.match(checkout, /podFeeKobo\(shippingFee - \(priced\.totals\.deliveryDiscount \?\? 0\)\)/, "what the customer pays for delivery");
  assert.match(checkout, /deliveryFeeSplitForOrder\(store\.id, podFeeNow \/ 100, deliveryShares\)[\s\S]{0,120}startPodFee\(order\.id, plan\)/);
  assert.match(read("src/app/api/webhooks/paystack/route.ts"), /startsWith\(POD_FEE_PREFIX\)[\s\S]{0,200}confirmPodFee/);
  const server = read("src/lib/commerce/pay-at-door.server.ts");
  assert.match(server, /data: \{ depositPaidAt: new Date\(\), paymentDueAt: null, paystackRef: reference \}/);
  assert.match(server, /paymentIssue: `The delivery fee/, "a fee paid after the order expired is flagged for a refund");
});

test("the delivery fee goes straight to the partner in full, or all to the seller", async () => {
  const rules = await import("../src/lib/wallet/rules.ts");
  const share = (kobo, subaccount = "ACCT_partner") => ({ shipmentKey: "own", partnerId: "p1", subaccount, kobo });
  const full = rules.deliveryFeePlan({ totalKobo: 250000, sellerSubaccount: "ACCT_seller", delivery: [share(250000)] });
  assert.equal(full.sellerKobo, 0);
  assert.deepEqual(full.delivery.map((d) => d.kobo), [250000]);
  assert.deepEqual(rules.splitShares(full), [{ account: "ACCT_partner", kobo: 250000 }], "a seller with nothing isn't sent to Paystack");
  assert.equal(rules.paystackSplitParams(full).subaccount, "ACCT_partner");
  const discounted = rules.deliveryFeePlan({ totalKobo: 100000, sellerSubaccount: "ACCT_seller", delivery: [share(250000)] });
  assert.equal(discounted.sellerKobo, 100000, "less than the partner's price: the seller gets it and pays the partner");
  assert.equal(discounted.delivery, undefined);
  const noAccount = rules.deliveryFeePlan({ totalKobo: 250000, sellerSubaccount: "ACCT_seller", delivery: [share(250000, null)] });
  assert.equal(noAccount.sellerKobo, 250000);
  assert.equal(rules.deliveryFeePlan({ totalKobo: 150000, sellerSubaccount: "ACCT_seller", delivery: [] }).sellerKobo, 150000, "the seller's own delivery");
});

test("payment link and code go by SMS and WhatsApp, with what's left to pay", async () => {
  const messages = read("src/lib/notifications/customer-messages.ts");
  assert.match(messages, /for \(const channel of \["sms", "whatsapp"\] as const\)/);
  assert.match(messages, /template: "shopinbos_pay_at_door"/);
  assert.match(messages, /template: "shopinbos_pay_at_door_code"/);
  const wa = await import("../src/lib/member-messaging/whatsapp-templates.ts");
  for (const name of ["shopinbos_pay_at_door", "shopinbos_pay_at_door_code"]) {
    const template = wa.memberTemplate(name);
    assert.ok(template, name);
    assert.equal(template.category, "UTILITY");
    assert.equal(template.examples.length, 4);
    assert.match(template.body, /\{\{3\}\}/, "the shop's name is in it");
  }
  assert.match(read("src/lib/commerce/pay-at-door.server.ts"), /textPayAtDoorLink\(order\.id, \{ amount, resend: options\.resend \}\)/);
});
