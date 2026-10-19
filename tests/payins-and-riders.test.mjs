// Delivery partners' pay-in accounts (Paystack Dedicated Virtual Accounts) and rider locations:
//   - matching a pay-in to the partner's unpaid cash jobs (exact, over, under, a replayed reference);
//   - haversine distance and the rider picker order (free → busy → offline; fresh locations closest first);
//   - the geocode cache key and the area fallback;
//   - plain distance words ("1.2 km away", "about 5 min", "last seen 2 min ago, Ikeja").
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const rules = await import("../src/lib/logistics/payin-rules.ts");
const geo = await import("../shared/delivery-geo.ts");
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const jobs = [
  { id: "a", codCollected: 5000 },
  { id: "b", codCollected: 3000 },
  { id: "c", codCollected: 2000 },
];

test("an exact pay-in settles every job and leaves nothing", () => {
  const result = rules.applyPayIn(jobs, 10000);
  assert.deepEqual(result.ids, ["a", "b", "c"]);
  assert.equal(result.covered, 10000);
  assert.equal(result.creditAfter, 0);
  assert.equal(result.stillDue, 0);
  assert.equal(result.outcome, "exact");
});

test("an overpayment settles everything and keeps the rest as credit", () => {
  const result = rules.applyPayIn(jobs, 12500);
  assert.deepEqual(result.ids, ["a", "b", "c"]);
  assert.equal(result.creditAfter, 2500);
  assert.equal(result.stillDue, 0);
  assert.equal(result.outcome, "over");
});

test("an underpayment settles whole jobs oldest first and leaves the rest due", () => {
  const result = rules.applyPayIn(jobs, 6000);
  assert.deepEqual(result.ids, ["a"]);
  assert.equal(result.covered, 5000);
  assert.equal(result.creditAfter, 1000, "the part that can't settle job b waits as credit");
  assert.equal(result.stillDue, 4000, "8000 left on b and c, minus the 1000 credit");
  assert.equal(result.outcome, "under");
  // The next pay-in uses the credit: 2000 + 1000 settles job b exactly.
  const next = rules.applyPayIn(jobs.slice(1), 2000, result.creditAfter);
  assert.deepEqual(next.ids, ["b"]);
  assert.equal(next.creditAfter, 0);
  assert.equal(next.stillDue, 2000);
});

test("a pay-in smaller than the oldest job settles nothing but is kept", () => {
  const result = rules.applyPayIn(jobs, 4000);
  assert.deepEqual(result.ids, []);
  assert.equal(result.creditAfter, 4000);
  assert.equal(result.stillDue, 6000);
  assert.equal(rules.owedAfterCredit(10000, 4000), 6000);
  assert.equal(rules.owedAfterCredit(1000, 4000), 0);
});

test("a pay-in with no cash owed becomes credit", () => {
  const result = rules.applyPayIn([], 3000, 500);
  assert.equal(result.creditAfter, 3500);
  assert.equal(result.outcome, "over");
});

const dvaCharge = {
  id: 3021,
  domain: "test",
  status: "success",
  reference: "1234567890abcdef",
  amount: 1050000,
  channel: "dedicated_nuban",
  currency: "NGN",
  paid_at: "2026-10-12T14:05:00.000Z",
  metadata: { receiver_account_number: "1234567890", receiver_bank: "Test Bank" },
  authorization: {
    channel: "dedicated_nuban",
    receiver_bank_account_number: "1234567890",
    receiver_bank: "Test Bank",
    sender_bank: "Kuda Bank",
    sender_name: "SWIFT DISPATCH LTD",
    account_name: null,
  },
  customer: { id: 1, customer_code: "CUS_test123", email: "owner@swift.ng" },
};

test("a dedicated-account charge is read in naira with the receiving account", () => {
  assert.equal(rules.isDedicatedCharge(dvaCharge), true);
  assert.equal(rules.isDedicatedCharge({ channel: "card", reference: "order-1" }), false);
  const charge = rules.readDedicatedCharge(dvaCharge);
  assert.equal(charge.reference, "1234567890abcdef");
  assert.equal(charge.amount, 10500);
  assert.equal(charge.accountNumber, "1234567890");
  assert.equal(charge.customerCode, "CUS_test123");
  assert.equal(charge.senderName, "SWIFT DISPATCH LTD");
  assert.equal(charge.paidAt.toISOString(), "2026-10-12T14:05:00.000Z");
  assert.equal(rules.readDedicatedCharge({ ...dvaCharge, status: "failed" }), null);
  assert.equal(rules.readDedicatedCharge({ ...dvaCharge, amount: 0 }), null);
  // Older payloads only carry the account in metadata.
  const metaOnly = rules.readDedicatedCharge({ ...dvaCharge, authorization: { channel: "dedicated_nuban" } });
  assert.equal(metaOnly.accountNumber, "1234567890");
});

