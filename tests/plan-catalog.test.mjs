// Subscription plans managed from admin (shared/plan-catalog.ts, src/lib/plans/catalog.server.ts,
// /admin/pricing/plans): the built-in Paystack codes, plans created from admin counting everywhere once registered
// (interval, perks, free domain, badge, credits), the checks on prices, and source checks that nothing still
// hard-codes a plan code or price.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const catalog = await import("../shared/plan-catalog.ts");
const sellerPlan = await import("../src/lib/seller-plan.ts");
const badges = await import("../src/lib/store-badges.ts");
const credits = await import("../shared/ai-credits.ts");

const NOW = new Date("2026-11-01T09:00:00Z");
const paidUp = (planCode, planInterval) => ({ planCode, planInterval, planStatus: "active", planPaidUntil: new Date("2027-06-01T00:00:00Z") });

test("October 2026 plans: the old codes moved to their new tiers, and the new prices", () => {
  const tiers = catalog.BUILTIN_PLAN_VERSIONS.map((v) => [v.code, v.tier, v.billing]);
  assert.deepEqual(tiers, [
    ["PLN_8ou289e71czicvm", "seller_starter", "monthly"],
    ["PLN_q1k3ssxpx7rxxuz", "seller_starter", "annual"],
    ["PLN_2gph11w3yd0250y", "seller_growth", "monthly"],
    ["PLN_9gma70ofldhbj4r", "seller_growth", "annual"],
    ["PLN_q78304vgj7p35o6", "supplier_pro", "monthly"],
    ["PLN_0a6z6ns429ohli1", "supplier_pro", "annual"],
  ]);
  assert.deepEqual(catalog.LEGACY_TIERS, { seller_growth: "seller_starter", seller_pro: "seller_growth", supplier_max: "supplier_pro" });
  // Markers didn't change for the people who moved: 50 was Growth (now Starter), 200 was Seller Pro (now Growth).
  assert.equal(catalog.planMarker("PLN_8ou289e71czicvm"), 50);
  assert.equal(catalog.planMarker("PLN_2gph11w3yd0250y"), 200);
  assert.equal(catalog.planMarker("PLN_0a6z6ns429ohli1"), 100, "an old code we never sold here still counts");
  assert.equal(catalog.planMarker("PLN_unknown"), null);
  const prices = Object.fromEntries(catalog.PLAN_TIER_KEYS.map((tier) => [tier, [catalog.PLAN_TIERS[tier].defaults.monthlyNgn, catalog.PLAN_TIERS[tier].defaults.annualNgn]]));
  assert.deepEqual(prices, {
    seller_starter: [6000, 60000],
    seller_growth: [18000, 180000],
    seller_pro: [40000, 400000],
    supplier_plus: [10000, 100000],
    supplier_pro: [30000, 300000],
    logistics_plus: [8000, 80000],
    logistics_pro: [25000, 250000],
  });
  for (const tier of catalog.PLAN_TIER_KEYS) assert.equal(catalog.PLAN_TIERS[tier].defaults.annualNgn, catalog.PLAN_TIERS[tier].defaults.monthlyNgn * 10, `${tier}: yearly is two months free`);
});

test("moving subscribers to today's prices: only codes that differ, and only ones in use or on sale", () => {
  const versions = [
    { code: "OLD_GROWTH", tier: "seller_starter", billing: "monthly", amountNgn: 8000, current: false },
    { code: "OLD_PRO", tier: "seller_growth", billing: "monthly", amountNgn: 18000, current: true },
    { code: "OLD_MAX", tier: "supplier_pro", billing: "monthly", amountNgn: 25000, current: false },
    { code: "NOBODY", tier: "supplier_pro", billing: "annual", amountNgn: null, current: false },
  ];
  const target = (tier, billing) => catalog.PLAN_TIERS[tier][billing === "annual" ? "defaults" : "defaults"][billing === "annual" ? "annualNgn" : "monthlyNgn"];
  const moves = catalog.priceMoves(versions, target, new Map([["OLD_GROWTH", 12], ["OLD_MAX", 3]]));
  assert.deepEqual(moves.map((m) => [m.code, m.fromNgn, m.toNgn, m.subscribers]), [["OLD_GROWTH", 8000, 6000, 12], ["OLD_MAX", 25000, 30000, 3]]);
});

