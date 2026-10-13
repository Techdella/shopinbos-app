// Suppliers accept new orders in time (countdown, reminder, expiry) and book a rider for a set pickup time.
// The rules live in shared/supplier-pickup.ts (pure, loaded directly; Node strips the types). The wiring is checked
// by reading the source.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const sp = await import("../shared/supplier-pickup.ts");
const so = await import("../src/lib/supplier-orders/pure.ts");

const HOUR = 3_600_000;
const MIN = 60_000;

// ─── Deadline ─────────────────────────────────────────────────────────────────

test("deadline: 4 h for orders shops sold, 24 h for bulk orders; env and the admin's per-supplier setting override", () => {
  assert.equal(sp.acceptHours("dropship"), 4);
  assert.equal(sp.acceptHours("wholesale"), 24);
  assert.equal(sp.acceptHours("dropship", { dropship: "6" }), 6);
  assert.equal(sp.acceptHours("wholesale", { dropship: "6", wholesale: "12" }), 12);
  assert.equal(sp.acceptHours("dropship", { dropship: "0.05" }), 0.05, "decimals allowed, for testing with a short deadline");
  assert.equal(sp.acceptHours("dropship", { dropship: "nonsense" }), 4, "bad env falls back");
  assert.equal(sp.acceptHours("dropship", { dropship: "-3" }), 4);
  assert.equal(sp.acceptHours("dropship", { dropship: "500" }), 168, "a week at most");
  assert.equal(sp.acceptHours("dropship", { dropship: "6" }, 2), 2, "the admin's setting wins");
  assert.equal(sp.acceptHours("wholesale", {}, null), 24);

  const placed = new Date("2026-10-12T22:30:00Z"); // 11:30pm in Lagos: night hours count, no business-hours maths
  assert.equal(sp.acceptDeadline(placed, 4).toISOString(), "2026-10-13T02:30:00.000Z");
  assert.equal(sp.acceptDeadline(placed, 24).toISOString(), "2026-10-13T22:30:00.000Z");
  assert.equal(sp.hoursInWords(4), "4 hours");
  assert.equal(sp.hoursInWords(0.5), "30 minutes");
});

// ─── Countdown ────────────────────────────────────────────────────────────────

test("countdown text ticks in plain words and turns amber in the last 30 minutes", () => {
  const now = Date.parse("2026-10-12T10:00:00Z");
  const at = (ms) => new Date(now + ms).toISOString();
  assert.equal(sp.acceptCountdown(at(2 * HOUR + 14 * MIN + 30_000), now).text, "Accept in 2h 14m");
  assert.equal(sp.acceptCountdown(at(3 * HOUR), now).text, "Accept in 3h");
  assert.equal(sp.acceptCountdown(at(23 * HOUR + 59 * MIN), now).text, "Accept in 23h 59m");
  assert.equal(sp.acceptCountdown(at(3 * 24 * HOUR), now).text, "Accept in 3 days");

  const calm = sp.acceptCountdown(at(45 * MIN), now);
  assert.equal(calm.text, "Accept in 45m");
  assert.equal(calm.soon, false);
  assert.equal(calm.warning, null);

  const soon = sp.acceptCountdown(at(29 * MIN + 59_000), now);
  assert.equal(soon.text, "Accept in 29m");
  assert.equal(soon.soon, true, "amber");
  assert.equal(soon.warning, "Accept soon or the shop will be told");

  assert.equal(sp.acceptCountdown(at(20_000), now).text, "Accept in less than a minute");
  const over = sp.acceptCountdown(at(-1), now);
  assert.equal(over.expired, true);
  assert.equal(over.text, "Time ran out");
  assert.equal(sp.acceptCountdown(null, now), null, "older orders without a deadline show no countdown");
});

// ─── Expiry selection and reminders ───────────────────────────────────────────

