// Logistics marketplace: places and coverage, size bands, rate cards, checkout options (self pickup, doorstep,
// pickup points, several parcels, fallback, pay on delivery), the status timeline, exceptions, partner stats and
// the chat guardrails (shared/delivery-market.ts), plus the job steps the partner can take (job-rules.ts).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const m = await import("../shared/delivery-market.ts");
const rules = await import("../src/lib/logistics/job-rules.ts");
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("places: states, aliases and areas resolve to the right state", () => {
  assert.equal(m.canonicalState("lagos state"), "Lagos");
  assert.equal(m.canonicalState("Abuja"), "FCT");
  assert.equal(m.canonicalState("Federal Capital Territory"), "FCT");
  assert.equal(m.canonicalState("Port Harcourt"), "Rivers");
  assert.equal(m.canonicalState("Ikeja"), "Lagos");
  assert.equal(m.canonicalState("Atlantis"), null);
  assert.deepEqual(m.placeOf({ city: "Ikeja" }), { state: "Lagos", area: "Ikeja" });
  assert.deepEqual(m.placeOf({ city: "Lagos", state: "Lagos" }), { state: "Lagos", area: null });
  assert.deepEqual(m.placeOf({ city: "Wuse 2", state: "FCT" }), { state: "FCT", area: "Wuse 2" });
  assert.equal(m.regionOf("Oyo"), "South-West");
});

test("areas: tokens parse, format and score from most to least specific", () => {
  assert.deepEqual(m.parseArea("Lagos: Ikeja"), { kind: "area", state: "Lagos", area: "Ikeja" });
  assert.deepEqual(m.parseArea("Ikeja"), { kind: "area", state: "Lagos", area: "Ikeja" });
  assert.deepEqual(m.parseArea("lagos"), { kind: "state", state: "Lagos" });
  assert.deepEqual(m.parseArea("south-west"), { kind: "region", region: "South-West" });
  assert.deepEqual(m.parseArea("Nationwide"), { kind: "nationwide" });
  assert.equal(m.parseArea("Mars"), null);
  const ikeja = { state: "Lagos", area: "Ikeja GRA" };
  assert.equal(m.areaScore("Lagos: Ikeja", ikeja), 4);
  assert.equal(m.areaScore("Lagos", ikeja), 3);
  assert.equal(m.areaScore("South-West", ikeja), 2);
  assert.equal(m.areaScore("Nationwide", ikeja), 1);
  assert.equal(m.areaScore("Lagos: Lekki", ikeja), -1);
  assert.equal(m.areaScore("Kano", ikeja), -1);
  assert.equal(m.areaScore("Lagos", { state: null, area: "Somewhere" }), -1);
  const cleaned = m.cleanAreas("Lagos\nabuja, Mars;  South-West");
  assert.deepEqual(cleaned.areas, ["Lagos", "FCT", "South-West"]);
  assert.deepEqual(cleaned.unknown, ["Mars"]);
  assert.deepEqual(m.cleanServices("Doorstep, pickup points, Same-day, teleport"), ["doorstep", "pickup_point", "same_day"]);
});

test("areas: an area token matches a place in the same LGA, not just by text", () => {
  const lekki = { state: "Lagos", area: "Lekki Phase 1" };
  assert.equal(m.areaScore("Lagos: Eti-Osa", lekki), 4);
  assert.equal(m.areaScore("Lagos: eti osa", lekki), 4);
  assert.equal(m.areaScore("Lagos: Lekki", lekki), 4);
  assert.equal(m.areaScore("Lagos: Lekki", { state: "Lagos", area: "Lekki" }), 4);
  assert.equal(m.areaScore("Lagos: Lekki", { state: "Lagos", area: "Victoria Island" }), -1, "an area token covers that area only, not its neighbours in the same LGA");
  assert.equal(m.areaScore("Lagos: Ibeju-Lekki", lekki), -1);
  assert.equal(m.areaScore("Lagos: Eti-Osa", { state: "Lagos", area: "Ikeja GRA" }), -1);
  assert.equal(m.areaScore("Lagos: Isolo", { state: "Lagos", area: "Okota" }), 4);
  assert.equal(m.areaScore("FCT: AMAC", m.placeOf({ city: "Wuse 2", state: "FCT" })), 4);
  assert.equal(m.areaScore("FCT: Municipal Area Council", { state: "FCT", area: "Kubwa" }), -1);
  assert.equal(m.areaScore("FCT: Bwari", { state: "FCT", area: "Kubwa" }), 4);
  assert.equal(m.areaScore("Rivers: Port Harcourt", m.placeOf({ city: "GRA Phase 2", state: "Rivers" })), 4);
  assert.equal(m.areaScore("Oyo: Eti-Osa", lekki), -1);
  assert.equal(m.areaScore("Lagos: Eti-Osa", { state: "Lagos", area: null }), -1);
  assert.equal(m.coverScore(["Lagos: Eti-Osa", "Ogun"], { state: "Lagos", area: "Ajah" }), 4);
});

