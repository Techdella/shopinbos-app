// Logistics tiers control reach, not cash (WP-1, shared/partner-reach.ts): tier computation and names, what each
// tier unlocks, interstate gated to Tier 2+, high-value parcels to Tier 3 only, the ranking boost, the featured
// application, "Earned this week · paid on <day>", and where the server, the admin and both apps use them.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

const reach = await import("../shared/partner-reach.ts");
const rules = await import("../shared/dropship-rules.ts");
const market = await import("../shared/delivery-market.ts");
const pure = await import("../apps/mobile/src/lib/partner-pure.ts");
const screens = await import("../shared/peggy-screens.ts");
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const now = new Date("2026-10-28T12:00:00Z"); // a Wednesday
const record = (over = {}) => ({ verified: true, delivered: 0, failed: 0, rating: 0, baseVerified: false, createdAt: "2026-10-01T00:00:00Z", cacOrGuarantor: false, now, ...over });

test("tiers: Tier 1 Verified, Tier 2 Trusted at 50 / 4.3 / <2% / base, Tier 3 Top partner at 150 / 60 days / CAC or guarantor", () => {
  assert.equal(rules.partnerLevel(record()), "verified");
  const trusted = record({ delivered: 50, rating: 4.3, failed: 1, baseVerified: true });
  assert.equal(rules.partnerLevel(trusted), "trusted", "1 failed of 51 is 1.96%, under 2%");
  assert.equal(rules.partnerLevel({ ...trusted, failed: 0 }), "trusted");
  assert.equal(rules.partnerLevel({ ...trusted, failed: 0, rating: 4.2 }), "verified");
  assert.equal(rules.partnerLevel({ ...trusted, failed: 0, baseVerified: false }), "verified");
  assert.equal(rules.partnerLevel({ ...trusted, failed: 2, delivered: 98 }), "verified", "2% failed is not under 2%");
  const top = record({ delivered: 150, rating: 4.8, baseVerified: true, createdAt: "2026-08-01T00:00:00Z", cacOrGuarantor: true });
  assert.equal(rules.partnerLevel(top), "cash_trusted");
  assert.equal(rules.partnerLevel({ ...top, cacOrGuarantor: false }), "trusted");
  assert.equal(rules.partnerLevel({ ...top, delivered: 149 }), "trusted");
  assert.equal(rules.partnerLevel({ ...top, lateRemittances: 3 }), "cash_trusted", "no cash condition on Tier 3");

  assert.deepEqual(rules.PARTNER_LEVEL_LABELS, { verified: "Verified", trusted: "Trusted", cash_trusted: "Top partner" });
  assert.equal(rules.partnerTierName("verified"), "Tier 1 · Verified");
  assert.equal(rules.partnerTierName("trusted"), "Tier 2 · Trusted");
  assert.equal(rules.partnerTierName("cash_trusted"), "Tier 3 · Top partner");
  assert.equal(rules.partnerTierName("nonsense"), "Tier 1 · Verified");
  assert.equal(rules.partnerLevelOf(null), "verified");
  // Pay on delivery: open from Tier 1; how it's paid, and any cash owed, is between the partner and each shop.
  assert.equal(rules.canOfferPayOnDeliveryRules({ level: "cash_trusted", codPaused: false }), true);
  assert.equal(rules.canOfferPayOnDeliveryRules({ level: "trusted" }), true);
  assert.equal(rules.canOfferPayOnDeliveryRules({ level: "verified", codPaused: true }), true);
});

test("perks: what each tier unlocks; faster payouts is a flag only (coming soon)", () => {
  assert.equal(reach.levelPerks("verified").prepaid, true);
  assert.equal(reach.levelPerks("verified").payOnDelivery, true);
  assert.equal(reach.canTakeInterstate("verified"), false);
  assert.equal(reach.canTakeInterstate("trusted"), true);
  assert.equal(reach.canTakeInterstate("cash_trusted"), true);
  assert.equal(reach.canTakeInterstate(undefined), false, "unknown is Tier 1");
  assert.equal(reach.canTakeHighValue("trusted"), false);
  assert.equal(reach.canTakeHighValue("cash_trusted"), true);
  assert.equal(reach.levelPerks("cash_trusted").fasterPayouts, true);
  assert.equal(reach.FASTER_PAYOUTS_LIVE, false);
  assert.deepEqual(reach.TIER_UNLOCKS.trusted, ["interstate", "ranking"]);
  for (const level of rules.PARTNER_LEVELS) for (const key of reach.TIER_UNLOCKS[level]) assert.ok(reach.UNLOCK_WORDS[key], key);
  // The phone's import-free copy matches.
  for (const level of rules.PARTNER_LEVELS) assert.deepEqual([...pure.tierUnlocks(level)], [...reach.TIER_UNLOCKS[level]], level);
  assert.deepEqual([...pure.LEVEL_KEYS], [...rules.PARTNER_LEVELS]);
  assert.equal(pure.levelIndex("cash_trusted"), 2);
  assert.equal(pure.levelIndex("x"), 0);
});

