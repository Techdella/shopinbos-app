// Free domain with an annual seller plan (src/lib/seller-plan.ts): the plan-code → interval map, who is eligible
// (active, annual Growth/Pro, paid up; for a renewal paid past the domain's expiry), and wiring: the webhook records
// the plan, free purchases never touch Paystack, and the purchase route decides on the server.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const plan = await import("../src/lib/seller-plan.ts");

const ROOT = new URL("..", import.meta.url).pathname;
const read = (path) => readFileSync(join(ROOT, path), "utf8");
const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-10-14T09:00:00Z");
const inDays = (days) => new Date(NOW.getTime() + days * DAY);
const GROWTH_ANNUAL = "PLN_q1k3ssxpx7rxxuz";
const PRO_ANNUAL = "PLN_9gma70ofldhbj4r";
const active = (over = {}) => ({ planCode: GROWTH_ANNUAL, planInterval: "annual", planStatus: "active", planPaidUntil: inDays(200), ...over });

test("plan codes map to monthly or annual; only seller annual plans come with a domain", async () => {
  assert.equal(plan.planInterval("PLN_8ou289e71czicvm"), "monthly");
  assert.equal(plan.planInterval("PLN_2gph11w3yd0250y"), "monthly");
  assert.equal(plan.planInterval("PLN_q78304vgj7p35o6"), "monthly");
  assert.equal(plan.planInterval(GROWTH_ANNUAL), "annual");
  assert.equal(plan.planInterval(PRO_ANNUAL), "annual");
  assert.equal(plan.planInterval("PLN_0a6z6ns429ohli1"), "annual");
  assert.equal(plan.planInterval("PLN_unknown"), null);
  assert.equal(plan.planInterval(null), null);
  assert.equal(plan.planInterval("toString"), null, "no prototype keys");
  const catalog = await import("../shared/plan-catalog.ts");
  const freeDomain = catalog.BUILTIN_PLAN_VERSIONS.map((v) => v.code).filter((code) => plan.isFreeDomainPlan(code));
  assert.deepEqual(freeDomain.sort(), [GROWTH_ANNUAL, PRO_ANNUAL].sort());
  // The webhook takes the tier from the same catalog (codes created from admin included).
  const webhook = read("src/app/api/webhooks/paystack/route.ts");
  assert.match(webhook, /planMarker\(planCode\)/);
  assert.match(webhook, /await getPlanCatalog\(\)/);
});

test("free domain: active annual Growth or Pro, paid up past now", () => {
  assert.equal(plan.freeDomainEligible(active(), NOW), true);
  assert.equal(plan.freeDomainEligible(active({ planCode: PRO_ANNUAL }), NOW), true);
  assert.equal(plan.freeDomainEligible(active({ planCode: "PLN_8ou289e71czicvm", planInterval: "monthly" }), NOW), false, "monthly");
  assert.equal(plan.freeDomainEligible(active({ planInterval: "monthly" }), NOW), false, "interval must be annual");
  assert.equal(plan.freeDomainEligible(active({ planCode: "PLN_0a6z6ns429ohli1" }), NOW), false, "supplier annual isn't a seller plan");
  assert.equal(plan.freeDomainEligible(active({ planStatus: "non_renewing" }), NOW), false, "non-renewing");
  assert.equal(plan.freeDomainEligible(active({ planStatus: "cancelled" }), NOW), false, "cancelled");
  assert.equal(plan.freeDomainEligible(active({ planPaidUntil: inDays(-1) }), NOW), false, "paid-until in the past");
  assert.equal(plan.freeDomainEligible(active({ planPaidUntil: NOW }), NOW), false, "paid-until exactly now");
  assert.equal(plan.freeDomainEligible(active({ planPaidUntil: null }), NOW), false);
  assert.equal(plan.freeDomainEligible(null, NOW), false);
  assert.equal(plan.freeDomainEligible({}, NOW), false);
});

test("free renewal: the plan must already be paid up to the day the domain's next year starts", () => {
  assert.equal(plan.freeDomainEligible(active({ planPaidUntil: inDays(200) }), NOW, inDays(7)), true);
  assert.equal(plan.freeDomainEligible(active({ planPaidUntil: inDays(7) }), NOW, inDays(7)), true, "exactly the expiry");
  assert.equal(plan.freeDomainEligible(active({ planPaidUntil: inDays(5) }), NOW, inDays(7)), false, "plan ends before the domain year starts");
  assert.equal(plan.freeDomainEligible(active({ planPaidUntil: inDays(200), planStatus: "non_renewing" }), NOW, inDays(7)), false);
  assert.equal(plan.freeDomainEligible(active(), NOW, null), false, "no expiry, no free renewal");
});

test("paid-until: Paystack's next payment date, else one interval on", () => {
  assert.equal(plan.paystackDate("2027-10-14T09:00:00.000Z").toISOString(), "2027-10-14T09:00:00.000Z");
  assert.equal(plan.paystackDate("nope"), null);
  assert.equal(plan.paystackDate(undefined), null);
  assert.equal(plan.extendPaidUntil(null, "annual", NOW).toISOString(), "2027-10-14T09:00:00.000Z");
  assert.equal(plan.extendPaidUntil(inDays(10), "monthly", NOW).toISOString(), new Date(Date.UTC(2026, 10, 24, 9)).toISOString(), "from the later date");
  assert.equal(plan.extendPaidUntil(inDays(-10), "monthly", NOW).toISOString(), "2026-11-14T09:00:00.000Z", "a lapsed plan extends from now");
  assert.equal(plan.sameSubscription(null, "SUB_1"), true);
  assert.equal(plan.sameSubscription("SUB_1", "SUB_1"), true);
  assert.equal(plan.sameSubscription("SUB_2", "SUB_1"), false, "an event about an old subscription");
});

