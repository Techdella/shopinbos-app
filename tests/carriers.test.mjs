// Fez, Sendstack and Sendbox, delivery companies booked through their own API (src/lib/logistics/carriers):
// request bodies, response reading, status mapping, and the Nigerian address and phone details they need.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const ng = await import("../src/lib/logistics/carriers/nigeria.ts");
const fez = await import("../src/lib/logistics/carriers/fez-pure.ts");
const ss = await import("../src/lib/logistics/carriers/sendstack-pure.ts");
const sb = await import("../src/lib/logistics/carriers/sendbox-pure.ts");

const job = {
  pickup: { name: "Ada Shop", phone: "0803 123 4567", email: "shop@example.com", address: "12 Allen Avenue, Ikeja" },
  dropoff: { name: "Tunde Bello", phone: "+2348098765432", address: "5 Aminu Kano Crescent, Wuse 2, Abuja" },
  weightKg: 3,
  codAmount: 15000,
  parcelValue: 15000,
  notes: "Fragile",
};
const from = { lat: 6.6, lng: 3.35 };
const to = { lat: 9.07, lng: 7.48 };
const at = new Date("2026-10-16T23:30:00Z"); // 17 Oct in Lagos

test("the state comes from the address: names, capitals and well-known areas", () => {
  assert.equal(ng.nigerianState("12 Allen Avenue, Ikeja"), "Lagos");
  assert.equal(ng.nigerianState("5 Aminu Kano Crescent, Wuse 2, Abuja"), "FCT");
  assert.equal(ng.nigerianState("Plot 4, Trans Amadi, Port Harcourt, Rivers State"), "Rivers");
  assert.equal(ng.nigerianState("3 Lagos Street, Garki, Abuja"), "FCT");
  assert.equal(ng.nigerianState("10 Ring Road, Ibadan"), "Oyo");
  assert.equal(ng.nigerianState("Cross River State, Calabar"), "Cross River");
  assert.equal(ng.nigerianState("somewhere unknown"), "Lagos");
  assert.equal(ng.nigerianState("", "Kano"), "Kano");
});

test("phones in international or local form", () => {
  assert.equal(ng.ngPhone("0803 123 4567"), "+2348031234567");
  assert.equal(ng.ngPhone("0803 123 4567", "local"), "08031234567");
  assert.equal(ng.ngPhone("+234 809 876 5432", "local"), "08098765432");
  assert.equal(ng.ngPhone("+44 20 7946 0958", "local"), "+442079460958");
  assert.equal(ng.ngPhone(""), "");
  assert.equal(ng.lagosDate(at), "2026-10-17");
  assert.deepEqual(ng.splitName("Ada Obi Eze"), { first: "Ada", last: "Obi Eze" });
  assert.deepEqual(ng.splitName("Ada"), { first: "Ada", last: "-" });
});

test("Fez: login, cost and order bodies", () => {
  const login = fez.readFezLogin({ authDetails: { authToken: "T", expireToken: "2026-10-17 05:06:08" }, orgDetails: { "secret-key": "S" } });
  assert.equal(login.token, "T");
  assert.equal(login.secret, "S");
  assert.equal(login.until, Date.parse("2026-10-17T03:56:08Z"));
  assert.equal(fez.readFezLogin({ authDetails: {} }), null);

  assert.deepEqual(fez.fezCostBody(job), { state: "FCT", pickUpState: "Lagos", weight: 3 });
  assert.equal(fez.readFezCost({ Cost: { cost: 1 }, cost: { state: "Kano", cost: 6000 }, totalCost: 6450 }), 6450);
  assert.equal(fez.readFezCost({ cost: { cost: 6000 } }), 6000);
  assert.equal(fez.readFezCost({}), null);

  const [order] = fez.fezOrderBody(job, "SIB-1", at);
  assert.equal(order.recipientState, "FCT");
  assert.equal(order.recipientPhone, "08098765432");
  assert.equal(order.uniqueID, "SIB-1");
  assert.equal(order.BatchID, "SIB-1");
  assert.equal(order.valueOfItem, "15000");
  assert.equal(order.isItemCod, true);
  assert.equal(order.cashOnDeliveryAmount, 15000);
  assert.equal(order.thirdparty, "true");
  assert.equal(order.senderPhone, "08031234567");
  assert.equal(order.pickUpDate, "2026-10-17");
  assert.equal(fez.readFezOrderNo({ orderNos: { "SIB-1": "ASAC27012319" } }, "SIB-1"), "ASAC27012319");
  assert.equal(fez.fezOk(true, { status: "Success" }), true);
  assert.equal(fez.fezOk(true, { status: "Error" }), false);
});

test("Fez statuses", () => {
  const cases = {
    "Pending Payment": "confirmed",
    "Pending Pick-Up": "confirmed",
    "Dropped-off": "confirmed",
    "Picked-Up": "picked_up",
    "Picked Up": "picked_up",
    Dispatched: "in_transit",
    Delivered: "delivered",
    Returned: "failed",
    "Rejected At Drop-off": "failed",
    "Failed Pick-Up": "failed",
    Cancelled: "cancelled",
  };
  for (const [raw, status] of Object.entries(cases)) assert.equal(fez.fezBookingStatus(raw), status, raw);
  assert.equal(fez.fezBookingStatus("Something new"), null);
  assert.equal(fez.readFezTrack({ order: { orderStatus: "Dispatched" }, history: [] }), "Dispatched");
  assert.equal(fez.fezWebhookRef({ orderNumber: "UKOOIE001F35", status: "Delivered" }), "UKOOIE001F35");
});