const row = (from, to, service, sizeBand, price, minDays = 1, maxDays = 2) => ({ from, to, service, sizeBand, price, minDays, maxDays });
const partner = (id, level, over = {}) => ({
  id,
  name: `Partner ${id}`,
  level,
  services: ["doorstep", "interstate"],
  pickupAreas: ["Lagos"],
  deliveryAreas: ["Nationwide"],
  offersPayOnDelivery: false,
  card: { id: `card-${id}`, rows: [row("Lagos", "Lagos", "doorstep", "small", 2500), row("Lagos", "FCT", "doorstep", "small", 6000, 2, 4)] },
  pickupPoints: [],
  ...over,
});
const connection = (id, level, over = {}) => ({ id: `c-${id}`, services: ["doorstep"], showPartnerName: true, label: null, ownerPod: false, partnerPod: false, partner: partner(id, level, over) });
const settings = { sellArea: "nationwide", sellStates: [], selfPickup: false, pickupAddress: null, pickupHours: null, pickupInstructions: null, fallback: "pickup_only", fallbackFee: 0 };
const lagos = { state: "Lagos", area: "Yaba" };

test("interstate: only Tier 2+ partners are quoted across a state line; local jobs still go to Tier 1", () => {
  const shipment = { key: "own", origin: lagos, sizeBand: "small" };
  const abuja = { state: "FCT", area: "Wuse" };
  assert.equal(market.quoteFor(connection("a", "verified"), shipment, abuja, "doorstep"), null, "Tier 1 with the switch on");
  assert.ok(market.quoteFor(connection("a", "trusted"), shipment, abuja, "doorstep"));
  assert.ok(market.quoteFor(connection("a", "cash_trusted"), shipment, abuja, "doorstep"));
  assert.equal(market.quoteFor(connection("a", "trusted", { services: ["doorstep"] }), shipment, abuja, "doorstep"), null, "still needs the switch");
  assert.ok(market.quoteFor(connection("a", "verified"), shipment, { state: "Lagos", area: "Ikeja" }, "doorstep"), "same state: Tier 1 is fine");
  const choice = market.buildMarketChoice({ settings, shipments: [{ ...shipment, connections: [connection("a", "verified"), connection("b", "trusted")] }], destination: abuja });
  assert.deepEqual(choice.options.map((option) => option.id), ["d:c-b"]);
  // Who still offers interstate below Trusted: it can't be switched on, the tier refresh takes it off, told once.
  const levels = read("src/lib/logistics/partner-levels.server.ts");
  assert.match(levels, /services\.filter\(\(service\) => service !== "interstate"\)[\s\S]{0,200}tellInterstateTakenOff\(/);
  const reachServer = read("src/lib/logistics/partner-reach.server.ts");
  assert.match(reachServer, /where: \{ id: partner\.id, interstateNoticeAt: null \}/, "told once");
  assert.match(reachServer, /export async function notifyInterstateGated[\s\S]{0,600}refreshPartnerLevel\(partner\.id\)/, "the cron takes it off too");
  assert.equal(reach.interstateGated({ services: ["interstate"], level: "verified", verificationStatus: "verified" }), true);
  assert.equal(reach.interstateGated({ services: ["interstate"], level: "trusted" }), false);
  assert.equal(reach.interstateGated({ services: ["doorstep"], level: "verified" }), false);
  assert.equal(reach.interstateGated({ services: ["interstate"], level: "verified", verificationStatus: "pending" }), false);
  assert.equal(pure.interstateWaiting({ services: ["interstate"], level: "verified" }), true);
  assert.equal(pure.interstateWaiting({ services: ["interstate"] }), false, "older servers: no level, no note");
});

test("high-value: over ₦150,000, or phones / laptops / jewellery (gold), with admin-editable rules", () => {
  const d = reach.DEFAULT_HIGH_VALUE_RULES;
  assert.equal(d.minOrderValue, 150_000);
  assert.equal(reach.highValueReason({ orderValue: 150_000, lines: [] }), null, "over, not at");
  assert.equal(reach.highValueReason({ orderValue: 150_001, lines: [] }), "value");
  assert.equal(reach.highValueReason({ orderValue: 20_000, lines: [{ productType: "phones", name: "Tecno Spark 20" }] }), "category");
  assert.equal(reach.highValueReason({ orderValue: 20_000, lines: [{ productType: "jewellery", name: "Bead set" }] }), "category");
  assert.equal(reach.highValueReason({ orderValue: 20_000, lines: [{ productType: null, name: "18k Gold necklace" }] }), "category", "type guessed from the name");
  assert.equal(reach.highValueReason({ orderValue: 20_000, lines: [{ productType: "electronics", name: "HP EliteBook Laptop 14" }] }), "category", "laptops by keyword");
  assert.equal(reach.highValueReason({ orderValue: 20_000, lines: [{ productType: "clothing", name: "Ankara gown" }] }), null);
  assert.equal(reach.isHighValueParcel({ orderValue: 0, lines: [{ name: "MacBook Air" }] }), true);

  const saved = reach.readHighValueRules({ minOrderValue: "₦250,000", productTypes: ["phones"], keywords: "camera, Drone" });
  assert.deepEqual(saved, { minOrderValue: 250_000, productTypes: ["phones"], keywords: ["camera", "drone"] });
  assert.equal(reach.highValueReason({ orderValue: 200_000, lines: [{ productType: "jewellery" }] }, saved), null, "jewellery taken off the list");
  assert.equal(reach.highValueReason({ orderValue: 1_000, lines: [{ name: "DJI drone" }] }, saved), "category");
  assert.deepEqual(reach.readHighValueRules(null), d, "defaults");
  assert.equal(reach.readHighValueRules({ minOrderValue: 5 }).minOrderValue, 1_000, "bounded");
  assert.equal(reach.HIGH_VALUE_KEY, "logistics.high_value");
});

test("high-value: only Top partners are offered, booked, reassigned or can accept those jobs", () => {
  const server = read("src/lib/delivery-market/market.server.ts");
  assert.match(server, /if \(options\.highValue && !canTakeHighValue\(partner\.level\)\) continue;/);
  assert.match(server, /marketConnectionsFor\(\[store\.userId, \.\.\.supplierUserIds\], \{ orderValue: orderValue \?\? 0, highValue \}\)/);
  assert.match(read("src/lib/delivery-market/jobs.server.ts"), /marketConnectionsFor\(\[sellerId\], \{ highValue: job\.highValue \}\)/);
  assert.match(read("src/lib/delivery-market/jobs.server.ts"), /highValue: await highValueOrder\(order\)/);
  const bookings = read("src/app/api/app/logistics/bookings/route.ts");
  assert.match(bookings, /if \(highValue && !canTakeHighValue\(partner\.level\)\) return apiError\("PARTNER_LIMIT", HIGH_VALUE_PARTNER_MESSAGE, 409\)/);
  assert.match(read("src/lib/logistics/jobs.ts"), /input\.to === "confirmed" && job\.highValue && !job\.acceptedAt/);
  assert.match(read("src/lib/supplier-orders/pickup.server.ts"), /\.\.\.\(highValue \? \{ level: "cash_trusted" \} : \{\}\)/);
  // The safety limits for new partners stay as they were, next to it.
  assert.match(bookings, /partnerJobLimitProblem\(partner\.id, order \? Number\(order\.total\) : 0\)/);
  assert.match(server, /partnersOverLimit\(/);
});

test("ranking: shops' rider lists and job matching boost by tier, featured first", () => {
  const base = { stats: { completed: 40, onTimeRate: 90, failedRate: 2 }, rating: 4.5, ratingCount: 30, match: 2, verified: true };
  const tier1 = market.rankScore({ ...base, level: "verified" });
  assert.equal(market.rankScore(base), tier1, "old callers unchanged");
  assert.equal(market.rankScore({ ...base, level: "trusted" }) - tier1, 15);
  assert.equal(market.rankScore({ ...base, level: "cash_trusted" }) - tier1, 25);
  assert.equal(market.rankScore({ ...base, level: "cash_trusted", featured: true }) - tier1, 45);
  assert.equal(reach.reachRankBoost({ level: "trusted", featured: false }), 15);
  // Checkout and job matching: the same price goes to the higher tier first.
  const shipment = { key: "own", origin: lagos, sizeBand: "small", connections: [connection("a", "verified"), connection("b", "cash_trusted"), connection("c", "trusted")] };
  const choice = market.buildMarketChoice({ settings, shipments: [shipment], destination: { state: "Lagos", area: "Ikeja" } });
  assert.deepEqual(choice.options.map((option) => option.id), ["d:c-b", "d:c-c", "d:c-a"]);
  const cheaper = market.buildMarketChoice({ settings, shipments: [{ ...shipment, connections: [connection("a", "verified", { card: { id: "x", rows: [row("Lagos", "Lagos", "doorstep", "small", 2000)] } }), connection("b", "cash_trusted")] }], destination: { state: "Lagos", area: "Ikeja" } });
  assert.equal(cheaper.options[0].id, "d:c-a", "price still comes first");
  const manage = read("src/lib/delivery-market/manage.server.ts");
  assert.match(manage, /level: partner\.level, featured \}\)/);
  assert.match(manage, /\.sort\(\(a, b\) => Number\(b\.featured\) - Number\(a\.featured\) \|\| b\.score - a\.score\)/);
});