test("expiry picks only new orders past their deadline, oldest first; reminders go once, an hour before", () => {
  const now = new Date("2026-10-12T12:00:00Z");
  const rows = [
    { id: "late-2", status: "pending", acceptBy: new Date(now.getTime() - 5 * MIN) },
    { id: "late-1", status: "pending", acceptBy: new Date(now.getTime() - 50 * MIN) },
    { id: "exact", status: "pending", acceptBy: new Date(now.getTime()) },
    { id: "accepted", status: "accepted", acceptBy: new Date(now.getTime() - HOUR) },
    { id: "future", status: "pending", acceptBy: new Date(now.getTime() + MIN) },
    { id: "no-deadline", status: "pending", acceptBy: null },
  ];
  assert.deepEqual(sp.selectExpired(rows, now).map((row) => row.id), ["late-1", "late-2", "exact"]);
  assert.deepEqual(sp.expiryGuard("x", now), { id: "x", status: "pending", acceptBy: { lte: now } });

  const created = new Date(now.getTime() - 3 * HOUR);
  const due = { status: "pending", acceptBy: new Date(now.getTime() + 40 * MIN), acceptReminderAt: null, createdAt: created };
  assert.equal(sp.reminderDue(due, now), true);
  assert.equal(sp.reminderDue({ ...due, acceptReminderAt: now }, now), false, "only once");
  assert.equal(sp.reminderDue({ ...due, acceptBy: new Date(now.getTime() + 2 * HOUR) }, now), false, "not yet");
  assert.equal(sp.reminderDue({ ...due, acceptBy: new Date(now.getTime() - MIN) }, now), false, "past: the expiry handles it");
  assert.equal(sp.reminderDue({ ...due, status: "accepted" }, now), false);
  assert.equal(sp.reminderDue({ ...due, createdAt: new Date(now.getTime() - 20 * MIN) }, now), false, "a one-hour window gets no extra reminder");
});

// ─── Race with accept ─────────────────────────────────────────────────────────

// A tiny stand-in for Postgres updateMany: each update checks its WHERE against the row as it is at that moment.
function updateMany(table, where, data) {
  const row = table.get(where.id);
  if (!row) return { count: 0 };
  for (const [key, cond] of Object.entries(where)) {
    if (key === "id") continue;
    if (cond && typeof cond === "object" && "lte" in cond) {
      if (!row[key] || row[key].getTime() > cond.lte.getTime()) return { count: 0 };
    } else if (row[key] !== cond) return { count: 0 };
  }
  Object.assign(row, data);
  return { count: 1 };
}

test("race: an accept that lands at the same moment as the expiry wins, and only one of them moves the order", () => {
  const deadline = new Date("2026-10-12T12:00:00Z");
  const now = new Date(deadline.getTime() + 1000);
  for (const acceptFirst of [true, false]) {
    const table = new Map([["o1", { id: "o1", status: "pending", acceptBy: deadline }]]);
    // Both read "pending" before either writes.
    const seenByAccept = table.get("o1").status;
    const seenByCron = sp.selectExpired([...table.values()], now).map((row) => row.id);
    assert.equal(seenByAccept, "pending");
    assert.deepEqual(seenByCron, ["o1"]);
    const accept = () => updateMany(table, { id: "o1", status: seenByAccept }, { status: so.supplierOrderStatusAfter("pending", "accept") });
    const expire = () => updateMany(table, sp.expiryGuard("o1", now), { status: "expired", expiredAt: now });
    const [first, second] = acceptFirst ? [accept(), expire()] : [expire(), accept()];
    assert.equal(first.count, 1);
    assert.equal(second.count, 0, "the second writer matches nothing");
    assert.equal(table.get("o1").status, acceptFirst ? "accepted" : "expired");
  }
  // An expired order can't be accepted afterwards.
  assert.equal(so.supplierOrderStatusAfter("expired", "accept"), null);
  assert.deepEqual(so.supplierOrderActions("expired"), []);
});