test("size bands: product band, then weight, then the shop default; a parcel takes the bigger of largest item and total weight", () => {
  assert.equal(m.itemBand({ sizeBand: "bulky", weight: 1, quantity: 1 }), "bulky");
  assert.equal(m.itemBand({ weight: 500, weightUnit: "g", quantity: 1 }), "small");
  assert.equal(m.itemBand({ weight: 5, quantity: 1 }), "medium");
  assert.equal(m.itemBand({ quantity: 1 }, "medium"), "medium");
  assert.equal(m.parcelBand([{ weight: 1.5, quantity: 1 }, { weight: 1.5, quantity: 1 }]), "medium", "3 kg together is medium");
  assert.equal(m.parcelBand([{ weight: 1, quantity: 12 }]), "bulky", "12 x 1 kg is bulky");
  assert.equal(m.parcelBand([{ sizeBand: "bulky", quantity: 1 }, { weight: 0.2, quantity: 1 }]), "bulky");
  assert.equal(m.parcelBand([]), "small");
});

const row = (from, to, service, sizeBand, price, minDays = 1, maxDays = 2) => ({ from, to, service, sizeBand, price, minDays, maxDays });

test("rate cards: validation explains each problem by row; good cards are cleaned", () => {
  assert.equal(m.validateRateCard({ rows: [] }).ok, false);
  const badPlace = m.validateRateCard({ rows: [row("Mars", "Lagos", "doorstep", "small", 100)] });
  assert.match(badPlace.error, /Row 1: we don't know the place "Mars"/);
  assert.match(m.validateRateCard({ rows: [row("Lagos", "Lagos", "teleport", "small", 100)] }).error, /service/);
  assert.match(m.validateRateCard({ rows: [row("Lagos", "Lagos", "doorstep", "huge", 100)] }).error, /size/);
  assert.match(m.validateRateCard({ rows: [row("Lagos", "Lagos", "doorstep", "small", 0)] }).error, /price/);
  assert.match(m.validateRateCard({ rows: [row("Lagos", "Lagos", "doorstep", "small", 100, 3, 1)] }).error, /timeframe/);
  assert.match(m.validateRateCard({ rows: [row("Lagos", "Lagos", "same_day", "small", 100, 0, 1)] }).error, /same-day/);
  assert.match(m.validateRateCard({ rows: [row("Lagos", "Lagos", "doorstep", "small", 100), row("lagos", "LAGOS", "doorstep", "small", 200)] }).error, /Row 2: the same route/);
  const good = m.validateRateCard({ rows: [row("abuja", "Lagos: Ikeja", "doorstep", "small", "₦2,500")], failedAttemptFee: "1000", returnFee: 1500, notes: "  No Sundays " });
  assert.equal(good.ok, true);
  assert.deepEqual(good.card.rows[0], { id: "r1", from: "FCT", to: "Lagos: Ikeja", service: "doorstep", sizeBand: "small", price: 2500, minDays: 1, maxDays: 2 });
  assert.equal(good.card.failedAttemptFee, 1000);
  assert.equal(good.card.notes, "No Sundays");
});

test("rate cards: the closest route wins, then the exact band, then the cheaper price; never a smaller band", () => {
  const rows = [
    row("Lagos", "Nationwide", "doorstep", "small", 6000, 3, 5),
    row("Lagos", "South-West", "doorstep", "small", 4000, 2, 3),
    row("Lagos", "Lagos", "doorstep", "small", 2500),
    row("Lagos", "Lagos: Ikeja", "doorstep", "small", 2000),
    row("Lagos", "Lagos", "doorstep", "bulky", 9000),
    row("Lagos", "Lagos", "doorstep", "medium", 3500),
  ];
  const lagos = { state: "Lagos", area: "Yaba" };
  const q = (destination, sizeBand = "small") => m.bestRate(rows, { origin: lagos, destination, service: "doorstep", sizeBand });
  assert.equal(q({ state: "Lagos", area: "Ikeja" }).price, 2000);
  assert.equal(q({ state: "Lagos", area: "Lekki" }).price, 2500);
  assert.equal(q({ state: "Oyo", area: "Ibadan" }).price, 4000);
  assert.equal(q({ state: "Kano", area: null }).price, 6000);
  assert.equal(q({ state: "Lagos", area: "Lekki" }, "medium").price, 3500);
  assert.equal(q({ state: "Oyo", area: null }, "medium"), null, "no medium row to the South-West");
  assert.equal(m.bestRate(rows, { origin: { state: "Kano", area: null }, destination: lagos, service: "doorstep", sizeBand: "small" }), null);
  assert.equal(m.startingPrice(rows), 2000);
  assert.equal(m.timeframeWords(0, 0), "Same day");
  assert.equal(m.timeframeWords(1, 1), "1 day");
  assert.equal(m.timeframeWords(1, 2), "1–2 days");
});

const partner = (id, over = {}) => ({
  id,
  name: `Partner ${id}`,
  services: ["doorstep", "pickup_point", "same_day", "interstate"],
  pickupAreas: ["Lagos"],
  deliveryAreas: ["Nationwide"],
  offersPayOnDelivery: true,
  card: { id: `card-${id}`, rows: [row("Lagos", "Lagos", "doorstep", "medium", 2500), row("Lagos", "Lagos", "pickup_point", "medium", 1500, 2, 3), row("Lagos", "Lagos", "same_day", "small", 4000, 0, 0), row("Lagos", "FCT", "doorstep", "bulky", 8000, 2, 4)] },
  pickupPoints: [
    { id: "pt1", name: "Yaba hub", address: "1 Herbert Macaulay", state: "Lagos", area: "Yaba", hours: "8am–6pm", phone: null },
    { id: "pt2", name: "Ikeja hub", address: "2 Allen Avenue", state: "Lagos", area: "Ikeja", hours: null, phone: null },
    { id: "pt3", name: "Wuse hub", address: "3 Aminu Kano", state: "FCT", area: "Wuse", hours: null, phone: null },
  ],
  ...over,
});
const connection = (id, over = {}) => ({ id: `c-${id}`, services: ["doorstep", "pickup_point"], showPartnerName: true, label: null, ownerPod: false, partnerPod: false, partner: partner(id), ...over });
const settings = (over = {}) => ({ sellArea: "nationwide", sellStates: [], selfPickup: false, pickupAddress: null, pickupHours: null, pickupInstructions: null, fallback: "pickup_only", fallbackFee: 0, ...over });
const lagosOrigin = { state: "Lagos", area: "Yaba" };

test("checkout: self pickup, doorstep, same-day and pickup points in the customer's state, cheapest first", () => {
  const choice = m.buildMarketChoice({
    settings: settings({ selfPickup: true, pickupAddress: "5 Shop St, Yaba", pickupHours: "9–5" }),
    shipments: [{ key: "own", origin: lagosOrigin, sizeBand: "small", connections: [connection("a"), connection("b", { partner: partner("b", { card: { id: "card-b", rows: [row("Lagos", "Lagos", "doorstep", "small", 2200)] } }) })] }],
    destination: { state: "Lagos", area: "Ikeja" },
  });
  assert.equal(choice.covered, true);
  const ids = choice.options.map((option) => option.id);
  assert.deepEqual(ids, ["self_pickup", "d:c-b", "d:c-a", "s:c-a", "p:c-a:pt2", "p:c-a:pt1"], "Ikeja's point first; FCT's never");
  assert.equal(choice.options[0].price, 0);
  assert.equal(choice.options[0].detail, "5 Shop St, Yaba · 9–5");
  assert.equal(choice.options[1].detail, "Partner b");
  assert.equal(choice.options[1].price, 2200);
  assert.equal(choice.options[2].estimatedDays, "1–2 days");
  assert.equal(choice.options[3].estimatedDays, "Same day");
  assert.equal(choice.options[4].pickup, true);
  assert.equal(choice.options[4].parts[0].pointId, "pt2");
  assert.equal(choice.options[4].parts[0].rateCardId, "card-a");
});

test("checkout: partners under the shop's own label collapse to the cheapest; services the shop didn't offer are hidden", () => {
  const choice = m.buildMarketChoice({
    settings: settings(),
    shipments: [{ key: "own", origin: lagosOrigin, sizeBand: "small", connections: [
      connection("a", { showPartnerName: false, label: "Standard delivery", services: ["doorstep"] }),
      connection("b", { showPartnerName: false, label: "Standard delivery", services: ["doorstep"], partner: partner("b", { card: { id: "card-b", rows: [row("Lagos", "Lagos", "doorstep", "small", 1900)] } }) }),
    ] }],
    destination: { state: "Lagos", area: "Lekki" },
  });
  const doorstep = choice.options.filter((option) => option.kind === "doorstep");
  assert.equal(doorstep.length, 1);
  assert.equal(doorstep[0].detail, "Standard delivery");
  assert.equal(doorstep[0].price, 1900);
  assert.equal(choice.options.some((option) => option.kind === "pickup_point"), false);
});

test("checkout: interstate needs the partner's interstate service and coverage; sizes and origins are respected", () => {
  const destination = { state: "FCT", area: "Wuse" };
  const base = { key: "own", origin: lagosOrigin, sizeBand: "bulky" };
  const yes = m.buildMarketChoice({ settings: settings(), shipments: [{ ...base, connections: [connection("a")] }], destination });
  assert.deepEqual(yes.options.map((option) => [option.id, option.price]), [["d:c-a", 8000]]);
  const noInterstate = m.buildMarketChoice({ settings: settings(), shipments: [{ ...base, connections: [connection("a", { partner: partner("a", { services: ["doorstep"] }) })] }], destination });
  assert.equal(noInterstate.covered, false);
  assert.match(noInterstate.reason, /No delivery/);
  const wrongOrigin = m.buildMarketChoice({ settings: settings(), shipments: [{ ...base, origin: { state: "Kano", area: null }, connections: [connection("a")] }], destination });
  assert.equal(wrongOrigin.covered, false);
  const noCard = m.buildMarketChoice({ settings: settings(), shipments: [{ ...base, connections: [connection("a", { partner: partner("a", { card: null }) })] }], destination });
  assert.equal(noCard.covered, false);
});

test("checkout: where the shop sells, the fallback fee, and pay on delivery only when both sides opt in", () => {
  const ship = [{ key: "own", origin: lagosOrigin, sizeBand: "small", connections: [connection("a", { ownerPod: true, partnerPod: true })] }];
  const lagosOnly = settings({ sellArea: "one_state", sellStates: ["Lagos"] });
  assert.equal(m.buildMarketChoice({ settings: lagosOnly, shipments: ship, destination: { state: "Kano", area: null } }).covered, false);
  const withPickup = m.buildMarketChoice({ settings: { ...lagosOnly, selfPickup: true }, shipments: ship, destination: { state: "Kano", area: null } });
  assert.deepEqual(withPickup.options.map((option) => option.id), ["self_pickup"]);
  assert.match(withPickup.reason, /doesn't deliver to your state/);
  const lagos = m.buildMarketChoice({ settings: lagosOnly, shipments: ship, destination: { state: "Lagos", area: "Yaba" } });
  assert.equal(lagos.options.find((option) => option.id === "d:c-a").pod, true);
  const oneSided = m.buildMarketChoice({ settings: settings(), shipments: [{ ...ship[0], connections: [connection("a", { ownerPod: true })] }], destination: { state: "Lagos", area: "Yaba" } });
  assert.equal(oneSided.options[0].pod, false);
  const fallback = m.buildMarketChoice({ settings: settings({ fallback: "flat_fee", fallbackFee: 3000 }), shipments: [{ ...ship[0], connections: [] }], destination: { state: "Ogun", area: null } });
  assert.deepEqual(fallback.options.map((option) => [option.id, option.price, option.parts[0].service]), [["fallback", 3000, "fallback"]]);
});

test("checkout: items from two places are two parcels, each with its own fee, added up; self pickup and points aren't offered", () => {
  const choice = m.buildMarketChoice({
    settings: settings({ selfPickup: true }),
    shipments: [
      { key: "own", origin: lagosOrigin, sizeBand: "small", connections: [connection("a")] },
      { key: "supplier:s1", origin: { state: "Lagos", area: "Ikeja" }, sizeBand: "medium", connections: [connection("b", { ownerPod: true, partnerPod: true })] },
    ],
    destination: { state: "Lagos", area: "Lekki" },
  });
  assert.equal(choice.shipmentCount, 2);
  assert.deepEqual(choice.options.map((option) => option.id), ["multi:doorstep"]);
  assert.equal(choice.options[0].price, 5000);
  assert.deepEqual(choice.options[0].parts.map((part) => [part.shipmentKey, part.partnerId, part.price]), [["own", "a", 2500], ["supplier:s1", "b", 2500]]);
  assert.equal(choice.options[0].pod, false, "pay on delivery needs every parcel's partner to allow it");
  const uncovered = m.buildMarketChoice({
    settings: settings(),
    shipments: [
      { key: "own", origin: lagosOrigin, sizeBand: "small", connections: [connection("a")] },
      { key: "supplier:s1", origin: { state: "Kano", area: null }, sizeBand: "small", connections: [connection("b")] },
    ],
    destination: { state: "Lagos", area: "Lekki" },
  });
  assert.equal(uncovered.covered, false);
});

test("delivery plan: the chosen option is saved per parcel and read back; only partner parcels become jobs", () => {
  const choice = m.buildMarketChoice({ settings: settings({ selfPickup: true }), shipments: [{ key: "own", origin: lagosOrigin, sizeBand: "small", connections: [connection("a")] }], destination: { state: "Lagos", area: "Ikeja" } });
  const { option, fee } = m.chooseMarketOption(choice, "d:c-a");
  assert.equal(fee, 2500);
  const plan = m.planFromOption(option);
  assert.equal(m.readDeliveryPlan({ type: "network", delivery: plan }).shipments[0].bookingId, null);
  assert.equal(m.partnerShipments(plan).length, 1);
  assert.equal(m.partnerShipments(m.planFromOption(m.chooseMarketOption(choice, "self_pickup").option)).length, 0);
  assert.equal(m.readDeliveryPlan({}), null);
  assert.equal(m.chooseMarketOption(choice, "nope").option.id, "self_pickup", "an unknown id falls back to the first option");
});

test("status model: the partner's steps follow the spec, with decline, out for delivery, pickup points and returns", () => {
  assert.deepEqual(rules.nextStatuses("pending"), ["confirmed", "declined", "cancelled"]);
  assert.ok(rules.canMove("picked_up", "out_for_delivery"));
  assert.ok(rules.canMove("in_transit", "at_pickup_point"));
  assert.ok(rules.canMove("at_pickup_point", "delivered"));
  assert.ok(rules.canMove("failed", "returning"));
  assert.ok(rules.canMove("returning", "returned"));
  assert.equal(rules.canMove("declined", "confirmed"), false);
  const decline = rules.checkTransition({ status: "pending", deliveryCode: null, codAmount: null }, { to: "declined", actor: "partner" });
  assert.equal(decline.ok, false);
  assert.match(decline.error, /why/i);
  assert.equal(rules.checkTransition({ status: "pending", deliveryCode: null, codAmount: null }, { to: "declined", actor: "partner", declineReason: "No rider free in time" }).ok, true);
});

test("timeline: plain words for the customer, doorstep vs pickup point, and self pickup", () => {
  const order = { createdAt: "2026-10-20T08:00:00Z", deliveredAt: null };
  const job = { status: "out_for_delivery", service: "doorstep", createdAt: "2026-10-20T09:00:00Z", acceptedAt: "2026-10-20T09:10:00Z", pickedUpAt: "2026-10-20T11:00:00Z", outForDeliveryAt: "2026-10-20T13:00:00Z" };
  const steps = m.deliveryTimeline(order, job, "doorstep");
  assert.deepEqual(steps.map((step) => step.label), ["Order placed", "Sent to delivery partner", "Accepted", "Picked up", "In transit", "Out for delivery", "Delivered"]);
  assert.deepEqual(steps.map((step) => step.done), [true, true, true, true, true, true, false]);
  const point = m.deliveryTimeline(order, { ...job, status: "at_pickup_point", service: "pickup_point" }, "pickup_point");
  assert.equal(point.at(-2).label, "At pickup point");
  assert.equal(point.at(-1).label, "Collected");
  assert.deepEqual(m.deliveryTimeline(order, null, "self_pickup").map((step) => step.label), ["Order placed", "Ready for pickup", "Collected"]);
});

test("exceptions: declined, not accepted in time, late pickup, failed attempts, address problems, returns", () => {
  const now = new Date("2026-10-20T12:00:00Z");
  assert.equal(m.jobException({ status: "declined" }, now), "declined");
  assert.equal(m.jobException({ status: "declined", replacedById: "x" }, now), null);
  assert.equal(m.jobException({ status: "pending", acceptBy: "2026-10-20T11:00:00Z" }, now), "not_accepted");
  assert.equal(m.jobException({ status: "pending", acceptBy: "2026-10-20T13:00:00Z" }, now), null);
  assert.equal(m.jobException({ status: "confirmed", readyAt: "2026-10-19T08:00:00Z" }, now), "late_pickup");
  assert.equal(m.jobException({ status: "confirmed", readyAt: "2026-10-20T08:00:00Z" }, now), null);
  assert.equal(m.jobException({ status: "failed", failedReason: "Customer not picking calls" }, now), "failed_attempt");
  assert.equal(m.jobException({ status: "failed", failedReason: "Couldn't find the address" }, now), "address_problem");
  assert.equal(m.jobException({ status: "returning" }, now), "returning");
  assert.equal(m.canReassign("declined"), true);
  assert.equal(m.canReassign("failed_attempt"), false);
});

test("partner stats: completed count, on-time and failed rates only with enough jobs; ranking rewards in-app volume", () => {
  const delivered = (late) => ({ status: "delivered", estimatedDelivery: "2026-10-10T00:00:00Z", deliveredAt: late ? "2026-10-12T00:00:00Z" : "2026-10-09T00:00:00Z" });
  assert.deepEqual(m.partnerStats([delivered(false)]), { completed: 1, onTimeRate: null, failedRate: null });
  const stats = m.partnerStats([delivered(false), delivered(false), delivered(false), delivered(true), { ...delivered(false), failedAttempts: 1 }, { status: "returned" }]);
  assert.equal(stats.completed, 5);
  assert.equal(stats.onTimeRate, 80);
  assert.equal(stats.failedRate, 33);
  const busy = m.rankScore({ stats: { completed: 500, onTimeRate: 95, failedRate: 2 }, rating: 4.8, ratingCount: 120, match: 3, verified: true });
  const quiet = m.rankScore({ stats: { completed: 2, onTimeRate: null, failedRate: null }, rating: 0, ratingCount: 0, match: 3, verified: true });
  assert.ok(busy > quiet);
});

test("chat guardrails: phone numbers, bank accounts, emails and 'pay me directly' get a gentle note; normal chat doesn't", () => {
  assert.deepEqual(m.offPlatformSignals("Call me on 0803 123 4567"), ["phone", "pay_direct"]);
  assert.deepEqual(m.offPlatformSignals("+2348031234567"), ["phone"]);
  assert.deepEqual(m.offPlatformSignals("GTB account 0123456789"), ["bank_account"]);
  assert.deepEqual(m.offPlatformSignals("email me: ola@example.com"), ["email"]);
  assert.deepEqual(m.offPlatformSignals("Just transfer to my account"), ["pay_direct"]);
  assert.deepEqual(m.offPlatformSignals("Can you do ₦2,000 for 50 parcels a week from Yaba?"), []);
  assert.deepEqual(m.offPlatformSignals("Order 1234567890 is ready"), [], "ten digits without bank words is an order number");
  assert.match(m.OFF_PLATFORM_WARNING, /Keep jobs and payments in Shopinbos/);
  assert.match(m.POD_DISCLAIMER, /does not handle, hold or guarantee/);
});

test("wiring: the migration adds every new column and table, and the schema has the new statuses", () => {
  const sql = read("docs/migrations/2026-11-14-logistics-marketplace.sql");
  for (const name of ["LogisticsRateCard", "LogisticsPickupPoint", "DeliverySettings", "DeliveryConnection", "DeliveryIssue"]) assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS "${name}"`));
  for (const status of ["declined", "out_for_delivery", "at_pickup_point", "returning", "returned"]) assert.match(sql, new RegExp(`ADD VALUE IF NOT EXISTS '${status}'`));
  assert.doesNotMatch(sql, /DROP /i);
  const schema = read("prisma/schema.prisma");
  assert.match(schema, /model DeliveryConnection \{/);
  assert.match(schema, /acceptBy\s+DateTime\?/);
});

test("payments: each partner's delivery fee is split straight to the partner; Shopinbos's fee is only on what the seller sells", async () => {
  const rules = await import("../src/lib/wallet/rules.ts");
  const plan = rules.buildSplitPlan({
    totalKobo: 2_000_000,
    sellerSubaccount: "ACCT_seller",
    suppliers: [{ supplierId: "s1", subaccount: "ACCT_sup", costKobo: 800_000 }],
    platformKobo: 15_000,
    delivery: [
      { shipmentKey: "own", partnerId: "p1", subaccount: "ACCT_p1", kobo: 250_000 },
      { shipmentKey: "supplier:s1", partnerId: "p2", subaccount: null, kobo: 250_000 },
    ],
  });
  assert.deepEqual(plan.delivery, [{ shipmentKey: "own", partnerId: "p1", subaccount: "ACCT_p1", kobo: 250_000 }], "a partner without a wallet isn't in the split");
  assert.equal(plan.totalKobo, 2_000_000);
  assert.equal(plan.suppliers[0].kobo, 800_000);
  assert.equal(plan.sellerKobo, 2_000_000 - 250_000 - 800_000 - 15_000, "the seller keeps the unpaid partner's fee and pays them");
  const shares = rules.splitShares(plan);
  assert.equal(shares.reduce((sum, share) => sum + share.kobo, 0) + plan.platformKobo, 2_000_000);
  assert.deepEqual(rules.paystackSplitParams(plan).split.subaccounts.find((share) => share.subaccount === "ACCT_p1"), { subaccount: "ACCT_p1", share: 250_000 });
  const tooBig = rules.buildSplitPlan({ totalKobo: 200_000, sellerSubaccount: "ACCT_seller", suppliers: [], delivery: [{ shipmentKey: "own", partnerId: "p1", subaccount: "ACCT_p1", kobo: 195_000 }] });
  assert.equal(tooBig.delivery, undefined, "never leaves the seller under the minimum share");
});

test("checkout: a supplier that delivers itself is offered where it drives to, and its fee goes to it", () => {
  const supplierShip = (over = {}) => ({ key: "supplier:s1", origin: { state: "Abia", area: "Aba" }, sizeBand: "small", connections: [], selfDelivery: { fee: 1500, states: [] }, ...over });
  const near = m.buildMarketChoice({ settings: settings(), shipments: [supplierShip()], destination: { state: "Abia", area: "Umuahia" } });
  assert.deepEqual(near.options.map((option) => [option.id, option.price, option.kind, option.pod, option.parts[0].service]), [["o:supplier:s1", 1500, "doorstep", false, "supplier_self"]]);
  assert.equal(near.options[0].detail, "Standard delivery", "the customer never sees the supplier");
  assert.equal(m.buildMarketChoice({ settings: settings(), shipments: [supplierShip()], destination: { state: "Lagos", area: null } }).covered, false, "its own state only by default");
  const wider = m.buildMarketChoice({ settings: settings(), shipments: [supplierShip({ selfDelivery: { fee: 2500, states: ["Imo", "Abia"] } })], destination: { state: "Imo", area: "Owerri" } });
  assert.equal(wider.options[0].price, 2500);
  assert.equal(wider.options[0].estimatedDays, "2–5 days");
  assert.equal(m.buildMarketChoice({ settings: settings(), shipments: [supplierShip({ key: "own" })], destination: { state: "Abia", area: null } }).covered, false, "only a supplier's parcel");
  assert.equal(m.buildMarketChoice({ settings: settings(), shipments: [supplierShip({ selfDelivery: { fee: 0, states: [] } })], destination: { state: "Abia", area: null } }).covered, false, "needs a fee");
  // Several parcels: the supplier's own delivery when it's cheaper than (or there's no) partner.
  const multi = m.buildMarketChoice({
    settings: settings(),
    shipments: [{ key: "own", origin: lagosOrigin, sizeBand: "medium", connections: [connection("a")] }, supplierShip({ origin: lagosOrigin })],
    destination: { state: "Lagos", area: "Yaba" },
  });
  assert.deepEqual(multi.options[0].parts.map((part) => [part.shipmentKey, part.service, part.price]), [["own", "doorstep", 2500], ["supplier:s1", "supplier_self", 1500]]);
  assert.equal(multi.options[0].price, 4000);
  assert.equal(multi.options[0].pod, false);
  const plan = m.planFromOption(multi.options[0]);
  assert.deepEqual(m.supplierSelfShipments(plan).map((part) => part.shipmentKey), ["supplier:s1"]);
  assert.deepEqual(m.partnerShipments(plan).map((part) => part.shipmentKey), ["own"], "no partner job for the supplier's own delivery");
});
