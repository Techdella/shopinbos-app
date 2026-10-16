// The storefront's footer badges: "Made with Shopinbos" on stores with no paid plan (src/lib/store-badges.ts), and the
// payment logos the seller chooses (shared/payment-badges.ts): the whitelist, the defaults from the payment methods
// they turned on, and the zod check on saves (web action and PATCH /api/app/payments). Plus the wiring that keeps
// the plan private and the badge out of the builder.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const rules = await import("../src/lib/store-badges.ts");
const badges = await import("../shared/payment-badges.ts");
const settings = await import("../src/lib/seller-settings-rules.ts");
const { tFor, LOCALES } = await import("../shared/i18n/catalog.ts");

const DAY = 86_400_000;
const NOW = new Date("2026-10-14T09:00:00Z");
const inDays = (days) => new Date(NOW.getTime() + days * DAY);

// ─── "Built with Shopinbos" ───────────────────────────────────────────────────

test("paid time: any plan with time left, cancelled ones until they run out", () => {
  assert.equal(rules.hasPaidPlanTime(null, NOW), false, "owner unknown");
  assert.equal(rules.hasPaidPlanTime({}, NOW), false, "never paid");
  assert.equal(rules.hasPaidPlanTime({ planStatus: "active", planPaidUntil: inDays(20) }, NOW), true);
  assert.equal(rules.hasPaidPlanTime({ planStatus: "active", planPaidUntil: inDays(300).toISOString() }, NOW), true, "ISO dates from JSON");
  assert.equal(rules.hasPaidPlanTime({ planCode: "PLN_8ou289e71czicvm", planStatus: "active", planPaidUntil: inDays(3) }, NOW), true, "monthly plans count");
  assert.equal(rules.hasPaidPlanTime({ planStatus: "active", planPaidUntil: inDays(-1) }, NOW), false, "lapsed");
  assert.equal(rules.hasPaidPlanTime({ planStatus: "active", planPaidUntil: NOW }, NOW), false, "paid until exactly now is over");
  assert.equal(rules.hasPaidPlanTime({ planStatus: "active", planPaidUntil: null }, NOW), false);
  assert.equal(rules.hasPaidPlanTime({ planStatus: "active", planPaidUntil: "not a date" }, NOW), false);
  // Cancelled plans keep what was paid for until the paid time runs out.
  assert.equal(rules.hasPaidPlanTime({ planStatus: "cancelled", planPaidUntil: inDays(20) }, NOW), true);
  assert.equal(rules.hasPaidPlanTime({ planStatus: "non_renewing", planPaidUntil: inDays(20) }, NOW), true);
  assert.equal(rules.hasPaidPlanTime({ planStatus: "cancelled", planPaidUntil: inDays(-1) }, NOW), false, "cancelled and run out");
});

test("badge: on for every store by default; only a seller on the Pro plan with paid time can turn it off", () => {
  const paid = { planCode: "PLN_2gph11w3yd0250y", planStatus: "active", planPaidUntil: inDays(30) };
  const proAnnual = { planCode: "PLN_9gma70ofldhbj4r", planStatus: "active", planPaidUntil: inDays(300) };
  const growth = { planCode: "PLN_8ou289e71czicvm", planStatus: "active", planPaidUntil: inDays(30) };
  const growthAnnual = { planCode: "PLN_q1k3ssxpx7rxxuz", planStatus: "active", planPaidUntil: inDays(300) };
  assert.equal(rules.canHideShopinbosBadge(proAnnual, NOW), true, "Pro annual");
  assert.equal(rules.canHideShopinbosBadge(growth, NOW), false, "Growth can't");
  assert.equal(rules.canHideShopinbosBadge(growthAnnual, NOW), false, "Growth annual can't");
  assert.equal(rules.showsShopinbosBadge(growth, NOW, { hideShopinbosBadge: true }), true, "Growth keeps the badge even if turned off");
  assert.equal(rules.canHideShopinbosBadge({ planStatus: "active", planPaidUntil: inDays(30) }, NOW), false, "no plan code");
  const free = { planStatus: null, planPaidUntil: null };
  assert.equal(rules.showsShopinbosBadge(paid, NOW, {}), true, "paid, default on");
  assert.equal(rules.showsShopinbosBadge(paid, NOW, { hideShopinbosBadge: true }), false, "paid, turned off");
  assert.equal(rules.showsShopinbosBadge(free, NOW, { hideShopinbosBadge: true }), true, "free can't turn it off");
  assert.equal(rules.showsShopinbosBadge({ planCode: "PLN_2gph11w3yd0250y", planStatus: "active", planPaidUntil: inDays(-1) }, NOW, { hideShopinbosBadge: true }), true, "comes back when the plan ends");
  assert.equal(rules.canHideShopinbosBadge(paid, NOW), true);
  assert.equal(rules.canHideShopinbosBadge(free, NOW), false);
});