test("wiring: the webhook records the plan, free rows never touch Paystack, the server decides", () => {
  const webhook = read("src/app/api/webhooks/paystack/route.ts");
  assert.match(webhook, /recordPlan\(recordSubscriptionCreated\(event\.data/);
  assert.match(webhook, /recordPlan\(recordInvoicePaid\(event\.data/);
  assert.match(webhook, /recordSubscriptionStatus\(event\.data \?\? \{\}, eventType === "subscription\.disable" \? "cancelled" : "non_renewing"\)/);
  assert.match(webhook, /data: \{ aiCredits: marker \}/, "the plan marker still set");
  const recorder = read("src/lib/seller-plan.server.ts");
  assert.match(recorder, /planPaidUntil: paystackDate\(data\?\.next_payment_date\)/);
  assert.match(recorder, /paystackDate\(subscription\.next_payment_date\) \?\? extendPaidUntil\(/);

  const server = read("src/lib/domains/billing.server.ts");
  // Free rows: amountNgn 0, coveredByPlan, paid, their own reference prefix, then the normal buy path.
  const start = server.slice(server.indexOf("export async function startPlanCoveredDomain"), server.indexOf("export async function startDomainCheckout"));
  assert.match(start, /amountNgn: 0,\s*coveredByPlan: true,/);
  assert.match(start, /reference: `\$\{PLAN_REFERENCE_PREFIX\}/);
  assert.match(start, /status: "paid"/);
  assert.match(start, /await buyOrRenew\(row\)/);
  assert.doesNotMatch(start, /initializePaystackTransaction|chargePaystackAuthorization|refundPaystackTransaction/);
  assert.notEqual(server.match(/PLAN_REFERENCE_PREFIX = "([^"]+)"/)[1], server.match(/DOMAIN_REFERENCE_PREFIX = "([^"]+)"/)[1]);
  // The refund path returns before Paystack for a free row.
  const refund = server.slice(server.indexOf("async function refundPurchase"), server.indexOf("async function tellSeller"));
  assert.ok(refund.indexOf("if (isPlanCovered(row))") > 0);
  assert.ok(refund.indexOf("if (isPlanCovered(row))") < refund.indexOf("refundPaystackTransaction("), "free check comes first");
  assert.match(refund.slice(refund.indexOf("if (isPlanCovered(row))"), refund.indexOf("refundPaystackTransaction(")), /Nothing was charged[\s\S]*return;/);
  // Callback/webhook completion and payment verification refuse free rows.
  assert.match(server, /if \(!row \|\| isPlanCovered\(row\)\) throw new DomainBillingError\("not_found"/);
  assert.match(server, /async function recordVerifiedPayment\(row: DomainPurchase\) \{\s*if \(isPlanCovered\(row\)\) throw/);
  assert.match(server, /export function isPlanCovered\(row[^)]*\) \{\s*return row\.coveredByPlan \|\| row\.amountNgn <= 0;/);
  // Free renewal in the cron needs the plan paid past the domain's current expiry.
  assert.match(server, /sellerGetsFreeDomain\(row\.userId, now, row\.expiresAt\)/);

  const route = read("src/app/api/domains/purchase/route.ts");
  assert.match(route, /if \(await sellerGetsFreeDomain\(user\.id\)\) \{/, "eligibility from the stored plan");
  assert.ok(route.indexOf("sellerGetsFreeDomain(user.id)") > route.indexOf('quoteDomain(domain, "new")'), "after the DOMAIN_PURCHASE_MAX_USD price check");
  assert.ok(route.indexOf("storeHasDomainPurchase(purchases)") < route.indexOf("sellerGetsFreeDomain(user.id)"), "one domain per store still applies");
  assert.doesNotMatch(route, /parsed\.data\.expectFree\)\s*\{\s*const row|expectFree[^\n]*startPlanCoveredDomain/, "the client's expectFree never makes it free");

  const schema = read("prisma/schema.prisma");
  assert.match(schema, /planPaidUntil\s+DateTime\?/);
  assert.match(schema, /coveredByPlan\s+Boolean\s+@default\(false\)/);
  const sql = read("docs/migrations/2026-10-25-seller-plan.sql");
  assert.match(sql, /ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "planPaidUntil" TIMESTAMP\(3\)/);
  assert.match(sql, /ALTER TABLE "DomainPurchase" ADD COLUMN IF NOT EXISTS "coveredByPlan" BOOLEAN NOT NULL DEFAULT false/);

  assert.match(read("src/components/payments/SellerBillingSection.tsx"), /billing === "annual" && offer\?\.annual && [\s\S]*t\("plan\.freeDomain"\)/);
  assert.match(read("src/components/builder/DomainSetup.tsx"), /href=\{PLANS_HREF\}/);
  assert.match(read("src/app/admin/domains/page.tsx"), /Free \(annual plan\)/);
});