test("an expired line holds the shop's order for the seller to decide, like a declined one", () => {
  assert.equal(so.retailStatusAfterSupplierUpdate({ retailStatus: "paid", supplierStatuses: ["shipped", "expired"], sellerLines: 0 }), "processing");
  assert.equal(so.retailStatusAfterSupplierUpdate({ retailStatus: "paid", supplierStatuses: ["expired"], sellerLines: 0 }), null);
  assert.equal(so.sellerWholesaleStage("cancelled", so.EXPIRED_WHOLESALE_REASON).label, "The supplier didn't answer in time");
});

// ─── Pickup slots (Lagos time) ────────────────────────────────────────────────

const keys = (now) => sp.pickupSlots(new Date(now)).slots.map((slot) => slot.key);

test("slots in Lagos time: mid-morning offers In 1 hour, this afternoon, this evening and tomorrow morning", () => {
  const now = new Date("2026-10-12T09:00:00Z"); // 10am in Lagos
  const { slots, preselected } = sp.pickupSlots(now);
  assert.deepEqual(slots.map((slot) => slot.label), ["In 1 hour", "This afternoon (12–4pm)", "This evening (4–7pm)", "Tomorrow morning (9am–12pm)"]);
  assert.equal(preselected, "in_1_hour", "the soonest is picked");
  const inAnHour = slots[0];
  assert.equal(inAnHour.start, "2026-10-12T10:00:00.000Z"); // 11am Lagos
  assert.equal(sp.pickupWindowText(inAnHour.start, inAnHour.end, now), "Pick up 11am–1pm today");
  const afternoon = slots[1];
  assert.equal(afternoon.start, "2026-10-12T11:00:00.000Z"); // 12pm Lagos
  assert.equal(afternoon.end, "2026-10-12T15:00:00.000Z"); // 4pm Lagos
  assert.equal(sp.pickupWindowText(afternoon.start, afternoon.end, now), "Pick up 12–4pm today");
  assert.equal(sp.pickupWindowText(slots[3].start, slots[3].end, now), "Pick up 9am–12pm tomorrow");
});

test("slots: a window already under way starts after an hour's notice; before 8am 'This morning' is offered", () => {
  const now = new Date("2026-10-12T12:20:00Z"); // 1:20pm Lagos
  const afternoon = sp.pickupSlots(now).slots.find((slot) => slot.key === "this_afternoon");
  assert.equal(sp.pickupWindowText(afternoon.start, afternoon.end, now), "Pick up 2:30–4pm today");
  assert.deepEqual(keys("2026-10-12T05:30:00Z"), ["this_morning", "this_afternoon", "this_evening", "tomorrow_morning"]); // 6:30am Lagos
});

test("slots roll over to tomorrow late in the evening (Lagos), including after midnight UTC differences", () => {
  // 6:30pm Lagos: nothing a rider can still make today.
  const evening = sp.pickupSlots(new Date("2026-10-12T17:30:00Z"));
  assert.deepEqual(evening.slots.map((slot) => slot.key), ["tomorrow_morning", "tomorrow_afternoon"]);
  assert.equal(evening.preselected, "tomorrow_morning");
  assert.equal(evening.slots[0].start, "2026-10-13T08:00:00.000Z"); // 9am Lagos on the 13th
  // 11:30pm UTC is already 12:30am the next day in Lagos: "today" is the 13th there.
  const late = new Date("2026-10-12T23:30:00Z");
  const after = sp.pickupSlots(late);
  assert.deepEqual(after.slots.map((slot) => slot.key), ["this_morning", "this_afternoon", "this_evening", "tomorrow_morning"]);
  assert.equal(after.slots[0].start, "2026-10-13T08:00:00.000Z");
  assert.equal(sp.pickupWindowText(after.slots[0].start, after.slots[0].end, late), "Pick up 9am–12pm today");
  assert.equal(sp.pickupWindowText(after.slots[3].start, after.slots[3].end, late), "Pick up 9am–12pm tomorrow");
});