test("featured: Top partners apply, the team approves; the badge needs Tier 3", () => {
  assert.equal(reach.featuredApplyProblem({ level: "trusted", featuredStatus: "none" }), "not_top");
  assert.equal(reach.featuredApplyProblem({ level: "cash_trusted", featuredStatus: "none" }), null);
  assert.equal(reach.featuredApplyProblem({ level: "cash_trusted", featuredStatus: "rejected" }), null, "may apply again");
  assert.equal(reach.featuredApplyProblem({ level: "cash_trusted", featuredStatus: "applied" }), "applied");
  assert.equal(reach.featuredApplyProblem({ level: "cash_trusted", featuredStatus: "featured" }), "featured");
  assert.equal(reach.isFeaturedNow({ level: "cash_trusted", featuredStatus: "featured" }), true);
  assert.equal(reach.isFeaturedNow({ level: "trusted", featuredStatus: "featured" }), false, "dropping a tier pauses the badge");
  assert.equal(reach.isFeaturedNow({ level: "cash_trusted", featuredStatus: "applied" }), false);
  assert.equal(reach.featuredStatusOf("weird"), "none");

  const server = read("src/lib/logistics/partner-reach.server.ts");
  assert.match(server, /where: \{ id: partner\.id, featuredStatus: \{ in: \["none", "rejected"\] \} \}/);
  assert.match(server, /if \(decision === "approve" && !canTakeHighValue\(partner\.level\)\)/);
  assert.match(read("src/app/api/admin/logistics-partners/[id]/featured/route.ts"), /z\.enum\(\["approve", "reject", "remove"\]\)/);
  assert.match(read("src/app/admin/logistics-partners/[id]/ReachPanel.tsx"), /label="Approve featured"/);
  assert.match(read("src/app/admin/logistics-partners/page.tsx"), /label: "Featured applications"/);
  assert.match(read("src/app/api/mobile/logistics/level/featured/route.ts"), /applyToBeFeatured\(partner\.id\)/);
  assert.match(read("src/lib/plans/extras.server.ts"), /featuredStatus: "featured", level: "cash_trusted"/);
});

