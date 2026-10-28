// Riders app on the phone: pickup codes, skipping a job, this week's earnings (src/lib/logistics/job-rules.ts) and
// the app's own pure helpers (apps/mobile/src/lib/rider-pure.ts), plus the routes and screens that use them.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const rules = await import("../src/lib/logistics/job-rules.ts");
const pure = await import("../apps/mobile/src/lib/rider-pure.ts");
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const exists = (path) => existsSync(new URL(`../${path}`, import.meta.url));

test("pickup codes: 4 digits, never the delivery code, and only checked when the job has one", () => {
  assert.match(rules.makePickupCode("1234"), /^\d{4}$/);
  // A random source stuck on the delivery code still gives a different code.
  assert.equal(rules.makePickupCode("1234", () => 0.1234), "1235");
  assert.equal(rules.makePickupCode("9999", () => 0.9999), "0000");
  let calls = 0;
  const values = [0.5, 0.0042];
  assert.equal(rules.makePickupCode("5000", () => values[calls++]), "0042");

  assert.equal(rules.pickupCodeCheck({ pickupCode: null }, ""), "none", "older jobs without a code don't block the pickup");
  assert.equal(rules.pickupCodeCheck({ pickupCode: "4821" }, " 4821 "), "ok");
  assert.equal(rules.pickupCodeCheck({ pickupCode: "4821" }, "4822"), "wrong");
  assert.equal(rules.pickupCodeCheck({ pickupCode: "4821" }, undefined), "wrong");
});

test("riders can skip a job only until they pick it up", () => {
  assert.equal(rules.riderCanSkip({ status: "confirmed" }), true);
  for (const status of ["picked_up", "in_transit", "out_for_delivery", "delivered", "failed", "cancelled", "pending"]) {
    assert.equal(rules.riderCanSkip({ status }), false, status);
  }
});

test("the earnings week starts Monday 00:00 in Lagos", () => {
  // Tuesday 20 Oct 2026, 10:00 Lagos → Monday 19 Oct 00:00 Lagos = Sunday 18 Oct 23:00 UTC.
  assert.equal(rules.riderWeekStart(new Date("2026-10-20T09:00:00Z")).toISOString(), "2026-10-18T23:00:00.000Z");
  // Monday 00:30 Lagos is already the new week.
  assert.equal(rules.riderWeekStart(new Date("2026-10-18T23:30:00Z")).toISOString(), "2026-10-18T23:00:00.000Z");
  // Sunday 23:30 Lagos still belongs to the week that began the Monday before.
  assert.equal(rules.riderWeekStart(new Date("2026-10-18T22:30:00Z")).toISOString(), "2026-10-11T23:00:00.000Z");
  // Across a month end.
  assert.equal(rules.riderWeekStart(new Date("2026-11-01T12:00:00Z")).toISOString(), "2026-10-25T23:00:00.000Z");
});

test("the app focuses the parcel in hand, then the next one waiting", () => {
  const runs = [
    { pickupName: "Glow by Amaka", pickupArea: "Yaba", drops: [{ id: "a", status: "confirmed", area: "Lekki Phase 1, Lagos", areaShort: "Lekki", hasPickupCode: true }, { id: "b", status: "confirmed", area: "Ikoyi", hasPickupCode: false }] },
    { pickupName: "Mama Nkechi", pickupArea: null, drops: [{ id: "c", status: "out_for_delivery", area: "Surulere" }] },
  ];
  assert.equal(pure.riderFocus(runs)?.drop.id, "c");
  assert.equal(pure.riderFocus(runs, "b")?.drop.id, "b");
  assert.equal(pure.riderFocus([]), null);
  assert.equal(pure.waitingOffer(runs)?.drop.id, "a");
  // "Take this job" on this phone: no longer new, and it's the job in hand once nothing is being carried.
  assert.equal(pure.waitingOffer(runs, ["a"])?.drop.id, "b");
  assert.equal(pure.activeJob(runs, ["a"])?.drop.id, "c", "a parcel being carried comes first");
  assert.equal(pure.activeJob([runs[0]], ["a"])?.drop.id, "a");
  assert.equal(pure.activeJob([runs[0]]), null);
  assert.equal(pure.isCarrying("out_for_delivery"), true);
  assert.equal(pure.isCarrying("confirmed"), false);

  // One pickup moves the coded parcel plus the run's waiting parcels that have no code.
  assert.deepEqual(pure.pickupJobIds(runs[0], "a"), ["a", "b"]);
  assert.deepEqual(pure.pickupJobIds({ ...runs[0], drops: runs[0].drops.map((drop) => ({ ...drop, hasPickupCode: true })) }, "a"), ["a"]);

  assert.equal(pure.routeLine(runs[0], runs[0].drops[0]), "Yaba → Lekki");
  assert.equal(pure.routeLine(runs[1], runs[1].drops[0]), "Mama Nkechi → Surulere");
  assert.equal(pure.initials("Tobi Adeyemi"), "TA");
  assert.equal(pure.initials("  "), "R");
  assert.equal(pure.firstName("Tobi Adeyemi"), "Tobi");
});

