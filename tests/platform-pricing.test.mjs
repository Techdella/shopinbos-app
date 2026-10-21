// Admin › Pricing (shared/platform-pricing.ts, src/lib/pricing/price-book.server.ts, /admin/pricing): the price
// registry's defaults match what Shopinbos charged before, saved values are checked against each setting's range,
// the old environment variables still set the defaults, and source checks that every price reader uses the book
// and that delivery partners can no longer change the platform fee.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const pricing = await import("../shared/platform-pricing.ts");
const credits = await import("../shared/ai-credits.ts");
const ads = await import("../shared/ad-campaigns.ts");
const domains = await import("../src/lib/domains/billing-pure.ts");
const mobileAds = await import("../apps/mobile/src/lib/ads-pure.ts");

test("the defaults are today's prices", () => {
  const book = pricing.resolvePriceBook({});
  assert.equal("launch.price" in book, false, "there is no store launch fee");
  assert.deepEqual(
    pricing.creditPackPrices(book).map(({ id, credits, naira }) => ({ id, credits, naira })),
    credits.CREDIT_PACKS.map(({ id, credits, naira }) => ({ id, credits, naira })),
  );
  assert.deepEqual(pricing.creditCosts(book), { ...credits.DEFAULT_COSTS });
  assert.equal(book["credits.welcome"], credits.WELCOME_CREDITS);
  assert.deepEqual(pricing.adSetupFees(book), ads.AD_SETUP_FEES);
  assert.equal(book["ads.min_daily_budget"], ads.MIN_DAILY_BUDGET.NGN);
  const domainDefaults = domains.domainPricingConfig({});
  assert.deepEqual({ usdNgnRate: book["domains.usd_rate"], markupNgn: book["domains.markup"], maxUsd: book["domains.max_usd"] }, domainDefaults);
  // October 2026 fees, by plan.
  assert.deepEqual(["seller_free", "seller_starter", "seller_growth", "seller_pro"].map((plan) => pricing.storeFeeConfig(book, plan).rate), [3, 2, 1, 0.5]);
  assert.deepEqual(pricing.storeFeeConfig(book), { rate: 3, minFee: 0, maxFee: 0 }, "an unknown plan pays the free plan's fee");
  assert.deepEqual(["supplier_free", "supplier_plus", "supplier_pro"].map((plan) => pricing.supplierCommissionPct(book, plan)), [6, 4, 3]);
  assert.deepEqual(pricing.logisticsJobFee(book, "logistics_plus"), { rate: 3, charged: false, effectiveRate: 0 }, "the job fee is off at launch");
  assert.deepEqual(pricing.logisticsJobFee(pricing.resolvePriceBook({ "delivery.enabled": "on" }), "logistics_pro"), { rate: 2, charged: true, effectiveRate: 2 });
  assert.deepEqual(pricing.boostPrices(book), { supplierWeek: 3000, logisticsStateWeek: 2000, productWeek: 1000 });
  assert.deepEqual(pricing.addonPrices(book), { smsPack: 4000, whatsappPack: 5000, staffSeat: 1000 });
});

test("the old environment variables still set the defaults", () => {
  const env = { DOMAIN_USD_NGN_RATE: "1500", DOMAIN_MARKUP_NGN: "0", DOMAIN_PURCHASE_MAX_USD: "35" };
  const book = pricing.resolvePriceBook({}, env);
  assert.deepEqual({ usdNgnRate: book["domains.usd_rate"], markupNgn: book["domains.markup"], maxUsd: book["domains.max_usd"] }, domains.domainPricingConfig(env));
  // A bad variable falls back to the built-in number.
  assert.equal(pricing.resolvePriceBook({}, { DOMAIN_USD_NGN_RATE: "abc" })["domains.usd_rate"], domains.domainPricingConfig({}).usdNgnRate);
  // A saved value beats the variable.
  assert.equal(pricing.resolvePriceBook({ "domains.usd_rate": 1700 }, env)["domains.usd_rate"], 1700);
});

test("saved values are checked against each setting", () => {
  assert.equal(pricing.cleanPriceValue("store_fee.growth", "1.5"), 1.5);
  assert.equal(pricing.cleanPriceValue("store_fee.growth", "31"), null, "the fee can't be more than 30%");
  assert.equal(pricing.cleanPriceValue("supplier_fee.free", "-1"), null);
  assert.equal(pricing.cleanPriceValue("ads.min_daily_budget", "₦8,500"), 8500, "naira signs and commas are fine");
  assert.equal(pricing.cleanPriceValue("ads.min_daily_budget", "8500.5"), null, "naira prices are whole");
  assert.equal(pricing.cleanPriceValue("ads.min_daily_budget", "50"), null, "below the smallest daily budget");
  assert.equal(pricing.cleanPriceValue("credits.cost.image", "0"), null, "a request always costs at least a credit");
  assert.equal(pricing.cleanPriceValue("credits.welcome", "0"), 0, "new accounts can start with none");
  assert.equal(pricing.cleanPriceValue("ads.min_daily_budget", ""), null);
  assert.equal(pricing.cleanPriceValue("delivery.enabled", "on"), "on");
  assert.equal(pricing.cleanPriceValue("delivery.enabled", "maybe"), null);
  assert.equal(pricing.isPriceKey("ads.min_daily_budget"), true);
  assert.equal(pricing.isPriceKey("launch.price"), false);
  assert.equal(pricing.isPriceKey("toString"), false);
  // An invalid saved value is ignored rather than breaking checkout.
  assert.equal(pricing.resolvePriceBook({ "ads.min_daily_budget": "lots" })["ads.min_daily_budget"], 1000);
});