test("the one number: earned this week (from Monday, Lagos) and the next working day it's paid", () => {
  assert.deepEqual(reach.nextPayoutDay(new Date("2026-10-28T12:00:00Z")), { date: "2026-10-29", weekday: 4 });
  assert.deepEqual(reach.nextPayoutDay(new Date("2026-10-30T12:00:00Z")), { date: "2026-11-02", weekday: 1 }, "Friday → Monday");
  assert.deepEqual(reach.nextPayoutDay(new Date("2026-10-31T23:30:00Z")), { date: "2026-11-02", weekday: 1 }, "Sunday 00:30 Lagos → Monday");
  assert.equal(reach.lagosWeekStart(new Date("2026-10-28T12:00:00Z")).toISOString(), "2026-10-25T23:00:00.000Z", "Monday 00:00 Lagos");
  assert.equal(reach.lagosWeekStart(new Date("2026-10-25T23:30:00Z")).toISOString(), "2026-10-25T23:00:00.000Z", "Monday 00:30 Lagos is this week");
  assert.match(read("src/app/api/mobile/logistics/overview/route.ts"), /earnedThisWeek\(partner\.id, now\)/);
  assert.match(read("apps/mobile/src/app/logistics/(tabs)/jobs.tsx"), /t\("lvl\.weekPaid", \{ day:/);
  assert.match(read("src/app/logistics/dashboard/page.tsx"), /t\("reach\.week", \{ day:/);
  // No cash cap on the level screens.
  for (const file of ["src/app/logistics/level/page.tsx", "apps/mobile/src/app/logistics/level.tsx"]) assert.doesNotMatch(read(file), /cashCap|CashRules/, file);
});

test("UI: the level screens on web and phone, Peggy can open it, and words in all five languages", async () => {
  const web = read("src/app/logistics/level/page.tsx");
  for (const piece of ["<LevelLadder", "<GoalList", "<FeaturedCard", "<TierUnlocks", "<InterstateNote"]) assert.ok(web.includes(piece), piece);
  const phone = read("apps/mobile/src/app/logistics/level.tsx");
  assert.match(phone, /fetchPartnerLevel/);
  assert.match(phone, /applyToBeFeatured/);
  assert.match(read("apps/mobile/src/app/logistics/(tabs)/more.tsx"), /router\.push\("\/logistics\/level"\)/);
  assert.equal(screens.findScreen("logistics_partner", "my tier").app, "/logistics/level");
  assert.equal(screens.findScreen("logistics_partner", "apply to be featured").web, "/logistics/level");

  const LANGS = ["en", "pcm", "yo", "ha", "ig"];
  for (const [ns, keys] of [["logistics", ["reach.title", "reach.week", "reach.unlock.highValue", "reach.featured.apply", "reach.day.4"]], ["m_partner", ["lvl.title", "lvl.weekPaid", "lvl.tier.cash_trusted", "lvl.interstateGated", "lvl.dayShort.4"]], ["delivery", ["find.featured", "find.tier3"]], ["m_rider", ["earn.weekLine"]]]) {
    for (const lang of LANGS) {
      const catalog = (await import(`../shared/i18n/messages/${ns}/${lang}.ts`)).default;
      for (const key of keys) assert.ok(catalog[key], `${ns}/${lang} ${key}`);
    }
  }
  // Safety limits (the verification tiers' limits) never read as "Tier 1"/"Tier 2" anywhere people see.
  for (const file of ["src/app/admin/logistics-partners/tier-rules/page.tsx", "src/app/admin/logistics-partners/tier-rules/TierRulesForm.tsx", "src/app/admin/logistics-partners/[id]/TierPanel.tsx"]) {
    const source = read(file).split("\n").filter((line) => !line.trim().startsWith("//")).join("\n");
    assert.doesNotMatch(source, /"Tier [12]|Tier 1 limits|on Tier 1/, file);
  }
  const kyc = (await import("../shared/i18n/messages/partnerKyc/en.ts")).default;
  assert.equal(kyc["tier.tier1"], "Verified Individual");
});

test("migration: additive and safe to run twice", () => {
  const path = "docs/migrations/2026-12-07-logistics-reach-tiers.sql";
  assert.ok(existsSync(new URL(`../${path}`, import.meta.url)));
  const sql = read(path);
  for (const column of ["featuredStatus", "featuredAppliedAt", "featuredAt", "featuredNote", "interstateNoticeAt", "highValue"]) assert.match(sql, new RegExp(`ADD COLUMN IF NOT EXISTS "${column}"`), column);
  assert.doesNotMatch(sql, /DROP|RENAME|ALTER COLUMN/i);
  const schema = read("prisma/schema.prisma");
  assert.match(schema, /featuredStatus\s+String\s+@default\("none"\)/);
  assert.match(schema, /highValue\s+Boolean\s+@default\(false\)/);
});