test("this week's deliveries group under Today, Yesterday and Earlier, in Lagos time", () => {
  const now = new Date("2026-10-21T09:00:00Z"); // Wednesday 10:00 Lagos
  const groups = pure.groupByDay(
    [
      { id: "1", deliveredAt: "2026-10-19T08:00:00Z" },
      { id: "2", deliveredAt: "2026-10-21T08:15:00Z" },
      { id: "3", deliveredAt: "2026-10-20T23:30:00Z" }, // 00:30 Wednesday in Lagos
      { id: "4", deliveredAt: "2026-10-20T12:00:00Z" },
    ],
    now,
  );
  assert.deepEqual(groups.map((group) => [group.group, group.items.map((item) => item.id)]), [["today", ["2", "3"]], ["yesterday", ["4"]], ["earlier", ["1"]]]);
  assert.equal(pure.lagosTime("2026-10-21T08:15:00Z"), "09:15");
  assert.deepEqual(pure.groupByDay([], now), []);
});

test("Riders app Earnings: deliveries by day, Monday to Sunday in Lagos time, worked out on the phone", () => {
  const now = new Date("2026-10-21T10:00:00Z"); // Wednesday
  const bars = pure.weekBars(
    [
      { deliveredAt: "2026-10-19T08:00:00Z" }, // Monday
      { deliveredAt: "2026-10-18T23:30:00Z" }, // 00:30 Monday in Lagos
      { deliveredAt: "2026-10-21T08:15:00Z" },
      { deliveredAt: "2026-10-20T23:30:00Z" }, // 00:30 Wednesday in Lagos
      { deliveredAt: "2026-10-12T12:00:00Z" }, // last week: left out
    ],
    now,
  );
  assert.deepEqual(bars, { counts: [2, 0, 2, 0, 0, 0, 0], today: 2 });
  assert.equal(pure.weekBars([], new Date("2026-10-25T22:30:00Z")).today, 6, "Sunday night in Lagos");
  assert.equal(pure.weekBars([], new Date("2026-10-25T23:30:00Z")).today, 0, "already Monday in Lagos");
});

test("Riders app map: a region that shows every pin, and only the rider's own phone knows where they are", () => {
  assert.equal(pure.regionFor([null, undefined]), null);
  const one = pure.regionFor([{ lat: 6.5, lng: 3.4 }]);
  assert.equal(one.latitude, 6.5);
  assert.ok(one.latitudeDelta > 0);
  const two = pure.regionFor([{ lat: 6.5, lng: 3.3 }, null, { lat: 6.6, lng: 3.5 }]);
  assert.ok(Math.abs(two.latitude - 6.55) < 1e-9 && Math.abs(two.longitude - 3.4) < 1e-9);
  assert.ok(two.latitudeDelta > 0.1 && two.longitudeDelta > 0.2, "room around both pins");
  // The route sends pickup and drop-off pins and the order number, never the rider's stored spot.
  const route = read("src/app/api/mobile/logistics/rider/route.ts");
  assert.match(route, /orderNumber: order\?\.orderNumber \?\? null/);
  assert.match(route, /dropLat: job\.id === mapJob\?\.id/);
  const payload = route.slice(route.indexOf("return ok({"), route.indexOf("const Body"));
  assert.doesNotMatch(payload, /lastLat|lastLng/);
  // The map is MapLibre with OpenStreetMap tiles on both platforms: no Google Maps key; Expo Go (no MapLibre
  // inside) and a job with no points fall back to the plain panel; the OpenStreetMap credit is on the map.
  const config = read("apps/mobile/app.config.js");
  assert.match(config, /"@maplibre\/maplibre-react-native"/);
  assert.doesNotMatch(config, /GOOGLE_MAPS_ANDROID_API_KEY|react-native-maps/);
  const map = read("apps/mobile/src/components/RiderMap.native.tsx");
  assert.match(map, /if \(!MapLibre \|\| !region\) return <MapBox/);
  assert.match(map, /ExecutionEnvironment\.StoreClient/);
  assert.match(map, /© OpenStreetMap/);
  assert.doesNotMatch(map, /react-native-maps/);
});