test("Sendstack: offers, booking body, created ids and statuses", () => {
  const offers = ss.sendstackOffersBody(job, from, to, at);
  assert.equal(offers.orderType, "PROCESSING");
  assert.equal(offers.pickup.long, 3.35);
  assert.equal(offers.drop.podAmount, 15000);
  assert.deepEqual(
    ss.cheapestSendstackOffer([{ id: "a", name: "A", price: 3200 }, { id: "b", name: "B", price: 2500 }, { id: "c", price: 0 }]),
    { partnerId: "b", name: "B", price: 2500 },
  );
  assert.equal(ss.cheapestSendstackOffer([]), null);

  const body = ss.sendstackDeliveryBody(job, from, to, at, "b", "SIB-2");
  assert.equal(body.pickup.pickupName, "Ada Shop");
  assert.equal(body.pickup.pickupNumber, "08031234567");
  assert.equal(body.drops[0].recipientNumber, "08098765432");
  assert.equal(body.drops[0].assignedPartner, "b");
  assert.equal(body.drops[0].externalOrderId, "SIB-2");

  const created = ss.readSendstackCreated({ batchId: "R8XB5B", totalAmount: 1500, drops: [{ id: "d1", trackingId: "S1ZZ4U", trackingUrl: "https://app.sendstack.africa/tracking?trackingId=S1ZZ4U" }] });
  assert.deepEqual(created, { trackingId: "S1ZZ4U", dropId: "d1", batchId: "R8XB5B", trackingUrl: "https://app.sendstack.africa/tracking?trackingId=S1ZZ4U", total: 1500 });
  assert.equal(ss.readSendstackCreated({ drops: [] }), null);
  assert.deepEqual(ss.readSendstack(true, { status: true, data: [1] }), { ok: true, data: [1] });
  assert.deepEqual(ss.readSendstack(false, { status: false, message: "Invalid app_id or app_secret" }), { ok: false, message: "Invalid app_id or app_secret" });

  assert.equal(ss.readSendstackStatus({ drops: [{ trackingId: "X", status: "PENDING" }, { trackingId: "S1ZZ4U", status: "IN_TRANSIT" }] }, "S1ZZ4U"), "IN_TRANSIT");
  const cases = { PENDING: "confirmed", REJECTED: "confirmed", ARRIVED_FOR_PICKUP: "confirmed", PICKED_UP: "picked_up", ARRIVED_FOR_DELIVERY: "in_transit", DELIVERED: "delivered", UNABLE_TO_DELIVER: "failed", CANCELLED: "cancelled" };
  for (const [raw, status] of Object.entries(cases)) assert.equal(ss.sendstackBookingStatus(raw), status, raw);
  assert.equal(ss.sendstackBookingStatus("WHATEVER"), null);
  assert.equal(ss.sendstackWebhookRef({ eventType: "order.status", trackingId: "SOKOAG", newStatus: "DELIVERED" }), "SOKOAG");
  assert.equal(ss.sendstackWebhookRef({ eventType: "order.new", drops: [{ trackingId: "T2" }] }), "T2");
});

test("Sendbox: shipment body, rate choice, created shipment and statuses", () => {
  const body = sb.sendboxShipmentBody(job, from, to, at, { serviceCode: "premium", callbackUrl: "https://app.example/api/webhooks/carriers/sendbox" });
  assert.equal(body.service_type, "local");
  assert.equal(body.origin.state, "Lagos");
  assert.equal(body.destination.state, "FCT");
  assert.equal(body.destination.city, "Abuja");
  assert.equal(body.destination.first_name, "Tunde");
  assert.equal(body.origin.phone, "+2348031234567");
  assert.equal(body.service_code, "premium");
  assert.equal(body.callback_url, "https://app.example/api/webhooks/carriers/sendbox");

  assert.deepEqual(sb.pickSendboxRate({ rate: { service_code: "standard", fee: 3000, currency: "NGN" }, rates: [] }), { code: "standard", fee: 3000, currency: "NGN" });
  assert.deepEqual(
    sb.pickSendboxRate({ currency: "NGN", rates: [{ code: "premium", fee: 5000 }, { code: "standard", fee: 3000 }, { code: "expedited", fee: 1, is_enabled: false }] }),
    { code: "standard", fee: 3000, currency: "NGN" },
  );
  assert.equal(sb.pickSendboxRate({}), null);

  assert.deepEqual(sb.readSendboxShipment({ _id: "66ba", tracking_code: "0002159289", fee: 33117, status_code: "pending" }), { code: "0002159289", id: "66ba", fee: 33117, status: "pending" });
  assert.equal(sb.readSendboxShipment({}), null);
  assert.equal(sb.readSendboxStatus({ status: { code: "in_delivery" } }), "in_delivery");
  const cases = { drafted: "confirmed", pending: "confirmed", pickup_started: "confirmed", pickup_completed: "picked_up", in_delivery: "in_transit", in_transit: "in_transit", delivered: "delivered", cancelled: "cancelled", failed_delivery: "failed" };
  for (const [raw, status] of Object.entries(cases)) assert.equal(sb.sendboxBookingStatus(raw), status, raw);
  assert.equal(sb.sendboxWebhookRef({ code: "0002159289" }), "0002159289");
});

test("every carrier is registered and its webhook only triggers a fresh read", () => {
  const index = readFileSync(new URL("../src/lib/logistics/carriers/index.ts", import.meta.url), "utf8");
  assert.match(index, /\[kwik, fez, sendstack, sendbox, shipbubble\]/);
  const webhook = readFileSync(new URL("../src/app/api/webhooks/carriers/[carrier]/route.ts", import.meta.url), "utf8");
  assert.match(webhook, /syncCarrierJobs\(\{ ids: \[booking\.id\] \}\)/);
  assert.doesNotMatch(webhook, /transitionJob/);
});
