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

test("the built-in plans are today's prices", () => {
  const current = catalog.BUILTIN_PLAN_VERSIONS.filter((v) => v.current).map((v) => [v.tier, v.billing, v.amountNgn]);
  assert.deepEqual(current, [
    ["seller_growth", "monthly", 8000],
    ["seller_growth", "annual", 80000],
    ["seller_pro", "monthly", 18000],
    ["seller_pro", "annual", 180000],
    ["supplier_max", "monthly", 25000],
  ]);
  assert.equal(catalog.planMarker("PLN_2gph11w3yd0250y"), 200);
  assert.equal(catalog.planMarker("PLN_0a6z6ns429ohli1"), 100, "an old code we never sold here still counts");
  assert.equal(catalog.planMarker("PLN_unknown"), null);
  for (const tier of catalog.PLAN_TIER_KEYS) assert.equal(catalog.PLAN_TIERS[tier].defaults.monthlyNgn, catalog.BUILTIN_PLAN_VERSIONS.find((v) => v.tier === tier && v.billing === "monthly").amountNgn);
});

test("a plan created from admin gets its tier's perks once registered", () => {
  const NEW_PRO_ANNUAL = "PLN_newproannual1";
  assert.equal(sellerPlan.planInterval(NEW_PRO_ANNUAL), null, "unknown before the catalog loads");
  catalog.registerPlanVersions([
    ...catalog.BUILTIN_PLAN_VERSIONS.map((v) => (v.code === "PLN_9gma70ofldhbj4r" ? { ...v, current: false } : v)),
    { code: NEW_PRO_ANNUAL, tier: "seller_pro", billing: "annual", amountNgn: 200000, current: true },
  ]);
  assert.equal(sellerPlan.planInterval(NEW_PRO_ANNUAL), "annual");
  assert.equal(sellerPlan.freeDomainEligible(paidUp(NEW_PRO_ANNUAL, "annual"), NOW), true, "free domain at the new price");
  assert.equal(badges.canHideShopinbosBadge(paidUp(NEW_PRO_ANNUAL, "annual"), NOW), true, "Pro perks at the new price");
  assert.equal(catalog.planMarker(NEW_PRO_ANNUAL), 200);
  assert.equal(credits.planCreditGrant(NEW_PRO_ANNUAL).credits, 2400, "a year of Pro credits up front");
  assert.equal(credits.planCreditGrant(NEW_PRO_ANNUAL, { seller_pro: 250 }).credits, 3000, "admin's monthly credits × 12");
  // The old price still works for the people on it.
  assert.equal(sellerPlan.freeDomainEligible(paidUp("PLN_9gma70ofldhbj4r", "annual"), NOW), true);
  assert.equal(credits.planCreditGrant("PLN_8ou289e71czicvm", { seller_growth: 60 }).credits, 60);
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
  assert.equal(catalog.paystackPlanName("seller_pro", "annual", 200000), "Shopinbos Seller Pro (annual) ₦200,000");
});

test("wiring: no plan code or price is hard-coded outside the catalog", () => {
  for (const path of ["src/app/actions/payments.ts", "src/app/api/webhooks/paystack/route.ts", "src/components/payments/SellerBillingSection.tsx", "src/components/payments/PlanUpgradeSection.tsx", "src/lib/seller-plan.ts", "shared/ai-credits.ts"]) {
    assert.doesNotMatch(read(path), /PLN_[A-Za-z0-9]{6,}/, path);
  }
  assert.doesNotMatch(read("src/components/payments/SellerBillingSection.tsx"), /₦\d/);
  assert.doesNotMatch(read("src/components/payments/PlanUpgradeSection.tsx"), /₦\d/);
  const server = read("src/lib/plans/catalog.server.ts");
  assert.match(server, /Paystack first: if it refuses, nothing changes here/);
  assert.ok(server.indexOf("createPaystackPlan(") < server.indexOf("db.$transaction("), "the Paystack plan exists before it's saved");
  assert.match(server, /registerPlanVersions\(catalog\.versions\)/);
  assert.match(read("src/app/actions/payments.ts"), /version\.tier !== upgrade/);
  assert.match(read("src/app/actions/pricing.ts"), /export async function savePlan[\s\S]*requireRole\(\["admin"\]/);
  assert.match(read("src/lib/paystack.ts"), /\/plan`/);
  const sql = read("docs/migrations/2026-11-11-subscription-plans.sql");
  for (const v of catalog.BUILTIN_PLAN_VERSIONS) assert.match(sql, new RegExp(v.code));
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
  // The plan strings with numbers in them take the live numbers, in every language.
  for (const locale of ["en", "pcm", "yo", "ha", "ig"]) {
    const messages = read(`shared/i18n/messages/payments/${locale}.ts`);
    assert.match(messages, /"plan\.growth\.f1": "[^"]*\{count\}/, locale);
    assert.match(messages, /"plan\.growthNote": "[^"]*\{perMonth\}[^"]*\{months\}/, locale);
    assert.match(messages, /"sm\.credits": "[^"]*\{count\}/, locale);
  }
});