test("Pick a time: a 2-hour window on a day this week, at least an hour away, between 8am and 7pm", () => {
  const now = new Date("2026-10-12T09:00:00Z"); // Monday 10am Lagos
  const days = sp.customPickupDays(now);
  assert.equal(days.length, 7);
  assert.deepEqual(days.slice(0, 3).map((day) => day.label), ["Today", "Tomorrow", "Wednesday"]);
  const friday = sp.customSlot("2026-10-16", 14, now);
  assert.equal(friday.ok, true);
  assert.equal(friday.slot.start, "2026-10-16T13:00:00.000Z");
  assert.equal(sp.pickupWindowText(friday.slot.start, friday.slot.end, now), "Pick up 2–4pm Friday");
  assert.equal(sp.customSlot("2026-10-12", 10, now).ok, false, "too soon");
  assert.equal(sp.customSlot("2026-10-12", 18, now).ok, false, "ends after 7pm");
  assert.equal(sp.customSlot("2026-10-30", 10, now).ok, false, "more than a week out");
  assert.equal(sp.resolvePickupSlot({ key: "this_evening" }, now).slot.key, "this_evening");
  assert.equal(sp.resolvePickupSlot({ key: "this_evening" }, new Date("2026-10-12T17:30:00Z")).ok, false, "a slot that has passed");
  assert.equal(sp.windowWords("2026-10-12T08:00:00Z", "2026-10-12T11:00:00Z"), "9am–12pm");
});

// ─── The delivery job ─────────────────────────────────────────────────────────

test("job payload: pickup from the supplier, drop-off to the customer, the window, the shop's label, cash only for pay-when-it-arrives", () => {
  const window = { start: "2026-10-12T11:00:00Z", end: "2026-10-12T15:00:00Z" };
  const job = sp.buildPickupJob({
    kind: "dropship",
    ref: "DS-ABC123",
    shopName: "Ada's Closet",
    pickupAddress: "  Shop 12, Balogun Market, Lagos  ",
    dropoff: { name: "Tolu Bello", phone: "08031234567", lines: ["4 Admiralty Way", "Lekki, Lagos"] },
    items: [{ name: "Leather bag", quantity: 2 }, { name: "Belt", quantity: 1 }],
    collect: 26000,
    window,
    deliveryFee: 2500,
    retailOrderId: "ord_1",
  });
  assert.equal(job.pickupLocation, "Shop 12, Balogun Market, Lagos");
  assert.equal(job.destination, "Tolu Bello, 4 Admiralty Way, Lekki, Lagos");
  assert.equal(job.packageDetails.label, "Ada's Closet");
  assert.equal(job.packageDetails.description, "Parcel for Ada's Closet: 2 × Leather bag, 1 × Belt");
  assert.equal(job.packageDetails.units, 3);
  assert.equal(job.codAmount, 26000);
  assert.equal(job.deliveryFee, 2500);
  assert.equal(job.orderId, "ord_1", "keeps the shop's order in step with the rider");
  assert.equal(job.pickupWindowStart.toISOString(), "2026-10-12T11:00:00.000Z");
  assert.equal(job.pickupWindowEnd.toISOString(), "2026-10-12T15:00:00.000Z");
  assert.doesNotMatch(job.packageDetails.description + job.notes, /dropship|white label/i, "riders read plain words");

  const prepaid = sp.buildPickupJob({ kind: "wholesale", ref: "PO-1", shopName: "Ada's Closet", pickupAddress: "Aba", dropoff: { name: "Ada's Closet", lines: ["12 Road, Ikeja"] }, items: [{ name: "Sneakers", quantity: 50 }], collect: 0, window, deliveryFee: 3000, retailOrderId: "ignored" });
  assert.equal(prepaid.codAmount, null, "nothing to collect when paid");
  assert.equal(prepaid.orderId, null, "bulk orders have no shop order");
});