test("a replayed webhook can't count twice: the reference is the key and is unique in the database", () => {
  const first = rules.readDedicatedCharge(dvaCharge);
  const replay = rules.readDedicatedCharge(JSON.parse(JSON.stringify(dvaCharge)));
  assert.equal(first.reference, replay.reference);
  const schema = read("prisma/schema.prisma");
  const model = schema.slice(schema.indexOf("model PartnerPayIn {"), schema.indexOf("}", schema.indexOf("model PartnerPayIn {")));
  assert.match(model, /reference\s+String\s+@unique/);
  const sql = read("docs/migrations/2026-10-18-payins-rider-location.sql");
  assert.match(sql, /CREATE UNIQUE INDEX IF NOT EXISTS "PartnerPayIn_reference_key"/);
  const server = read("src/lib/logistics/payins.server.ts");
  assert.match(server, /findUnique\(\{ where: \{ reference: charge\.reference \}/, "checks the reference before settling");
  assert.match(server, /isUniqueViolation\(error\)\) return "duplicate"/, "a race on the same reference is a duplicate, not an error");
});

test("the assigned account is read from the webhook and from the create response", () => {
  const event = { customer: { id: 7, customer_code: "CUS_x" }, dedicated_account: { id: 9, account_number: "9930000001", account_name: "SHOPINBOS/SWIFT DISPATCH", bank: { name: "Test Bank", slug: "test-bank" } } };
  const fromEvent = rules.readDedicatedAccount(event);
  assert.equal(fromEvent.customerCode, "CUS_x");
  assert.equal(fromEvent.accountNumber, "9930000001");
  assert.equal(fromEvent.bankName, "Test Bank");
  const created = rules.readDedicatedAccount({ id: 9, account_number: "9930000001", account_name: "A", bank: { name: "Wema Bank", slug: "wema-bank" }, customer: { id: 7, customer_code: "CUS_x" } });
  assert.equal(created.customerCode, "CUS_x");
  assert.equal(created.bankSlug, "wema-bank");
});

test("cash is due by 6pm Lagos time on the day it was collected", () => {
  // 10:00 Lagos (09:00 UTC) → 6pm today.
  const morning = new Date("2026-10-12T09:00:00Z");
  assert.equal(rules.payInDeadline(morning).toISOString(), "2026-10-12T17:00:00.000Z");
  assert.equal(rules.payInDue(morning, morning).words, "by 6pm today");
  // Collected at 19:00 Lagos → due 6pm tomorrow.
  const evening = new Date("2026-10-12T18:00:00Z");
  assert.equal(rules.payInDue(evening, evening).words, "by 6pm tomorrow");
  // Collected yesterday morning, still unpaid → late.
  const late = rules.payInDue(new Date("2026-10-11T09:00:00Z"), morning);
  assert.equal(late.late, true);
  assert.equal(late.words, "now");
});

test("haversine distance is right for known points", () => {
  assert.equal(geo.haversineMeters({ lat: 6.6018, lng: 3.3515 }, { lat: 6.6018, lng: 3.3515 }), 0);
  // One degree of latitude ≈ 111.2 km.
  const degree = geo.haversineMeters({ lat: 0, lng: 0 }, { lat: 1, lng: 0 });
  assert.ok(Math.abs(degree - 111_195) < 50, `got ${degree}`);
  // Ikeja → Victoria Island is about 20 km in a straight line.
  const ikejaToVi = geo.haversineMeters({ lat: 6.6018, lng: 3.3515 }, { lat: 6.4281, lng: 3.4219 });
  assert.ok(ikejaToVi > 19_000 && ikejaToVi < 22_000, `got ${ikejaToVi}`);
});

test("distances and times are in plain words", () => {
  assert.equal(geo.distanceWords(450), "450 m away");
  assert.equal(geo.distanceWords(4), "10 m away");
  assert.equal(geo.distanceWords(1200), "1.2 km away");
  assert.equal(geo.distanceWords(2000), "2 km away");
  assert.equal(geo.distanceWords(14_400), "14 km away");
  assert.equal(geo.etaWords(1200), "about 5 min");
  assert.equal(geo.etaWords(100), "about 1 min");
  assert.equal(geo.etaWords(20_000), "about 1 hr 20 min");
  const now = new Date("2026-10-12T12:00:00Z");
  assert.equal(geo.lastSeenWords(new Date("2026-10-12T11:58:00Z"), now), "2 min ago");
  assert.equal(geo.lastSeenWords(new Date("2026-10-12T11:59:40Z"), now), "just now");
  assert.equal(geo.lastSeenWords(new Date("2026-10-12T09:00:00Z"), now), "3 hr ago");
  assert.equal(geo.lastSeenWords(null, now), "not seen yet");
  assert.equal(geo.riderWhereWords({ lat: 6.6, lng: 3.35, locationAt: new Date("2026-10-12T11:58:00Z") }, now), "last seen 2 min ago, Ikeja");
  assert.equal(geo.riderWhereWords({ lat: null, lng: null, lastSeenAt: new Date("2026-10-12T11:55:00Z") }, now), "last seen 5 min ago");
});

test("the rider picker: free before busy before offline, fresh locations closest first", () => {
  const now = new Date("2026-10-12T12:00:00Z");
  const seen = new Date("2026-10-12T11:59:00Z");
  const fresh = new Date("2026-10-12T11:57:00Z");
  const stale = new Date("2026-10-12T11:30:00Z");
  const pickup = { lat: 6.6018, lng: 3.3515 }; // Ikeja
  const riders = [
    { id: "offline-near", name: "Ola", online: false, lastSeenAt: stale, openJobs: 0, lat: 6.602, lng: 3.352, locationAt: stale },
    { id: "busy-near", name: "Bisi", online: true, lastSeenAt: seen, openJobs: 1, lat: 6.6019, lng: 3.3516, locationAt: fresh },
    { id: "free-far", name: "Chidi", online: true, lastSeenAt: seen, openJobs: 0, lat: 6.4281, lng: 3.4219, locationAt: fresh },
    { id: "free-near", name: "Ada", online: true, lastSeenAt: seen, openJobs: 0, lat: 6.6, lng: 3.355, locationAt: fresh },
    { id: "free-stale-near", name: "Dayo", online: true, lastSeenAt: seen, openJobs: 0, lat: 6.6018, lng: 3.3515, locationAt: stale },
    { id: "free-unknown", name: "Emeka", online: true, lastSeenAt: seen, openJobs: 0, lat: null, lng: null, locationAt: null },
  ];
  const ranked = geo.rankRidersForPickup(riders, pickup, now);
  assert.deepEqual(ranked.map((row) => row.rider.id), ["free-near", "free-far", "free-stale-near", "free-unknown", "busy-near", "offline-near"]);
  assert.equal(ranked[0].fresh, true);
  assert.match(ranked[0].distanceText, /^\d+ m away · about \d+ min$/);
  assert.equal(ranked[2].fresh, false, "a 30-minute-old location goes after fresh ones");
  assert.equal(ranked[3].distanceText, "");
  // Without pickup coordinates the order still follows free → busy → offline.
  const noPickup = geo.rankRidersForPickup(riders, null, now);
  assert.deepEqual(noPickup.map((row) => row.group), [0, 0, 0, 0, 1, 2]);
});

test("the Riders app reports every minute or after 100 m", () => {
  const start = { lat: 6.6018, lng: 3.3515, at: 0 };
  assert.equal(geo.shouldReportLocation(null, start), true);
  assert.equal(geo.shouldReportLocation(start, { ...start, at: 30_000 }), false);
  assert.equal(geo.shouldReportLocation(start, { ...start, at: 60_000 }), true);
  assert.equal(geo.shouldReportLocation(start, { lat: 6.6028, lng: 3.3515, at: 20_000 }), true, "about 111 m north");
  assert.equal(geo.shouldReportLocation(start, { lat: 6.6022, lng: 3.3515, at: 20_000 }), false, "about 44 m");
});

test("the geocode cache key is the country plus the address as lowercase words", () => {
  assert.equal(geo.geocodeCacheKey("12, Adéola Odeku St., Victoria Island, Lagos"), "ng:12 adeola odeku st victoria island lagos");
  assert.equal(geo.geocodeCacheKey("  12 ADEOLA odeku st victoria-island LAGOS "), "ng:12 adeola odeku st victoria island lagos");
  assert.equal(geo.geocodeCacheKey("Osu, Accra", "GH"), "gh:osu accra");
  assert.notEqual(geo.geocodeCacheKey("Ikeja"), geo.geocodeCacheKey("Ikeja", "gh"));
});

test("when no geocoder answers, the area named in the address is used", () => {
  assert.equal(geo.areaFromText("Shop 4, Computer Village, Ikeja, Lagos").name, "Ikeja");
  assert.equal(geo.areaFromText("Plot 5 Admiralty Way, Lekki Phase 1").name, "Lekki Phase 1");
  assert.equal(geo.areaFromText("23 Allen Avenue").name, "Ikeja");
  assert.equal(geo.areaFromText("Wuse 2, Abuja").name, "Wuse");
  assert.equal(geo.areaFromText("Somewhere unknown"), null);
  assert.equal(geo.nearestArea({ lat: 6.4281, lng: 3.4219 }), "Victoria Island");
  assert.equal(geo.nearestArea({ lat: 0, lng: 0 }), null);
});

test("geocoding uses Google with a key, else Nominatim with our User-Agent at 1 request a second, and a cache", () => {
  const source = read("src/lib/logistics/geocode.ts");
  assert.match(source, /GOOGLE_MAPS_API_KEY/);
  assert.match(source, /"Shopinbos\/1\.0 \(support@shopinbos\.com\)"/);
  assert.match(source, /"User-Agent": USER_AGENT/);
  assert.match(source, /NOMINATIM_GAP_MS = 1100/);
  assert.match(source, /checkRateLimitShared\("geocode:nominatim", \{ maxRequests: 1, windowMs: 1000/);
  assert.match(source, /db\.geocodeCache/);
  assert.match(source, /areaFallback/);
});

test("the Paystack webhook handles pay-in account events in their own branch", () => {
  const route = read("src/app/api/webhooks/paystack/route.ts");
  const branch = route.indexOf('isDedicatedCharge(event.data)');
  assert.ok(branch > 0 && branch < route.indexOf("Retail order payment"), "the pay-in branch runs before store checkouts");
  assert.match(route, /dedicatedaccount\.assign\./);
  assert.match(route, /handleDedicatedAccountCharge/);
  const dva = read("src/lib/logistics/paystack-dva.ts");
  assert.match(dva, /"\/customer"/);
  assert.match(dva, /"\/dedicated_account", \{ customer: customerCode, preferred_bank: dvaBank\(\) \}/);
  assert.match(dva, /PAYSTACK_DVA_BANK/);
  assert.match(dva, /"test-bank"/);
});

test("partner screens show the account with Copy and the automatic-matching line, without technical words", () => {
  const web = read("src/components/logistics/PayInAccountCard.tsx");
  const mobile = read("apps/mobile/src/app/logistics/(tabs)/earnings.tsx");
  // The web card reads its words from the app-language catalogs too (logistics, common).
  const logisticsWords = read("shared/i18n/messages/logistics/en.ts");
  assert.match(web, /t\("payin\.matchAuto"\)/);
  assert.match(web, /t\("copy"\)/);
  assert.match(logisticsWords, /"payin\.matchAuto": "We match your payment automatically\. It shows here within a few minutes\."/);
  // The phone screen reads its words from the app-language catalogs (m_partner, common).
  assert.match(mobile, /t\("money\.autoMatch"\)/);
  assert.match(mobile, /t\("copy"\)/);
  assert.match(read("shared/i18n/messages/m_partner/en.ts"), /"money\.autoMatch": "We match your payment automatically\. It shows here within a few minutes\."/);
  assert.match(read("shared/i18n/messages/common/en.ts"), /copy: "Copy"/);
  const cash = read("src/app/logistics/cash/page.tsx");
  // Cash on delivery goes to each seller (src/lib/logistics/seller-payins.server.ts), never to a Shopinbos account.
  assert.match(cash, /<PaySellerList rows=/, "the partner pays each seller, or hands the cash over");
  assert.doesNotMatch(cash, /recordCodRemittance/, "no pay-in to Shopinbos is recorded by hand");
  // What a partner can read: the source without imports and comments.
  const visible = (source) => source.replace(/^import .*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
  for (const source of [web, mobile, cash, logisticsWords]) {
    assert.doesNotMatch(visible(source), /dedicated|virtual account|DVA|Paystack|webhook|lastError/i);
  }
});

test("the Riders app asks for location in plain words and works without it", () => {
  const hook = read("apps/mobile/src/lib/rider-location.ts");
  const strings = read("shared/i18n/messages/m_rider/en.ts");
  assert.match(strings, /Shopinbos uses your location only while you're online, so we can give you jobs near you\./);
  assert.match(hook, /requestForegroundPermissionsAsync/);
  assert.doesNotMatch(hook, /requestBackgroundPermissionsAsync|startLocationUpdatesAsync/, "foreground only");
  assert.match(hook, /QUEUE_KEY/, "offline queue");
  assert.match(hook, /shouldReportLocation/);
  const app = read("apps/mobile/app.json");
  assert.match(app, /"expo-location"/);
  const route = read("src/lib/logistics/rider-location.ts");
  assert.match(route, /!member\.online && jobs\.length === 0/, "only while online or on a job");
  assert.match(route, /TRAIL_KEEP_MS = 7 \* 24 \* 60 \* 60 \* 1000/, "trails go 7 days after delivery");
});

test("shops and customers never get rider coordinates", () => {
  for (const path of ["src/app/api/app/logistics/bookings/route.ts", "src/app/api/public/logistics/partners/[slug]/route.ts"]) {
    assert.doesNotMatch(read(path), /lastLat|lastLng|RiderLocationPoint|riderLocationPoint/, path);
  }
});
