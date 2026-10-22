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
const catalog = await import("../shared/plan-catalog.ts");
const { planFeatureLines } = await import("../shared/plans.ts");

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
  // Since the October 2026 pricing the built-in Paystack codes are Starter and Growth (the old Growth and Seller Pro);
  // Pro codes are created from Admin › Pricing › Plans and registered when the server loads the catalog.
  catalog.registerPlanVersions([
    ...catalog.BUILTIN_PLAN_VERSIONS,
    { code: "PLN_testpromonthly", tier: "seller_pro", billing: "monthly", amountNgn: 40000, current: true },
    { code: "PLN_testproannual", tier: "seller_pro", billing: "annual", amountNgn: 400000, current: true },
  ]);
  try {
    const paid = { planCode: "PLN_testpromonthly", planStatus: "active", planPaidUntil: inDays(30) };
    const proAnnual = { planCode: "PLN_testproannual", planStatus: "active", planPaidUntil: inDays(300) };
    const growth = { planCode: "PLN_2gph11w3yd0250y", planStatus: "active", planPaidUntil: inDays(30) };
    const growthAnnual = { planCode: "PLN_9gma70ofldhbj4r", planStatus: "active", planPaidUntil: inDays(300) };
    const starter = { planCode: "PLN_8ou289e71czicvm", planStatus: "active", planPaidUntil: inDays(30) };
    const starterAnnual = { planCode: "PLN_q1k3ssxpx7rxxuz", planStatus: "active", planPaidUntil: inDays(300) };
    assert.equal(rules.canHideShopinbosBadge(proAnnual, NOW), true, "Pro annual");
    assert.equal(rules.canHideShopinbosBadge(growth, NOW), false, "Growth can't (the old Seller Pro monthly code)");
    assert.equal(rules.canHideShopinbosBadge(growthAnnual, NOW), false, "Growth annual can't (the old Seller Pro annual code)");
    assert.equal(rules.canHideShopinbosBadge(starter, NOW), false, "Starter can't");
    assert.equal(rules.canHideShopinbosBadge(starterAnnual, NOW), false, "Starter annual can't");
    assert.equal(rules.showsShopinbosBadge(growth, NOW, { hideShopinbosBadge: true }), true, "Growth keeps the badge even if turned off");
    assert.equal(rules.canHideShopinbosBadge({ planStatus: "active", planPaidUntil: inDays(30) }, NOW), false, "no plan code");
    const free = { planStatus: null, planPaidUntil: null };
    assert.equal(rules.showsShopinbosBadge(paid, NOW, {}), true, "paid, default on");
    assert.equal(rules.showsShopinbosBadge(paid, NOW, { hideShopinbosBadge: true }), false, "paid, turned off");
    assert.equal(rules.showsShopinbosBadge(free, NOW, { hideShopinbosBadge: true }), true, "free can't turn it off");
    assert.equal(rules.showsShopinbosBadge({ planCode: "PLN_testpromonthly", planStatus: "active", planPaidUntil: inDays(-1) }, NOW, { hideShopinbosBadge: true }), true, "comes back when the plan ends");
    assert.equal(rules.canHideShopinbosBadge(paid, NOW), true);
    assert.equal(rules.canHideShopinbosBadge(free, NOW), false);
  } finally {
    catalog.registerPlanVersions([]);
  }
  // Without the admin-created Pro codes loaded, no built-in code can hide it.
  for (const version of catalog.BUILTIN_PLAN_VERSIONS) {
    assert.equal(rules.canHideShopinbosBadge({ planCode: version.code, planStatus: "active", planPaidUntil: inDays(30) }, NOW), false, version.code);
  }
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
  const keys = { payments: ["badges.title", "badges.sub", "badges.preview", "badges.none", "badges.reset", "badges.saved", "badge.transfer", "badge.cod", "err.badges", "plans.f.seller.noBadge"], m_settings: ["money.badgesTitle", "money.badgesHint", "money.badgesNone", "money.badgesReset", "money.badBadges", "money.badge.transfer", "money.badge.cod"] };
  for (const locale of LOCALES) {
    for (const [ns, list] of Object.entries(keys)) {
      const t = tFor(locale, ns);
      for (const key of list) assert.notEqual(t(key), key, `${locale} ${ns}.${key}`);
    }
  }
  // The plan cards (src/components/payments/PlanPicker.tsx) list each plan's features from shared/plans.ts: only Pro
  // lists hiding the badge.
  assert.match(read("src/components/payments/PlanPicker.tsx"), /planFeatureLines\(key\)\.map[\s\S]*t\.dynamic\(`plans\.f\.\$\{role\}\.\$\{line\.id\}`/);
  const hidesBadge = (key) => planFeatureLines(key).some((line) => line.id === "noBadge" && line.included);
  assert.equal(hidesBadge("seller_pro"), true, "Pro lists it");
  for (const key of ["seller_free", "seller_starter", "seller_growth"]) assert.equal(hidesBadge(key), false, key);
});

