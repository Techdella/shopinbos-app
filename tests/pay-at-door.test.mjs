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
  assert.match(messages, /if \(unpaid && \(to === "out_for_delivery" \|\| to === "at_pickup_point"\)\) return await textPayAtDoorLink\(order\.id\)/);
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