test("badge link: app sign-up tagged with the store, new tab, noopener", () => {
  assert.equal(rules.shopinbosBadgeHref("ada-styles"), "https://app.shopinbos.com/signup?ref=store_badge&s=ada-styles");
  assert.equal(rules.shopinbosBadgeHref("ada-styles", "https://app.example.com/"), "https://app.example.com/signup?ref=store_badge&s=ada-styles");
  assert.equal(rules.shopinbosBadgeHref("a b&c"), "https://app.shopinbos.com/signup?ref=store_badge&s=a%20b%26c");
  const footer = read("src/components/storefront/shopper/StoreFooterBadges.tsx");
  assert.match(footer, /target="_blank"/);
  assert.match(footer, /rel="noopener"/);
  assert.match(footer, /Built with <strong[^>]*>Shopinbos<\/strong>/);
});

// ─── Payment logos ───────────────────────────────────────────────────────────

test("payment logos: the whitelist", () => {
  assert.deepEqual([...badges.PAYMENT_BADGE_KEYS], ["visa", "mastercard", "verve", "amex", "paypal", "applepay", "googlepay", "paystack", "flutterwave", "opay", "transfer", "cod"]);
  for (const key of badges.PAYMENT_BADGE_KEYS) assert.ok(badges.PAYMENT_BADGE_LABELS[key], key);
  assert.equal(badges.isPaymentBadgeKey("visa"), true);
  assert.equal(badges.isPaymentBadgeKey("bitcoin"), false);
  assert.equal(badges.isPaymentBadgeKey("toString"), false);
  // Unknown keys go, duplicates go, store order wins.
  assert.deepEqual(badges.cleanPaymentBadges(["cod", "bitcoin", "visa", "visa", 3, null]), ["visa", "cod"]);
  assert.deepEqual(badges.cleanPaymentBadges("visa"), []);
});

test("payment logos: defaults come from the payment methods the store turned on", () => {
  assert.deepEqual(badges.defaultPaymentBadges({ card: true, transfer: true, cod: true, wa: true }), ["visa", "mastercard", "verve", "transfer", "cod"]);
  assert.deepEqual(badges.defaultPaymentBadges({ card: false, transfer: true, cod: false }), ["transfer"]);
  assert.deepEqual(badges.defaultPaymentBadges({ wa: true }), []);
  // Never saved anything: checkout offers card only, so card logos only.
  assert.deepEqual(badges.readPaymentBadges({}), ["visa", "mastercard", "verve"]);
  assert.deepEqual(badges.readPaymentBadges(null), ["visa", "mastercard", "verve"]);
  assert.deepEqual(badges.readPaymentBadges({ paymentConfig: { methods: { card: false, transfer: true, cod: true } } }), ["transfer", "cod"]);
  // The seller's pick wins, including "none".
  assert.deepEqual(badges.readPaymentBadges({ paymentBadges: ["opay", "paystack"], paymentConfig: { methods: { card: true } } }), ["paystack", "opay"]);
  assert.deepEqual(badges.readPaymentBadges({ paymentBadges: [], paymentConfig: { methods: { card: true } } }), []);
  assert.equal(badges.hasChosenPaymentBadges({ paymentBadges: [] }), true);
  assert.equal(badges.hasChosenPaymentBadges({}), false);
});