test("rider routes: pickup codes are made on accept, checked at pickup, and shown to the business handing over", () => {
  const jobs = read("src/lib/logistics/jobs.ts");
  assert.match(jobs, /input\.to === "confirmed" && !job\.pickupCode\) data\.pickupCode = makePickupCode/);
  assert.match(jobs, /export async function ensurePickupCode/);
  const actions = read("src/app/rider/[token]/actions.ts");
  assert.match(actions, /rateLimitKey\("rider:pickup-code", job\.id\), \{[^}]*failClosed: true/);
  assert.match(actions, /pickupCodeCheck\(job, codes\[job\.id\]\) === "wrong"/);
  const route = read("src/app/api/mobile/logistics/rider/route.ts");
  for (const action of ["skip", "help", "check_code", "language"]) assert.match(route, new RegExp(`z\\.literal\\("${action}"\\)`), action);
  assert.match(route, /startRun\(token, input\.jobIds, input\.codes \?\? null, \{ requirePhotos: true \}\)/, "the phone app needs the sealed-parcel photo at pickup");
  assert.match(route, /hasPickupCode: Boolean\(job\.pickupCode\)/);
  assert.doesNotMatch(route, /pickupCode: job\.pickupCode/, "the rider never receives the pickup code itself");
  assert.match(route, /riderWeek\(rider\)/);
  assert.match(read("src/app/api/mobile/delivery/orders/[orderId]/route.ts"), /pickupCode: pickupCodes\.get\(job\.id\) \?\? null/);
  assert.match(read("src/lib/supplier-orders/pickup.server.ts"), /pickupCode: job \? await ensurePickupCode\(job\)/);
  assert.match(read("src/app/api/mobile/logistics/riders/route.ts"), /plate: plate \?\? null/);

  const server = read("src/lib/logistics/rider-app.server.ts");
  assert.match(server, /rateLimitKey\("rider:code", jobId\)/, "checking the customer's code shares the delivered guess limit");
  assert.match(server, /status: "confirmed" \}, data: \{ riderId: null \}/, "skip only unassigns a job that is still waiting");

  const sql = read("docs/migrations/2026-11-16-rider-app.sql");
  for (const column of ['"DeliveryBooking" ADD COLUMN IF NOT EXISTS "pickupCode"', '"LogisticsTeamMember" ADD COLUMN IF NOT EXISTS "plate"', '"LogisticsTeamMember" ADD COLUMN IF NOT EXISTS "language"']) assert.ok(sql.includes(column), column);
  const schema = read("prisma/schema.prisma");
  assert.match(schema, /pickupCode\s+String\?/);
  assert.match(schema, /plate\s+String\?/);
});

test("rider app: three tabs, first-run welcome and language, and every step of a job", () => {
  for (const file of ["(tabs)/_layout.tsx", "(tabs)/index.tsx", "(tabs)/earnings.tsx", "(tabs)/me.tsx", "welcome.tsx", "language.tsx", "job.tsx", "link.tsx", "sign-in.tsx", "[token].tsx", "drop/[id].tsx"]) {
    assert.ok(exists(`apps/mobile/src/app/rider/${file}`), file);
  }
  const layout = read("apps/mobile/src/app/rider/(tabs)/_layout.tsx");
  assert.match(layout, /AppTabBar/);
  assert.match(layout, /tint=\{colors\.mintTint\}/);
  const job = read("apps/mobile/src/app/rider/job.tsx");
  for (const call of ['action: "check_code"', 'action: "help"', 'action: "failed"', 'codes: { [drop.id]: code }', "uploadRiderProof", "<Keypad"]) assert.ok(job.includes(call), call);
  const words = read("shared/i18n/messages/m_rider/en.ts");
  for (const line of ["Take this job", "Skip", "I’m there, enter code", "Got the parcel", "I’ve got the money", "Parcel handed over", "Back to today", "Which language?"]) {
    assert.ok(words.includes(line.replace(/’/g, "'")), line);
  }
});