test("delivery company: the shop's choice, else the platform default, else the most reliable one covering the area; none = admin", () => {
  const partners = [
    { id: "p-lagos", city: "Lagos", coverageZones: ["Ikeja", "Lekki"], status: "active", verificationStatus: "verified", reliabilityScore: 70, rating: 4.1 },
    { id: "p-best", city: "Lagos", coverageZones: [], status: "active", verificationStatus: "verified", reliabilityScore: 95, rating: 4.8 },
    { id: "p-paused", city: "Lagos", coverageZones: [], status: "paused", verificationStatus: "verified", reliabilityScore: 99 },
    { id: "p-abuja", city: "Abuja", coverageZones: ["Wuse"], status: "active", verificationStatus: "verified", reliabilityScore: 90 },
  ];
  const area = { city: "Lagos" };
  assert.deepEqual(sp.choosePickupPartner({ preferredId: "p-lagos", defaultId: "p-best", partners, area }), { id: "p-lagos", why: "shop" });
  assert.deepEqual(sp.choosePickupPartner({ preferredId: "p-abuja", defaultId: "p-lagos", partners, area }), { id: "p-lagos", why: "default" }, "the shop's choice doesn't cover the area");
  assert.deepEqual(sp.choosePickupPartner({ preferredId: "p-paused", partners, area }), { id: "p-best", why: "best" }, "paused companies aren't taking jobs");
  assert.deepEqual(sp.choosePickupPartner({ partners, area: { city: "Wuse" } }), { id: "p-abuja", why: "best" }, "coverage areas count");
  assert.equal(sp.choosePickupPartner({ partners, area: { city: "Kano" } }), null);
});

test("the supplier can move or cancel the pickup only until a rider has the job", () => {
  assert.equal(sp.pickupChangeable({ status: "booked" }, { status: "pending", riderId: null }), true);
  assert.equal(sp.pickupChangeable({ status: "booked" }, { status: "confirmed", riderId: null }), true);
  assert.equal(sp.pickupChangeable({ status: "booked" }, { status: "confirmed", riderId: "r1" }), false);
  assert.equal(sp.pickupChangeable({ status: "booked" }, { status: "picked_up", riderId: "r1" }), false);
  assert.equal(sp.pickupChangeable({ status: "finding_rider" }, null), true);
  assert.equal(sp.pickupChangeable({ status: "cancelled" }, null), false);
  const now = new Date("2026-10-12T09:00:00Z");
  const booked = sp.pickupMessage({ status: "booked", windowStart: "2026-10-12T11:00:00Z", windowEnd: "2026-10-12T15:00:00Z" }, { status: "pending" }, now);
  assert.equal(booked.title, "Rider booked: pick up 12–4pm today");
  assert.equal(booked.body, "We'll message you when they're on the way.");
  assert.equal(sp.pickupMessage({ status: "finding_rider", windowStart: "2026-10-12T11:00:00Z", windowEnd: "2026-10-12T15:00:00Z" }, null, now).title, "We'll find a rider and message you");
});

// ─── Wiring ───────────────────────────────────────────────────────────────────

