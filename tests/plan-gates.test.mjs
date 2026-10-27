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
    chinaImportProblem: ["src/app/actions/imports.ts"],
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