test("payment logos: zod check for saves", () => {
  assert.deepEqual(rules.parsePaymentBadges(["cod", "visa"]), { ok: true, badges: ["visa", "cod"] });
  assert.deepEqual(rules.parsePaymentBadges([]), { ok: true, badges: [] });
  for (const bad of [["bitcoin"], ["visa", "visa"], "visa", null, { visa: true }, [1]]) {
    const result = rules.parsePaymentBadges(bad);
    assert.equal(result.ok, false, JSON.stringify(bad));
    assert.ok(result.message.length > 5);
  }
  // PATCH /api/app/payments accepts paymentBadges on its own, and rejects unknown logos.
  assert.deepEqual(settings.PaymentsPatchSchema.parse({ paymentBadges: ["paypal", "applepay"] }), { paymentBadges: ["paypal", "applepay"] });
  assert.equal(settings.PaymentsPatchSchema.safeParse({ paymentBadges: ["cashapp"] }).success, false);
  assert.equal(settings.PaymentsPatchSchema.safeParse({}).success, false);
});

// ─── Wiring ──────────────────────────────────────────────────────────────────

test("storefront loaders expose showBadge and paymentBadges, never the owner's plan", () => {
  const loader = read("src/lib/storefront/public-store.server.ts");
  assert.match(loader, /showsShopinbosBadge\(owner, new Date\(\), brandSettings\)/);
  assert.match(loader, /const \{ userId: _userId, user: owner, \.\.\.store \} = row;/, "the owner row is dropped from the public payload");
  assert.match(loader, /export interface StoreBrand extends StoreBadges/);
  for (const layout of ["src/app/s/[slug]/layout.tsx", "src/app/_domain/[domain]/layout.tsx"]) {
    assert.match(read(layout), /showBadge: brand\.showBadge, paymentBadges: brand\.paymentBadges/, layout);
  }
});

test("badges render in every storefront footer and the checkout, not in the builder", () => {
  assert.match(read("src/components/storefront/boutique/BoutiqueChrome.tsx"), /<StoreFooterBadges /);
  assert.match(read("src/components/storefront/TemplateStorefrontSurface.tsx"), /<StoreFooterBadges /);
  assert.match(read("src/components/cms/storefront/CmsPages.tsx"), /<StoreFooterBadges /);
  assert.match(read("src/components/storefront/shopper/ShopperShell.tsx"), /<StoreFootnote /);
  assert.match(read("src/app/s/[slug]/checkout/CheckoutClient.tsx"), /<WeAccept /);
  // The footers read the storefront layout's provider; the builder has none.
  assert.doesNotMatch(read("src/components/builder/editor/Builder.tsx"), /StoreBrandProvider/);
  // No hosted images for the logos.
  assert.doesNotMatch(read("src/components/storefront/shopper/PaymentBadges.tsx"), /<img|https?:\/\//);
});

test("words: every new key in all five languages", () => {
  const keys = { payments: ["badges.title", "badges.sub", "badges.preview", "badges.none", "badges.reset", "badges.saved", "badge.transfer", "badge.cod", "err.badges", "plan.noBadge"], m_settings: ["money.badgesTitle", "money.badgesHint", "money.badgesNone", "money.badgesReset", "money.badBadges", "money.badge.transfer", "money.badge.cod"] };
  for (const locale of LOCALES) {
    for (const [ns, list] of Object.entries(keys)) {
      const t = tFor(locale, ns);
      for (const key of list) assert.notEqual(t(key), key, `${locale} ${ns}.${key}`);
    }
  }
  assert.match(read("src/components/payments/SellerBillingSection.tsx"), /t\("plan\.noBadge"\)/);
});
