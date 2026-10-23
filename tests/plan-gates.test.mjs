// What each plan lets sellers, suppliers and delivery partners do (shared/plans.ts), and source checks that every
// place a seller adds products, domains, themes, delivery areas, partners, pay on delivery or campaigns asks
// src/lib/plans/gates.server.ts first, and that paid plans come first in the marketplace's default order.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const plans = await import("../shared/plans.ts");

test("seller limits climb with the plan", () => {
  const free = plans.sellerLimits("seller_free");
  assert.equal(free.products, 20);
  assert.equal(free.customDomain, false);
  assert.equal(free.themes, "basic");
  assert.equal(free.sellingStates, 1);
  assert.equal(free.payOnDelivery, false);
  assert.equal(free.chinaImport, "browse");
  assert.equal(plans.sellerLimits("seller_starter").customDomain, true);
  assert.equal(plans.sellerLimits("seller_growth").payOnDelivery, true);
  assert.equal(plans.sellerLimits("seller_growth").sellingStates, null);
  assert.equal(plans.sellerLimits("seller_growth").themes, "all_seasonal");
  assert.equal(plans.cheapestPlanWhere("seller", (key) => plans.sellerLimits(key).payOnDelivery), "seller_growth");
  assert.equal(plans.cheapestPlanWhere("seller", (key) => plans.sellerLimits(key).customDomain), "seller_starter");
});