test("a plan created from admin gets its tier's perks once registered", () => {
  const NEW_PRO_ANNUAL = "PLN_newproannual1";
  assert.equal(sellerPlan.planInterval(NEW_PRO_ANNUAL), null, "unknown before the catalog loads");
  catalog.registerPlanVersions([
    ...catalog.BUILTIN_PLAN_VERSIONS,
    { code: NEW_PRO_ANNUAL, tier: "seller_pro", billing: "annual", amountNgn: 400000, current: true },
  ]);
  assert.equal(sellerPlan.planInterval(NEW_PRO_ANNUAL), "annual");
  assert.equal(sellerPlan.freeDomainEligible(paidUp(NEW_PRO_ANNUAL, "annual"), NOW), true, "free domain at the new price");
  assert.equal(badges.canHideShopinbosBadge(paidUp(NEW_PRO_ANNUAL, "annual"), NOW), true, "Pro perks at the new price");
  assert.equal(catalog.planMarker(NEW_PRO_ANNUAL), 400);
  // The old Seller Pro yearly code is Growth now: free domain yes, hiding the badge is Pro only.
  assert.equal(sellerPlan.freeDomainEligible(paidUp("PLN_9gma70ofldhbj4r", "annual"), NOW), true);
  assert.equal(badges.canHideShopinbosBadge(paidUp("PLN_9gma70ofldhbj4r", "annual"), NOW), false);
  catalog.registerPlanVersions([]);
});

test("prices and credits an admin can set; the yearly saving", () => {
  assert.equal(catalog.cleanPlanAmount("₦20,000"), 20000);
  assert.equal(catalog.cleanPlanAmount("99"), null);
  assert.equal(catalog.cleanPlanAmount("1000.5"), null);
  assert.equal(catalog.cleanPlanCredits("0"), 0);
  assert.equal(catalog.cleanPlanCredits("-1"), null);
  assert.deepEqual(catalog.annualSaving(8000, 80000), { perMonth: 6667, months: 2 });
  assert.deepEqual(catalog.annualSaving(18000, 198000), { perMonth: 16500, months: 1 });
  assert.equal(catalog.annualSaving(8000, 96000), null, "no saving, no note");
  assert.equal(catalog.paystackPlanName("seller_pro", "annual", 400000), "Shopinbos Pro (annual) ₦400,000");
});

test("wiring: no plan code or price is hard-coded outside the catalog", () => {
  for (const path of ["src/app/actions/payments.ts", "src/app/api/webhooks/paystack/route.ts", "src/components/payments/PlanPicker.tsx", "src/lib/seller-plan.ts", "shared/ai-credits.ts", "shared/plans.ts"]) {
    assert.doesNotMatch(read(path), /PLN_[A-Za-z0-9]{6,}/, path);
  }
  assert.doesNotMatch(read("src/components/payments/PlanPicker.tsx"), /₦\d/);
  const server = read("src/lib/plans/catalog.server.ts");
  assert.match(server, /Paystack first: if it refuses, nothing changes here/);
  const save = server.slice(server.indexOf("export async function savePlanTier"));
  assert.ok(save.indexOf("createPaystackPlan(") < save.indexOf("db.$transaction("), "the Paystack plan exists before it's saved");
  assert.match(server, /registerPlanVersions\(catalog\.versions\)/);
  assert.match(read("src/app/actions/payments.ts"), /version\.tier !== upgrade/);
  assert.match(read("src/app/actions/payments.ts"), /PLAN_TIERS\[tier\]\.role !== user\.role/, "a plan only for its own kind of account");
  assert.match(server, /MIGRATION_KEY/);
  assert.match(server, /update_existing_subscriptions|updatePaystackPlanAmount/);
  assert.match(read("src/lib/paystack.ts"), /update_existing_subscriptions: true/);
  assert.match(read("src/app/actions/pricing.ts"), /export async function savePlan[\s\S]*requireAdminSection\("money"\)/);
  assert.match(read("src/lib/paystack.ts"), /\/plan`/);
  const sql = read("docs/migrations/2026-11-11-subscription-plans.sql");
  for (const v of catalog.BUILTIN_PLAN_VERSIONS) assert.match(sql, new RegExp(v.code));
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
  // The plan strings with numbers in them take the live numbers, in every language.
  for (const locale of ["en", "pcm", "yo", "ha", "ig"]) {
    const messages = read(`shared/i18n/messages/payments/${locale}.ts`);
    assert.match(messages, /"plans\.saving": "[^"]*\{perMonth\}[^"]*\{months\}/, locale);
    assert.match(messages, /"plans\.f\.seller\.fee": "[^"]*\{pct\}/, locale);
    assert.match(messages, /"plans\.f\.supplier\.commission": "[^"]*\{pct\}/, locale);
  }
});