test("payment logos: only the ways the store really takes payment can be shown or tapped", () => {
  const none = badges.paymentBadgeAvailability({}, { cards: false, korapay: false, transfer: false });
  assert.deepEqual(none.available, []);
  assert.equal(none.blocked.visa, "turn_on_card");
  assert.equal(none.blocked.cod, "turn_on_cod");
  assert.equal(none.blocked.paypal, "not_supported");
  const noWallet = badges.paymentBadgeAvailability({ card: true, transfer: true }, { cards: false, korapay: false, transfer: false });
  assert.equal(noWallet.blocked.visa, "wallet", "card is on but the wallet isn't set up, so cards can't be taken yet");
  assert.equal(noWallet.blocked.transfer, "transfer_bank");
  const korapay = badges.paymentBadgeAvailability({ korapay: true, cod: true }, { cards: false, korapay: true, transfer: false });
  assert.deepEqual(korapay.available, ["visa", "mastercard", "verve", "cod"], "Korapay takes cards but doesn't show the Paystack logo");
  const all = badges.paymentBadgeAvailability({ card: true, transfer: true, cod: true }, { cards: true, korapay: false, transfer: true });
  assert.deepEqual(all.available, ["visa", "mastercard", "verve", "paystack", "transfer", "cod"].filter((key) => badges.PAYMENT_BADGE_KEYS.includes(key)));
  for (const key of badges.UNSUPPORTED_PAYMENT_BADGES) assert.equal(all.available.includes(key), false, key);
  assert.deepEqual(badges.readPaymentBadges({ paymentBadges: ["visa", "opay", "cod"] }, ["visa"]), ["visa"], "a logo saved earlier stops showing once the store can't take it");
});

test("payment logos wired in: saves, the storefront and both pickers use what's available", () => {
  const server = read("src/lib/seller-payments.server.ts");
  assert.match(server, /storeBadgeAvailability/);
  assert.match(read("src/lib/storefront/public-store.server.ts"), /readPaymentBadges\(brandSettings, available\)/);
  assert.match(read("src/app/home/payments/PaymentLogos.tsx"), /disabled=\{off\}|disabled=/);
  assert.match(read("apps/mobile/src/app/payments.tsx"), /disabled=\{!data\.paymentBadges\.available\.includes\(badge\)\}/);
  for (const locale of ["en", "pcm", "yo", "ha", "ig"]) {
    const web = read(`shared/i18n/messages/payments/${locale}.ts`);
    const phone = read(`shared/i18n/messages/m_settings/${locale}.ts`);
    for (const block of ["not_supported", "turn_on_card", "wallet", "turn_on_transfer", "transfer_bank", "turn_on_cod"]) {
      assert.match(web, new RegExp(`"badges\\.block\\.${block}"`), `${locale} web ${block}`);
      assert.match(phone, new RegExp(`"money\\.block\\.${block}"`), `${locale} phone ${block}`);
    }
  }
});
