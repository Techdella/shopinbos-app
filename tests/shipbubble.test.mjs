// Shipbubble, the aggregator network (src/lib/logistics/carriers/shipbubble-pure.ts): addresses, rates (one option
// per courier, priced by what the wallet is charged), labels, statuses and webhooks.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const sb = await import("../src/lib/logistics/carriers/shipbubble-pure.ts");

const job = {
  pickup: { name: "Ada Shop", phone: "0803 123 4567", email: "shop@example.com", address: "12 Allen Avenue, Ikeja, Lagos" },
  dropoff: { name: "Tunde Bello", phone: "+2348098765432", address: "5 Aminu Kano Crescent, Wuse 2, Abuja" },
  weightKg: 2,
  parcelValue: 15000,
  notes: "Shoes · Fragile",
};

test("envelopes: success carries data, failures the first error", () => {
  assert.deepEqual(sb.readShipbubble(true, { status: "success", data: { a: 1 } }), { ok: true, data: { a: 1 } });
  assert.deepEqual(sb.readShipbubble(false, { status: "failed", message: "x", errors: ["Recipient full name is required"] }), { ok: false, message: "Recipient full name is required" });
  assert.deepEqual(sb.readShipbubble(true, { status: "failed", message: "Insufficient wallet balance" }), { ok: false, message: "Insufficient wallet balance" });
});

test("addresses: our coordinates and an email even when the customer has none", () => {
  const body = sb.shipbubbleAddressBody(job.dropoff, "shop@example.com", { lat: 9.07, lng: 7.48 });
  assert.deepEqual(body, { name: "Tunde Bello", email: "shop@example.com", phone: "+2348098765432", address: "5 Aminu Kano Crescent, Wuse 2, Abuja", latitude: 9.07, longitude: 7.48 });
  assert.equal(sb.readAddressCode({ address_code: 98794022 }), 98794022);
  assert.equal(sb.readAddressCode({}), null);
});

test("the package category follows the parcel, else a general one", () => {
  const cats = [{ category_id: 3035980, category: "Electronics" }, { category_id: 98246239, category: "Fashion wears" }, { category_id: 90097994, category: "Accessories" }];
  assert.equal(sb.pickCategory(cats, "Electronics · Fragile"), 3035980);
  assert.equal(sb.pickCategory(cats, "Fashion dress"), 98246239);
  assert.equal(sb.pickCategory(cats, "Something odd"), 98246239);
  assert.equal(sb.pickCategory(cats, null, 123), 123);
  assert.equal(sb.pickCategory([], "x"), null);
});

test("rates body uses address codes, KG and CM, and Shipbubble's spelling", () => {
  const body = sb.shipbubbleRatesBody(job, { sender: 1, receiver: 2 }, 99, new Date("2026-10-16T23:30:00Z"));
  assert.equal(body.sender_address_code, 1);
  assert.equal(body.reciever_address_code, 2);
  assert.equal(body.pickup_date, "2026-10-17");
  assert.equal(body.category_id, 99);
  assert.deepEqual(body.package_items[0], { name: "Shoes", description: "Shoes · Fragile", unit_weight: "2", unit_amount: "15000", quantity: "1" });
  assert.deepEqual(body.package_dimension, { length: 20, width: 20, height: 10 });
});

test("one option per courier, priced by what the wallet is charged, cheapest first", () => {
  const rated = sb.readShipbubbleRates({
    request_token: "tok",
    couriers: [
      { courier_id: "gigl", courier_name: "GIG logistics", service_code: "gigl", rate_card_amount: 4000, total: 3800, currency: "NGN", delivery_eta: "Within 2 days", is_cod_available: false },
      { courier_id: 2, courier_name: "Dellyman", service_code: "dellyman", rate_card_amount: 1830, total: 400, currency: "₦", delivery_eta: "Same day delivery", is_cod_available: true },
      { courier_id: "bad", service_code: "x", total: 0 },
    ],
  });
  assert.equal(rated.token, "tok");
  assert.deepEqual(rated.options.map((o) => [o.id, o.name, o.price, o.currency]), [
    ["dellyman:2", "Dellyman", 400, "NGN"],
    ["gigl:gigl", "GIG logistics", 3800, "NGN"],
  ]);
  assert.equal(rated.options[0].cod, true);
  assert.deepEqual(sb.readShipbubbleRates(null), { token: null, options: [] });
});

test("labels, statuses and webhooks", () => {
  assert.deepEqual(sb.readShipbubbleLabel({ order_id: "SB-2CF48224272", tracking_url: "https://shipbubble.com/track/SB-2CF48224272", payment: { shipping_fee: 3800 } }), { orderId: "SB-2CF48224272", trackingUrl: "https://shipbubble.com/track/SB-2CF48224272", fee: 3800 });
  assert.equal(sb.readShipbubbleLabel({}), null);
  assert.equal(sb.readShipbubbleStatus({ results: [{ order_id: "A", status: "pending" }, { order_id: "B", status: "in_transit" }] }, "B"), "in_transit");
  const cases = { pending: "confirmed", confirmed: "confirmed", picked_up: "picked_up", "Picked Up": "picked_up", in_transit: "in_transit", completed: "delivered", cancelled: "cancelled" };
  for (const [raw, status] of Object.entries(cases)) assert.equal(sb.shipbubbleBookingStatus(raw), status, raw);
  assert.equal(sb.shipbubbleBookingStatus("weird"), null);
  assert.equal(sb.shipbubbleWebhookRef({ event: "shipment.status.changed", order_id: "SB-1", status: "completed" }), "SB-1");
  assert.equal(sb.shipbubbleWebhookRef({ event: "wallet.threshold.alert" }), null);
});

test("Shipbubble is registered, refuses pay-on-delivery jobs, and each courier is booked as picked", () => {
  assert.match(readFileSync(new URL("../src/lib/logistics/carriers/index.ts", import.meta.url), "utf8"), /shipbubble\]/);
  const client = readFileSync(new URL("../src/lib/logistics/carriers/shipbubble.ts", import.meta.url), "utf8");
  assert.match(client, /if \(job\.codAmount && job\.codAmount > 0\) return carrierSaid/);
  assert.match(client, /res\.value\.options\.find\(\(o\) => o\.id === options\.optionId\)/);
  const networks = readFileSync(new URL("../src/lib/logistics/networks.server.ts", import.meta.url), "utf8");
  assert.match(networks, /optionId: request\.option \?\? null/);
  assert.match(networks, /if \(carrier\.options && !input\.option\) throw/);
});