test("plan markers rise with the plan within each role, so ordering by them puts paid plans first", () => {
  const m = plans.PLAN_MARKERS;
  assert.ok(m.supplier_pro > m.supplier_plus && m.supplier_plus > 5);
  assert.ok(m.logistics_pro > m.logistics_plus && m.logistics_plus > 5);
  const placement = read("src/lib/plans/placement.ts");
  assert.match(placement, /aiCredits: "desc"/);
  for (const path of ["src/app/marketplace/page.tsx", "src/app/api/mobile/marketplace/products/route.ts", "src/app/api/public/products/route.ts"]) assert.match(read(path), /PRODUCT_PLAN_FIRST/, path);
  for (const path of ["src/app/marketplace/suppliers/page.tsx", "src/app/api/public/suppliers/route.ts"]) assert.match(read(path), /SUPPLIER_PLAN_FIRST/, path);
  for (const path of ["src/app/marketplace/logistics/page.tsx", "src/app/api/public/logistics/partners/route.ts", "src/app/home/logistics/page.tsx"]) assert.match(read(path), /PARTNER_PLAN_FIRST/, path);
  // A shopper's own sort wins: only the default sort ranks by plan.
  assert.match(read("src/app/api/public/products/route.ts"), /sort === "trending" \? \[PRODUCT_PLAN_FIRST/);
});

test("wiring: every place a seller adds something checks the plan", () => {
  const checks = {
    productLimitProblem: ["src/app/api/store/products/route.ts", "src/app/api/app/store-products/route.ts", "src/app/actions/sourcing.ts", "src/app/actions/workspace.ts"],
    customDomainProblem: ["src/app/api/domains/connect/route.ts", "src/app/api/domains/purchase/route.ts"],
    themeProblem: ["src/app/api/store/templates/apply/route.ts", "src/lib/ai/rex/tools.ts", "src/lib/ai/rex/full-build.server.ts"],
    sellingStatesProblem: ["src/app/api/store/shipping-zones/route.ts", "src/app/api/store/shipping-zones/[id]/route.ts", "src/app/api/app/onboarding/payments/route.ts", "src/lib/setup/server.ts"],
    payOnDeliveryAllowed: ["src/lib/seller-payments.server.ts", "src/app/api/app/onboarding/payments/route.ts", "src/lib/setup/server.ts"],
    deliveryPartnerProblem: ["src/app/api/app/logistics/bookings/route.ts", "src/app/api/app/logistics/quotes/route.ts", "src/app/api/app/logistics/preferred-partner/route.ts"],
    seasonalCampaignProblem: ["src/lib/store-campaigns/server.ts"],
    chinaImportProblem: ["src/app/actions/sourcing.ts"],
    chinaImportPriority: ["src/app/actions/sourcing.ts"],
    dropshipLimitProblem: ["src/app/api/store/products/[id]/route.ts"],
    exceptionsInboxProblem: ["src/lib/delivery-market/jobs.server.ts", "src/app/home/logistics/exceptions/page.tsx", "src/app/home/logistics/page.tsx", "src/app/api/mobile/delivery/route.ts"],
    prioritySupportFor: ["src/lib/support/service.server.ts"],
  };
  for (const [fn, paths] of Object.entries(checks)) for (const path of paths) assert.match(read(path), new RegExp(`\\b${fn}\\(`), `${path} → ${fn}`);
  // Things the seller already had keep working after a downgrade.
  const gates = read("src/lib/plans/gates.server.ts");
  assert.match(gates, /after\.states > before\.states/);
  assert.match(gates, /after\.everywhere && !before\.everywhere/);
  assert.match(read("src/lib/seller-payments.server.ts"), /record\(paymentConfig\.methods\)\.cod !== true/);
  assert.match(read("src/lib/store-campaigns/server.ts"), /createCampaign[\s\S]{0,200}requireCampaignPlan/);
  assert.match(read("src/app/api/app/payments/route.ts"), /codNeedsPlan: \{ code: "PLAN_LIMIT"/);
  for (const locale of ["en", "pcm", "yo", "ha", "ig"]) assert.match(read(`shared/i18n/messages/payments/${locale}.ts`), /"err\.codNeedsPlan"/, locale);
});

test("analytics: Free sees headline numbers, Plus the charts, Pro downloads", () => {
  assert.equal(plans.supplierLimits("supplier_free").analytics, "basic");
  assert.equal(plans.supplierLimits("supplier_plus").analytics, "full");
  assert.equal(plans.supplierLimits("supplier_pro").analytics, "export");
  assert.equal(plans.logisticsLimits("logistics_pro").analytics, "export");
  for (const path of ["src/app/api/supplier/analytics/export/route.ts", "src/app/api/logistics/analytics/export/route.ts"]) {
    assert.match(read(path), /analytics !== "export"\) return apiError\("PLAN_LIMIT"/, path);
  }
  for (const path of ["src/app/supplier/analytics/page.tsx", "src/app/logistics/analytics/page.tsx"]) assert.match(read(path), /analytics === "basic" \? null/, path);
});

test("the October 2026 seller plan table", () => {
  const row = (key) => plans.sellerLimits(key);
  assert.deepEqual(["seller_free", "seller_starter", "seller_growth", "seller_pro"].map((key) => row(key).transactionFeePct), [3, 2, 1, 0.5]);
  assert.deepEqual(["seller_free", "seller_starter", "seller_growth", "seller_pro"].map((key) => row(key).staff), [1, 2, 5, 15]);
  assert.deepEqual(["seller_free", "seller_starter", "seller_growth", "seller_pro"].map((key) => row(key).logisticsPartners), [1, 3, 10, null]);
  assert.deepEqual(["seller_free", "seller_starter", "seller_growth", "seller_pro"].map((key) => row(key).dropshipProducts), [5, 50, null, null]);
  assert.deepEqual(["seller_free", "seller_starter", "seller_growth", "seller_pro"].map((key) => row(key).exceptionsInbox), [false, false, true, true]);
  assert.deepEqual(["seller_free", "seller_starter", "seller_growth", "seller_pro"].map((key) => row(key).privateRateCards), [false, true, true, true]);
  assert.deepEqual(["seller_free", "seller_starter", "seller_growth", "seller_pro"].map((key) => row(key).messagesIncluded), [0, 0, 200, 1000]);
  assert.deepEqual(["seller_free", "seller_starter", "seller_growth", "seller_pro"].map((key) => row(key).prioritySupport), [false, false, false, true]);
  assert.equal(row("seller_pro").chinaImport, "priority");
});

test("product limits: creating checks on POST (not on listing), dropship counts, unarchiving counts", () => {
  const app = read("src/app/api/app/store-products/route.ts");
  assert.doesNotMatch(app.slice(0, app.indexOf("export const POST")), /productLimitProblem\(/);
  assert.match(app.slice(app.indexOf("export const POST")), /productLimitProblem\(user\.id, store\.id, 1, rest\.fulfillmentType === "dropship"\)/);
  assert.match(read("src/app/api/store/products/route.ts"), /productLimitProblem\(user\.id, store\.id, 1, rest\.fulfillmentType === "dropship"\)/);
  assert.match(read("src/app/api/store/products/[id]/route.ts"), /product\.status === "archived"[\s\S]{0,120}productLimitProblem\(/);
});

test("reassigning a delivery is refused without the exceptions inbox", () => {
  const jobs = read("src/lib/delivery-market/jobs.server.ts");
  assert.match(jobs, /export async function reassignJob[\s\S]{0,250}exceptionsInboxProblem\(sellerId\)/);
  assert.match(jobs, /export async function reassignOptions[\s\S]{0,120}exceptionsInboxProblem\(sellerId\)/);
});

test("seller texts to customers are counted against the plan's messages and packs", () => {
  // Every SMS a store sends to its customers goes through textSender (own account, else plan messages then packs).
  assert.match(read("src/lib/marketing/channels.ts"), /spendPlatformMessage\(store\.id, "sms"\)[\s\S]{0,120}sendPlatformSms/);
  const reviews = read("src/lib/reviews/requests.ts");
  assert.doesNotMatch(reviews, /sendSms\(|sendWhatsAppMessage\(/);
  assert.match(reviews, /\(await texts\(\)\)\.sms\(/);
  const drawer = read("src/lib/customers/drawer.server.ts");
  assert.match(drawer, /input\.channel === "sms"[\s\S]{0,900}sender\.sms\(phone, body\)/);
  assert.match(read("src/lib/inbox/service.ts"), /textSender\(store\)\)\.sms\(to, body\)/);
});

test("logistics: coverage areas count states against the plan; regions expand; nationwide is unlimited", async () => {
  const market = await import("../shared/delivery-market.ts");
  assert.equal(market.areaStateCount(["Lagos", "Lagos: Ikeja", "Oyo"]), 2);
  assert.equal(market.areaStateCount(["Nationwide"]), null);
  assert.ok(market.areaStateCount(["South-West"]) >= 6);
  const manage = read("src/lib/delivery-market/manage.server.ts");
  assert.match(manage, /export async function savePartnerCoverage[\s\S]{0,900}coverageAreasProblem\(/);
  // Setup Peggy adds pickup points and coverage within the plan too.
  const peggy = read("src/lib/onboarding/setup-peggy.server.ts");
  assert.match(peggy, /pickupPointLimitProblem\(partner\.id\)/);
  assert.match(peggy, /coverageStateCount\(\[\.\.\.partner\.coverageZones, \.\.\.add\]\) > limit/);
});

test("logistics: Plus is boosted and Pro or featured partners lead in Find partners", async () => {
  const market = await import("../shared/delivery-market.ts");
  const base = { stats: { completed: 10, onTimeRate: 90, failedRate: 2 }, rating: 4, ratingCount: 3, match: 2, verified: true };
  const free = market.rankScore({ ...base, placement: "standard" });
  assert.ok(market.rankScore({ ...base, placement: "boosted" }) > free);
  assert.ok(market.rankScore({ ...base, placement: "top" }) > market.rankScore({ ...base, placement: "boosted" }));
  assert.equal(market.leadsMatching({ featured: false, placement: "top" }), true);
  assert.equal(market.leadsMatching({ featured: true, placement: "standard" }), true);
  assert.equal(market.leadsMatching({ featured: false, placement: "boosted" }), false);
  assert.match(read("src/lib/delivery-market/manage.server.ts"), /\.sort\(\(a, b\) => Number\(leadsMatching\(b\)\) - Number\(leadsMatching\(a\)\) \|\| b\.score - a\.score\)/);
});

test("switching a team member back on counts against the plan's team size (suppliers and delivery partners)", () => {
  assert.match(read("src/app/actions/supplier.ts"), /export async function updateSupplierTeamMemberStatus[\s\S]{0,1400}status === "active" && teamMember\.status !== "active"[\s\S]{0,400}atLimit\(/);
  assert.match(read("src/app/actions/logistics.ts"), /status === "active" && teamMember\.status !== "active"\) await assertLogisticsPlanAllowsTeamMember/);
});
