// Domains bought through Shopinbos, paid first (src/lib/domains/billing-pure.ts + billing.server.ts): naira pricing
// and rounding, the one-domain-per-store rule, which renewal reminders are due, when to try the saved card, the
// grace period before an unrenewed domain comes off the store, the 60-day transfer lock, and source checks that
// Vercel is only called after a verified payment.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const billing = await import("../src/lib/domains/billing-pure.ts");

const ROOT = new URL("..", import.meta.url).pathname;
const read = (path) => readFileSync(join(ROOT, path), "utf8");
const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-10-14T09:00:00Z");
const inDays = (days) => new Date(NOW.getTime() + days * DAY);

test("naira price: USD × rate + markup, rounded up to the next ₦500", () => {
  const config = billing.domainPricingConfig({});
  assert.deepEqual(config, { usdNgnRate: 1650, markupNgn: 3000, maxUsd: 20 });
  assert.equal(billing.nairaPriceForUsd(10, config), 19500, "exact multiple stays");
  assert.equal(billing.nairaPriceForUsd(11.25, config), 22000, "21562.5 → 22000");
  assert.equal(billing.nairaPriceForUsd(0.01, config), 3500, "a cent still rounds up");
  assert.equal(billing.nairaPriceForUsd(null, config), null);
  assert.equal(billing.nairaPriceForUsd(0, config), null);
  assert.equal(billing.nairaPriceForUsd(Number.NaN, config), null);

  const custom = billing.domainPricingConfig({ DOMAIN_USD_NGN_RATE: "1500", DOMAIN_MARKUP_NGN: "0", DOMAIN_PURCHASE_MAX_USD: "35" });
  assert.deepEqual(custom, { usdNgnRate: 1500, markupNgn: 0, maxUsd: 35 });
  assert.equal(billing.nairaPriceForUsd(10, custom), 15000);
  assert.equal(billing.nairaPriceForUsd(10.1, custom), 15500);
  assert.deepEqual(billing.domainPricingConfig({ DOMAIN_USD_NGN_RATE: "abc", DOMAIN_MARKUP_NGN: "-5", DOMAIN_PURCHASE_MAX_USD: "0" }), { usdNgnRate: 1650, markupNgn: 3000, maxUsd: 20 });

  assert.equal(billing.withinMaxUsd(20, config), true);
  assert.equal(billing.withinMaxUsd(20.01, config), false);
  assert.equal(billing.withinMaxUsd(null, config), false);
  assert.equal(billing.maxBuyUsd(10), 10.5, "at least $0.50 tolerance");
  assert.equal(billing.maxBuyUsd(50), 51.5, "3% on bigger prices");
});

test("one domain per store: bought or paid-and-buying counts; unpaid, failed, refunded and expired don't", () => {
  for (const status of ["bought", "paid", "buying"]) assert.equal(billing.countsTowardStoreLimit({ kind: "new", status }), true, status);
  for (const status of ["pending_payment", "payment_failed", "failed", "refunded", "refund_failed", "expired"]) {
    assert.equal(billing.countsTowardStoreLimit({ kind: "new", status }), false, status);
  }
  assert.equal(billing.countsTowardStoreLimit({ kind: "renewal", status: "bought" }), false, "renewals don't use the store's one");
  const rows = [{ id: "a", kind: "new", status: "buying" }, { id: "b", kind: "new", status: "refunded" }];
  assert.equal(billing.storeHasDomainPurchase(rows), true);
  assert.equal(billing.storeHasDomainPurchase(rows, "a"), false, "a purchase doesn't block itself");
  assert.equal(billing.storeHasDomainPurchase([]), false);
});

test("renewal reminders: 30, 7 and 1 days before, each once, only the nearest when the cron missed days", () => {
  assert.deepEqual(billing.dueReminder(inDays(45), [], NOW), { send: null, markSent: [] });
  assert.deepEqual(billing.dueReminder(inDays(30), [], NOW), { send: "r30", markSent: ["r30"] });
  assert.deepEqual(billing.dueReminder(inDays(29.5), ["r30"], NOW), { send: null, markSent: [] }, "not twice");
  assert.deepEqual(billing.dueReminder(inDays(7), ["r30"], NOW), { send: "r7", markSent: ["r7"] });
  assert.deepEqual(billing.dueReminder(inDays(5), [], NOW), { send: "r7", markSent: ["r30", "r7"] }, "missed the 30-day one: only the 7-day goes out");
  assert.deepEqual(billing.dueReminder(new Date(NOW.getTime() + 20 * 60 * 60 * 1000), ["r30", "r7"], NOW), { send: "r1", markSent: ["r1"] }, "20 hours left is the 1-day reminder");
  assert.deepEqual(billing.dueReminder(inDays(1), ["r30", "r7", "r1"], NOW), { send: null, markSent: [] });
  assert.deepEqual(billing.dueReminder(inDays(-1), [], NOW), { send: null, markSent: [] }, "nothing after expiry");
  assert.equal(billing.daysLeft(inDays(6.2), NOW), 7);
});