test("wiring: deadlines on new orders, a protected cron, conditional expiry, stock released once, jobs follow the rider", () => {
  const service = read("src/lib/supplier-orders/service.server.ts");
  assert.match(service, /acceptBy: \(deadlines\.get\(group\.supplierId\)/);
  assert.match(read("src/lib/supplier-orders/wholesale.server.ts"), /acceptBy: deadline\.acceptBy/);

  const cron = read("src/app/api/cron/supplier-acceptance/route.ts");
  assert.match(cron, /cronAuthorization\(req\.headers\.get\("authorization"\), secret\)/);
  assert.match(cron, /CRON_SECRET is not set/);

  const acceptance = read("src/lib/supplier-orders/acceptance.server.ts");
  assert.match(acceptance, /supplierOrder\.updateMany\(\{ where: expiryGuard\(row\.id, now\)/);
  assert.match(acceptance, /wholesaleOrder\.updateMany\(\{ where: expiryGuard\(row\.id, now\)/);
  assert.match(acceptance, /releaseWholesaleStock\(tx, row\.id\)/, "bulk orders use the existing guarded release");
  assert.match(acceptance, /stockReleasedAt: null \}, data: \{ stockReleasedAt: now \}/, "a supplier order gives its stock back once");
  assert.match(acceptance, /FOR UPDATE/);
  assert.match(acceptance, /Find another supplier, or cancel and refund the customer/);
  assert.match(read("src/lib/commerce/order-expiry.server.ts"), /const fresh = legacy \? null : await tx\.retailOrder\.findUnique/, "cancelling later releases only what is left");

  const jobs = read("src/lib/logistics/jobs.ts");
  assert.match(jobs, /onDeliveryJobMoved\(job\.id, input\.to\)/);
  assert.match(jobs, /onDeliveryRiderAssigned\(job\.id, input\.riderId\)/);
  assert.match(read("src/lib/logistics/booking.server.ts"), /emitPartnerEvent\(booking\.logisticsPartnerId, "job\.offered"/);
  assert.match(read("src/lib/logistics/partner-api-core.ts"), /pickupWindow: job\.pickupWindowStart && job\.pickupWindowEnd/);

  const pickupRoute = read("src/app/api/supplier/orders/[id]/pickup/route.ts");
  assert.match(pickupRoute, /withSupplier\(/);

  const migration = read("docs/migrations/2026-10-18-supplier-acceptance-pickup.sql");
  assert.match(migration, /ALTER TABLE "SupplierPickup" ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS "acceptBy"/);
  assert.match(migration, /-- select cron\.schedule\(\n--   'supplier-acceptance',\n--   '\*\/5 \* \* \* \*'/);
  assert.match(migration, /https:\/\/shopinbos-app\.vercel\.app\/api\/cron\/supplier-acceptance/);
  assert.match(migration, /name = 'cron_secret'/);
});

test("screens: countdown on new orders (web and mobile), the pickup question with big choices, words suppliers understand", () => {
  const list = read("src/app/supplier/orders/page.tsx");
  assert.match(list, /<AcceptCountdown acceptBy=\{order\.acceptBy\} \/>/);
  const page = read("src/app/supplier/orders/[id]/page.tsx");
  assert.match(page, /<AcceptCountdown acceptBy=\{view\.acceptBy\} big \/>/);
  const booking = read("src/components/supplier/PickupBooking.tsx");
  assert.match(booking, /When can a rider pick it up\?/);
  assert.match(booking, /Pick a time/);
  const mobile = read("apps/mobile/src/app/supplier/order/[id].tsx");
  assert.ok(mobile.includes("<AcceptCountdown acceptBy={data.acceptBy} big />"));
  // The phone screen's words are in the app-language catalog (m_supplier "order.*").
  const mobileWords = read("shared/i18n/messages/m_supplier/en.ts");
  for (const [key, words] of [["order.whenPickup", "When can a rider pick it up?"], ["order.book", "Book the rider"], ["order.changeTime", "Change the time"], ["order.cancelPickup", "Cancel pickup"], ["order.packed", "I've packed it"]]) {
    assert.ok(mobile.includes(`t("${key}")`), key);
    assert.ok(mobileWords.includes(`"${key}": "${words}"`), words);
  }
  assert.match(read("apps/mobile/src/app/supplier/(tabs)/orders.tsx"), /<AcceptCountdown acceptBy=\{order\.acceptBy\} \/>/);
  // The new-order notification names the order type and the deadline.
  assert.match(read("src/lib/supplier-orders/service.server.ts"), /title: `New dropship order \$\{ref\} from \$\{shop\}: accept within \$\{within\}`/);
});
