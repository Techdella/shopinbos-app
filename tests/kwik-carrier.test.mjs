// Kwik, the first delivery company booked through its own API (src/lib/logistics/carriers): request bodies,
// response reading and how its task statuses become Shopinbos job statuses.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const k = await import("../src/lib/logistics/carriers/kwik-pure.ts");
const rules = await import("../src/lib/logistics/job-rules.ts");

const account = { accessToken: "tok", vendorId: 37, userId: 1, formId: 2, customerId: 561, domainName: "staging-client-panel.kwik.delivery" };
const stop = (name) => ({ address: `${name} St, Lagos`, name, phone: "+2348031234567", latitude: 6.5, longitude: 3.4, time: "2026-10-16 12:10:00" });
const job = { pickup: stop("Shop"), delivery: stop("Ada"), vehicleId: 4, timezone: -60, codAmount: 0 };

test("Kwik's body status, not HTTP, says whether it worked", () => {
  assert.deepEqual(k.readKwik(true, { status: 200, message: "Successful", data: { a: 1 } }), { ok: true, data: { a: 1 }, message: "Successful" });
  assert.deepEqual(k.readKwik(true, { status: 101, message: "Invalid access token" }), { ok: false, code: 101, message: "Invalid access token" });
  const broken = k.readKwik(false, "<html>");
  assert.equal(broken.ok, false);
  assert.equal(broken.message, "Kwik didn't accept the request.");
});

test("times are Lagos local in Kwik's format, and the timezone is minutes west of UTC", () => {
  assert.equal(k.kwikTime(new Date("2026-10-16T23:30:05Z")), "2026-10-17 00:30:05");
  assert.equal(k.kwikTime(new Date("2026-01-02T03:04:05Z"), 0), "2026-01-02 03:04:05");
  assert.equal(k.kwikTimezone(60), -60);
  assert.equal(k.kwikTimezone(-300), 300);
});

test("phone numbers get the country code", () => {
  assert.equal(k.kwikPhone("0803 123 4567"), "+2348031234567");
  assert.equal(k.kwikPhone("+234 803 123 4567"), "+2348031234567");
  assert.equal(k.kwikPhone("2348031234567"), "+2348031234567");
  assert.equal(k.kwikPhone("008031234567").startsWith("+"), true);
  assert.equal(k.kwikPhone(""), "");
  assert.equal(k.kwikPhone(null), "");
});

test("a bike unless the parcel is heavy", () => {
  assert.equal(k.kwikVehicleSize(undefined), 0);
  assert.equal(k.kwikVehicleSize(5), 0);
  assert.equal(k.kwikVehicleSize(50), 1);
  assert.equal(k.kwikVehicleSize(800), 2);
  assert.equal(k.kwikVehicleSize(5000), 3);
});

test("pricing, bill and create bodies carry the account, the stops and the earlier results", () => {
  const pricingBody = k.kwikPricingBody(account, { ...job, codAmount: 15000 });
  assert.equal(pricingBody.vendor_id, 37);
  assert.equal(pricingBody.form_id, 2);
  assert.equal(pricingBody.is_cod_job, 1);
  assert.equal(pricingBody.parcel_amount, 15000);
  assert.equal(pricingBody.payment_method, k.KWIK_PAYMENT_WALLET_OR_EOMB);
  assert.equal(pricingBody.pickups[0].email, "");
  assert.equal(pricingBody.deliveries[0].has_return_task, false);

  const pricing = { per_task_cost: "1474.5", insurance_amount: 0, total_no_of_tasks: 1, total_service_charge: 500 };
  const bill = { PAYABLE_AMOUNT: "2021.50", SURGE_PRICING: 7, SURGE_TYPE: 3 };
  const billBody = k.kwikBillBody(account, job, pricing, "2026-10-16 12:10:00");
  assert.equal(billBody.amount, "1474.5");
  assert.equal(billBody.total_service_charge, 500);
  assert.equal(billBody.is_cod_job, 0);

  const create = k.kwikCreateBody(account, job, pricing, bill);
  assert.equal(create.amount, "1474.5");
  assert.equal(create.surge_cost, 7);
  assert.equal(create.surge_type, 3);
  assert.equal(create.has_pickup, 1);
  assert.equal(create.deliveries[0].hadVairablePayment, 1);
  assert.equal(create.vehicle_id, 4);
});

test("the price is what Kwik will charge, with a fallback when the breakdown is missing", () => {
  const pricing = { per_task_cost: "1474.5", total_service_charge: 500 };
  assert.equal(k.kwikPrice(pricing, { PAYABLE_AMOUNT: "2021.50" }), 2021.5);
  assert.equal(k.kwikPrice(pricing, { DISCOUNTED_AMOUNT: 1999 }), 1999);
  assert.equal(k.kwikPrice(pricing, null), 1974.5);
  assert.equal(k.kwikPrice({ per_task_cost: "" }, null), null);
});