test("the saved card is tried once, 7 days or fewer before expiry, only with a reusable card", () => {
  assert.equal(billing.shouldAutoCharge(inDays(7), [], NOW, true), true);
  assert.equal(billing.shouldAutoCharge(inDays(3), ["r30", "r7"], NOW, true), true);
  assert.equal(billing.shouldAutoCharge(inDays(8), [], NOW, true), false, "too early");
  assert.equal(billing.shouldAutoCharge(inDays(7), ["charge"], NOW, true), false, "already tried");
  assert.equal(billing.shouldAutoCharge(inDays(7), [], NOW, false), false, "no reusable card");
  assert.equal(billing.shouldAutoCharge(inDays(-1), [], NOW, true), false, "expired");
});

test("expiry: active, then 3 days' grace, then the domain comes off the store", () => {
  assert.equal(billing.expiryDecision(inDays(1), NOW), "active");
  assert.equal(billing.expiryDecision(NOW, NOW), "grace", "the moment it expires");
  assert.equal(billing.expiryDecision(inDays(-2.9), NOW), "grace");
  assert.equal(billing.expiryDecision(inDays(-3), NOW), "expire");
  assert.equal(billing.expiryDecision(inDays(-10), NOW), "expire");
  assert.equal(billing.expiryDecision(inDays(-1), NOW, 0), "expire", "grace is configurable");
});

test("latest bought purchase per domain, one-year extensions, transfer lock, saved cards", () => {
  const rows = [
    { id: "1", storeId: "s", domain: "ada.ng", kind: "new", status: "bought", expiresAt: inDays(5) },
    { id: "2", storeId: "s", domain: "ada.ng", kind: "renewal", status: "bought", expiresAt: inDays(370) },
    { id: "3", storeId: "s", domain: "ada.ng", kind: "renewal", status: "pending_payment", expiresAt: null },
    { id: "4", storeId: "t", domain: "chi.com", kind: "new", status: "bought", expiresAt: inDays(100) },
    { id: "5", storeId: "u", domain: "old.com", kind: "new", status: "expired", expiresAt: inDays(-10) },
  ];
  assert.deepEqual(billing.latestBoughtPerDomain(rows).map((row) => row.id).sort(), ["2", "4"]);

  assert.equal(billing.addOneYear(new Date("2026-10-14T09:00:00Z")).toISOString(), "2027-10-14T09:00:00.000Z");
  assert.equal(billing.addOneYear("2027-01-31T00:00:00Z").toISOString(), "2028-01-31T00:00:00.000Z");

  const young = billing.transferLock(inDays(-10), NOW);
  assert.equal(young.locked, true);
  assert.equal(young.availableAt.toISOString(), inDays(50).toISOString());
  assert.equal(billing.transferLock(inDays(-61), NOW).locked, false);

  const card = billing.savedAuthorization({ authorization_code: "AUTH_x", reusable: true, last4: "4081", brand: "visa", exp_month: "12", exp_year: "2030", bin: "408408", signature: "SIG" }, "Ada@Example.com");
  assert.deepEqual(card, { authorization_code: "AUTH_x", reusable: true, last4: "4081", brand: "visa", exp_month: "12", exp_year: "2030", email: "ada@example.com" }, "only the allowed fields");
  assert.equal(billing.savedAuthorization({ reusable: true }, "a@b.c"), null);
  assert.deepEqual(billing.readSavedAuthorization(card), card);
  assert.deepEqual(billing.remindersOf(["r30", 5, "charge"]), ["r30", "charge"]);
  assert.deepEqual(billing.remindersOf(null), []);
});