test("promotions override saved prices", () => {
  const book = pricing.resolvePriceBook({ "ads.setup.meta": 20000 }, {}, { "ads.setup.meta": 15000 });
  assert.equal(book["ads.setup.meta"], 15000);
  assert.equal(book["ads.setup.tiktok"], 30000);
});

test("live credit packs keep their labels", () => {
  const book = pricing.resolvePriceBook({ "credits.medium.naira": 5000, "credits.medium.credits": 250 });
  const packs = credits.creditPacksFrom(book);
  const medium = credits.creditPack("medium", packs);
  assert.equal(medium.naira, 5000);
  assert.equal(medium.credits, 250);
  assert.equal(medium.badge, "Most popular");
  assert.equal(credits.packKobo(medium), 500_000);
  assert.equal(credits.creditCost("image", 2, { ...credits.DEFAULT_COSTS, image: 7 }), 14);
  assert.equal(credits.shouldAutoTopUp({ autoTopUp: true, hasCard: true, packId: "small", need: 70, balance: 0, autoChargesToday: 0, packs: credits.creditPacksFrom(pricing.resolvePriceBook({ "credits.small.credits": 80 })) }), true);
});

test("ad minimums: the schema allows the lowest admin setting, the phone uses the server's", () => {
  assert.equal(ads.NGN_BUDGET_FLOOR, pricing.PRICE_SETTINGS["ads.min_daily_budget"].min);
  assert.equal(mobileAds.minBudget("NGN", 500), 500);
  assert.equal(mobileAds.minBudget("NGN"), 1000);
  assert.equal(mobileAds.minBudget("USD", 500), 1);
  assert.equal(mobileAds.modeFee("managed_tiktok", { meta: 1, tiktok: 2 }), 2);
  assert.equal(pricing.formatPriceValue("ads.setup.meta", 20000), "₦20,000");
  assert.equal(pricing.formatPriceValue("store_fee.growth", 1.5), "1.5%");
  assert.equal(pricing.formatPriceValue("delivery.enabled", "off"), "Off (0%)");
});

test("every price reader uses the price book", () => {
  assert.match(read("src/lib/wallet/wallet.server.ts"), /storeFeeConfig\(prices, /);
  assert.doesNotMatch(read("src/lib/wallet/wallet.server.ts"), /platformFeeConfig/);
  assert.match(read("src/lib/ai/credits.server.ts"), /creditPacksFrom\(book\)/);
  assert.match(read("src/lib/ai/usage.ts"), /liveCreditPrices\(\)\)\.costs/);
  assert.match(read("src/lib/ad-campaigns/requests.server.ts"), /adSetupFees\(await getPriceBook\(\)\)/);
  assert.match(read("src/lib/ad-campaigns/campaigns.server.ts"), /ads\.min_daily_budget/);
  assert.match(read("src/lib/domains/billing.server.ts"), /book\["domains\.usd_rate"\]/);
  assert.doesNotMatch(read("src/lib/domains/billing.server.ts"), /domainPricingConfig\(process\.env\)/);
});

test("delivery partners see the platform fee but can't change it", () => {
  const actions = read("src/app/actions/billing.ts");
  assert.doesNotMatch(actions, /updateFeeBearer/);
  assert.doesNotMatch(actions, /platformFeeConfig\.(update|create)/);
  const page = read("src/app/logistics/billing/page.tsx");
  assert.doesNotMatch(page, /<form/);
  assert.match(page, /logisticsJobFee\(book, plan\)/);
});

test("Admin › Pricing: admin only, saves with history, in the nav", () => {
  assert.ok(existsSync(new URL("../src/app/admin/pricing/page.tsx", import.meta.url)));
  assert.match(read("src/app/admin/pricing/page.tsx"), /requireRole\(\["admin"\]/);
  assert.match(read("src/app/actions/pricing.ts"), /requireAdminSection\("money"\)/);
  const server = read("src/lib/pricing/price-book.server.ts");
  assert.match(server, /\$transaction/);
  assert.match(server, /platformSettingChange\.createMany/);
  assert.match(read("src/lib/nav.ts"), /href: "\/admin\/pricing"/);
  const sql = read("docs/migrations/2026-11-09-platform-pricing.sql");
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /ON CONFLICT \("key"\) DO NOTHING/);
  for (const key of ["store_fee.min", "store_fee.max"]) assert.match(sql, new RegExp(`'price\\.${key.replace(".", "\\.")}'`));
});