test("a created order gives its reference, job ids and the delivery's tracking link", () => {
  const created = k.readKwikCreated({
    unique_order_id: "16349AH859",
    pickups: [{ job_id: 16349, result_tracking_link: "https://dash/tracking?jobID=a" }],
    deliveries: [{ job_id: 16350, result_tracking_link: "https://dash/tracking?jobID=b" }],
  });
  assert.deepEqual(created, { ref: "16349AH859", jobIds: [16349, 16350], trackingUrl: "https://dash/tracking?jobID=b" });
  assert.equal(k.readKwikCreated({ pickups: [] }), null);
  assert.equal(k.readKwikCreated(null), null);
});

const tasks = (pickup, delivery) => [
  { job_id: 1, job_type: 0, job_status: pickup },
  { job_id: 2, job_type: 1, job_status: delivery },
];

test("Kwik task statuses become job statuses", () => {
  const J = k.KWIK_JOB;
  assert.equal(k.kwikBookingStatus([]), null);
  assert.equal(k.kwikBookingStatus(tasks(J.UNASSIGNED, J.UNASSIGNED)), "confirmed");
  assert.equal(k.kwikBookingStatus(tasks(J.ACCEPTED, J.UPCOMING)), "confirmed");
  assert.equal(k.kwikBookingStatus(tasks(J.ARRIVED, J.UPCOMING)), "confirmed");
  assert.equal(k.kwikBookingStatus(tasks(J.ENDED, J.ACCEPTED)), "picked_up");
  assert.equal(k.kwikBookingStatus(tasks(J.ENDED, J.STARTED)), "in_transit");
  assert.equal(k.kwikBookingStatus(tasks(J.ENDED, J.ARRIVED)), "in_transit");
  assert.equal(k.kwikBookingStatus(tasks(J.ENDED, J.ENDED)), "delivered");
  assert.equal(k.kwikBookingStatus(tasks(J.ENDED, J.FAILED)), "failed");
  assert.equal(k.kwikBookingStatus(tasks(J.FAILED, J.UPCOMING)), "failed");
  assert.equal(k.kwikBookingStatus(tasks(J.CANCELLED, J.CANCELLED)), "cancelled");
  assert.equal(k.kwikBookingStatus(tasks(J.DELETED, J.DELETED)), "cancelled");
  assert.equal(k.kwikStatusLabel(tasks(J.ENDED, J.STARTED)), "pickup:2,delivery:1");
  assert.deepEqual(k.readKwikTasks({ orders: [{ job_id: 1777, job_type: 0, job_status: 9 }, { job_type: "x" }] }), [{ job_id: 1777, job_type: 0, job_status: 9 }]);
});

test("a carrier that jumps ahead is walked through every step, and never backwards", () => {
  assert.deepEqual(rules.stepsTo("confirmed", "delivered"), ["picked_up", "delivered"]);
  assert.deepEqual(rules.stepsTo("pending", "in_transit"), ["confirmed", "picked_up", "in_transit"]);
  assert.deepEqual(rules.stepsTo("in_transit", "in_transit"), []);
  assert.deepEqual(rules.stepsTo("delivered", "confirmed"), []);
  assert.deepEqual(rules.stepsTo("picked_up", "cancelled"), []);
  assert.deepEqual(rules.stepsTo("confirmed", "cancelled"), ["cancelled"]);
});

test("a carrier marks jobs delivered without the buyer's code", () => {
  const job = { status: "in_transit", deliveryCode: "1234", codAmount: null };
  assert.equal(rules.checkTransition(job, { to: "delivered", actor: "carrier" }).ok, true);
  assert.equal(rules.checkTransition(job, { to: "delivered", actor: "api" }).ok, false);
});

test("carrier partners stay out of the portal's flows they can't work", () => {
  const pickup = readFileSync(new URL("../src/lib/supplier-orders/pickup.server.ts", import.meta.url), "utf8");
  assert.match(pickup, /carrier: null/);
  const bookings = readFileSync(new URL("../src/app/api/app/logistics/bookings/route.ts", import.meta.url), "utf8");
  assert.match(bookings, /carrierFor\(partner\)/);
  assert.match(bookings, /maxPrice: deliveryFee/);
  const quotes = readFileSync(new URL("../src/app/api/app/logistics/quotes/route.ts", import.meta.url), "utf8");
  assert.match(quotes, /carrier\.quote\(job\)/);
});