test("wiring: pay first, verify like store launch, one buyer, Vercel never auto-renews, refunds on failure", () => {
  const server = read("src/lib/domains/billing.server.ts");
  // Verification checks amount, currency, purpose, store, user, purchase, domain and the customer email.
  assert.match(server, /paidKobo\(verified\) !== row\.amountNgn \* 100/);
  assert.match(server, /metadata\.purpose !== PURPOSE\[/);
  assert.match(server, /metadata\.store_id !== row\.storeId/);
  assert.match(server, /metadata\.purchase_id !== row\.id/);
  assert.match(server, /billingEmail\(user\)/);
  // Only one caller moves paid → buying.
  assert.match(server, /updateMany\(\{ where: \{ id: row\.id, status: "paid" \}, data: \{ status: "buying" \} \}\)/);
  assert.match(server, /buyDomainOnVercel\(row\.domain, \{ years: 1, autoRenew: false, maxPrice,/);
  assert.match(server, /setDomainAutoRenewOnVercel\(row\.domain, false\)/);
  assert.match(server, /refundPaystackTransaction\(row\.reference\)/);
  assert.match(server, /status: "refund_failed"/);
  // Buying and renewing only happen inside buyOrRenew, reached from a verified "paid" row.
  const calls = server.match(/(buyDomainOnVercel|renewDomainOnVercel)\(/g) ?? [];
  assert.equal(calls.length, 2);
  assert.ok(server.indexOf("async function buyOrRenew") < server.indexOf("buyDomainOnVercel(row.domain"));

  const purchase = read("src/app/api/domains/purchase/route.ts");
  assert.match(purchase, /if \(process\.env\.DOMAIN_PURCHASE_ENABLED !== "true"\)/);
  assert.doesNotMatch(purchase, /buyDomainOnVercel/, "the route never buys: it starts a payment");
  assert.match(purchase, /startDomainCheckout\(/);
  assert.match(purchase, /storeHasDomainPurchase\(purchases\)/);

  const webhook = read("src/app/api/webhooks/paystack/route.ts");
  assert.match(webhook, /ref\.startsWith\(DOMAIN_REFERENCE_PREFIX\)/);
  assert.match(webhook, /completeDomainPayment\(ref\)/);
  assert.match(read("src/app/api/billing/domain/callback/route.ts"), /completeDomainPayment\(reference\)/);

  const paystack = read("src/lib/paystack.ts");
  assert.match(paystack, /\$\{PAYSTACK_BASE\}\/refund`/);
  // The test-only base URL can never point real payments elsewhere on the live site.
  assert.match(paystack, /VERCEL_ENV !== "production" && process\.env\.PAYSTACK_API_BASE_URL\) \|\| "https:\/\/api\.paystack\.co"/);
  assert.match(paystack, /JSON\.stringify\(\{ transaction: reference \}\)/);
  assert.match(paystack, /transaction\/charge_authorization/);

  const vercel = read("src/lib/domains/vercel.ts");
  assert.match(vercel, /\/v1\/registrar\/domains\/\$\{encodeURIComponent\(domain\)\}\/renew/);
  assert.match(vercel, /\/v1\/registrar\/domains\/\$\{encodeURIComponent\(domain\)\}\/auth-code/);
  assert.match(vercel, /\/v1\/registrar\/domains\/\$\{encodeURIComponent\(domain\)\}\/auto-renew/);
  assert.match(vercel, /expectedPrice: pricing\.renewalPrice,/);

  const cron = read("src/app/api/cron/domain-renewals/route.ts");
  assert.match(cron, /const denied = await cronDenied\(req\);\n  if \(denied\) return denied;/, "the cron secret or a signed QStash call");
  const sql = read("docs/migrations/2026-10-24-domain-billing.sql");
  assert.match(sql, /CREATE TABLE IF NOT EXISTS "DomainPurchase"/);
  assert.match(sql, /ALTER TABLE "DomainPurchase" ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /\/api\/cron\/domain-renewals/);
  assert.match(read("prisma/schema.prisma"), /model DomainPurchase \{[\s\S]*reference\s+String\s+@unique/);
  assert.match(read(".env.local.example"), /DOMAIN_USD_NGN_RATE=\nDOMAIN_MARKUP_NGN=/);
});

test("the buy screen shows naira, confirms before paying, and the connected card can renew and move the domain", () => {
  const setup = read("src/components/builder/DomainSetup.tsx");
  const en = read("shared/i18n/messages/domain/en.ts");
  assert.doesNotMatch(setup, /toFixed\(2\)/, "no USD prices");
  assert.match(setup, /naira\(result\.price\)/);
  assert.match(setup, /<ConfirmPurchase/);
  assert.match(setup, /window\.location\.assign\(payload\.data\.authorizationUrl\)/);
  assert.match(en, /"confirm\.spelled": "Is this spelled right\?"/);
  assert.match(en, /"confirm\.noRefund": "Domains can't be refunded once bought\."/);
  assert.match(en, /"bought\.email": "Check your email in the next 15 days/);
  const ownership = read("src/components/domains/DomainOwnership.tsx");
  assert.match(ownership, /<BoughtDomainPanel domain=\{live\.domain\} \/>/);
  const bought = read("src/components/domains/BoughtDomain.tsx");
  assert.match(bought, /\/api\/domains\/transfer/);
  assert.match(bought, /<SetupHelpRequest/);
  assert.match(read("src/lib/nav.ts"), /href: "\/admin\/domains"/);
});
