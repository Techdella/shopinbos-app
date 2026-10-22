// Checkout page layouts: settings with per-theme (and classic) defaults, the Steps layout's validation helpers, the
// order summary's blocks, the builder fields, and the wiring between the builder preview and the live checkout.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const co = await import("../src/components/storefront/checkout/checkout-layout.ts");
const schema = await import("../src/components/builder/editor/section-schema.ts");

const checkoutPage = (settings = {}, copy = {}) => ({
  pages: [
    { pageType: "home", sections: [{ kind: "header", blocks: [{ type: "copy", content: { navLinks: ["home", "shop", "about", "blog", "home"] } }] }] },
    { pageType: "products", sections: [] },
    { pageType: "about", sections: [] },
    { pageType: "checkout", sections: [{ kind: "checkout-form", settings, blocks: [{ type: "copy", content: copy }] }] },
  ],
});

const DETAILS = { name: "Ada Obi", email: "ada@example.com", phone: "08031234567", street: "12 Admiralty Way", city: "Lekki", state: "Lagos", country: "Nigeria", landmark: "" };
const RULES = { requirePhone: false, requireState: true, deliveryOptionIds: ["std"], paymentMethods: ["paystack", "pay_on_delivery"] };

test("checkout settings fall back to each theme's own layout, summary side and header", () => {
  assert.equal(co.readCheckoutPageSettings(null, "noir").layout, "minimal");
  assert.equal(co.readCheckoutPageSettings(null, "plug").layout, "steps");
  assert.equal(co.readCheckoutPageSettings(null, "pantry").layout, "stacked");
  assert.equal(co.readCheckoutPageSettings(null, "adire").summaryPosition, "left");
  assert.equal(co.readCheckoutPageSettings(null, "ewa").header, "nav");
  const unknown = co.readCheckoutPageSettings(null, "not-a-theme");
  assert.equal(unknown.layout, "two-column", "two columns is the default");
  assert.equal(unknown.summaryPosition, "right");
  assert.equal(unknown.header, "logo");
  assert.deepEqual(unknown.summaryBlocks, co.DEFAULT_SUMMARY_BLOCKS);
  assert.equal(unknown.thumbnails, true);
  assert.equal(unknown.orderNote, true);
  assert.equal(unknown.message, "");
  assert.deepEqual(unknown.labels, { placeOrder: "", continue: "", summary: "Order summary" });
  // Every theme has a default the panel can offer.
  const layouts = co.CHECKOUT_LAYOUT_OPTIONS.map((option) => option.value);
  assert.deepEqual(layouts, ["two-column", "stacked", "steps", "minimal"]);
  for (const [theme, defaults] of Object.entries(co.CHECKOUT_THEME_DEFAULTS)) assert.ok(layouts.includes(defaults.layout), theme);
});

test("the seller's choices win, and junk falls back", () => {
  const settings = co.checkoutSettingsForSnapshot(
    checkoutPage(
      { checkoutLayout: "steps", summaryPosition: "left", checkoutHeader: "nav", summaryThumbnails: false, orderNote: false, summaryBlocks: ["trust", "items", "trust", "bogus", "whatsapp"] },
      { checkoutMessage: "  Orders before 2pm leave today.  ", placeOrderLabel: " Complete order ", continueLabel: "Next", summaryTitle: "Your bag" },
    ),
    "noir",
    "boutique",
  );
  assert.equal(settings.layout, "steps");
  assert.equal(settings.summaryPosition, "left");
  assert.equal(settings.header, "nav");
  assert.equal(settings.thumbnails, false);
  assert.equal(settings.orderNote, false);
  assert.deepEqual(settings.summaryBlocks, ["trust", "items", "whatsapp"], "duplicates and unknown blocks dropped, order kept");
  assert.equal(settings.message, "Orders before 2pm leave today.");
  assert.deepEqual(settings.labels, { placeOrder: "Complete order", continue: "Next", summary: "Your bag" });

  const junk = co.readCheckoutPageSettings({ settings: { checkoutLayout: "carousel", summaryPosition: "top", checkoutHeader: 3, summaryBlocks: "items" } }, "plug");
  assert.equal(junk.layout, "steps");
  assert.equal(junk.summaryPosition, "right");
  assert.equal(junk.header, "logo");
  assert.deepEqual(junk.summaryBlocks, co.DEFAULT_SUMMARY_BLOCKS);
  // An empty list is a choice: every block hidden.
  assert.deepEqual(co.readCheckoutPageSettings({ settings: { summaryBlocks: [] } }, "plug").summaryBlocks, []);
  assert.equal(co.readCheckoutPageSettings({ blocks: [{ type: "copy", content: { checkoutMessage: "x".repeat(400) } }] }, "").message.length, 280);
});

test("classic templates start from their saved checkout layout", () => {
  assert.equal(co.readClassicCheckoutSettings({ settings: { layout: "multi-step" } }).layout, "steps");
  assert.equal(co.readClassicCheckoutSettings({ settings: { layout: "minimal" } }).layout, "minimal");
  assert.equal(co.readClassicCheckoutSettings({ settings: { layout: "single-page" } }).layout, "two-column");
  assert.equal(co.readClassicCheckoutSettings({ settings: { layout: "weird" } }).layout, "two-column");
  assert.equal(co.readClassicCheckoutSettings(null).layout, "two-column");
  assert.equal(co.readClassicCheckoutSettings({ settings: { layout: "multi-step", checkoutLayout: "stacked" } }).layout, "stacked", "the seller's choice wins");
  assert.equal(co.checkoutSettingsForSnapshot(checkoutPage({ layout: "multi-step" }), "", "classic").layout, "steps");
  assert.equal(co.checkoutSettingsForSnapshot(null, "", "classic").layout, "two-column");
});

test("minimal is always logo only; two columns and steps put the summary beside the form", () => {
  assert.equal(co.showsHeaderNav({ layout: "minimal", header: "nav" }), false);
  assert.equal(co.showsHeaderNav({ layout: "stacked", header: "nav" }), true);
  assert.equal(co.showsHeaderNav({ layout: "two-column", header: "logo" }), false);
  assert.deepEqual(["two-column", "stacked", "steps", "minimal"].map(co.hasSideSummary), [true, false, true, false]);
  // Header links: the home header's links that exist, deduplicated, "shop" read as the shop page.
  assert.deepEqual(co.checkoutNavLinks(checkoutPage()).map((link) => link.key), ["home", "products", "about"]);
  assert.deepEqual(co.checkoutNavLinks(null), []);
});

test("steps: three steps for the Steps layout, one page otherwise", () => {
  assert.deepEqual(co.stepsFor("steps"), ["contact", "delivery", "payment"]);
  for (const layout of ["two-column", "stacked", "minimal"]) assert.deepEqual(co.stepsFor(layout), []);
  assert.deepEqual([0, 1, 2].map((index) => co.stepProgress(index, 3)), [33, 67, 100]);
  assert.equal(co.stepProgress(9, 3), 100);
  assert.equal(co.stepProgress(0, 0), 100);
});

test("steps: validation per step, merged in page order for one page", () => {
  const empty = { ...DETAILS, name: "", email: "nope", street: "", city: "" };
  const all = co.errorsForSteps(co.LAYOUT_STEPS, empty, RULES, { deliveryOptionId: "std", paymentMethod: "paystack" });
  assert.deepEqual(co.errorFields(all), ["name", "email", "street", "city"]);
  assert.equal(co.firstStepWithErrors(co.LAYOUT_STEPS, empty, RULES), 0);
  assert.equal(co.firstStepWithErrors(co.LAYOUT_STEPS, { ...DETAILS, street: "" }, RULES), 1);
  assert.equal(co.firstStepWithErrors(co.LAYOUT_STEPS, DETAILS, RULES, { paymentMethod: "transfer" }), 2, "a method that isn't on offer stops at payment");
  assert.equal(co.firstStepWithErrors(co.LAYOUT_STEPS, DETAILS, RULES), -1);

  // Pay on delivery needs a phone: on one page the error lands on the contact phone field (only one is shown).
  const pod = co.errorsForSteps(co.LAYOUT_STEPS, { ...DETAILS, phone: "" }, RULES, { paymentMethod: "pay_on_delivery" });
  assert.deepEqual(Object.keys(pod), ["phone"]);
  assert.match(pod.phone, /rider/);
  // A contact error on the same field wins over the payment one (shown first).
  const both = co.errorsForSteps(co.LAYOUT_STEPS, { ...DETAILS, phone: "12" }, RULES, { paymentMethod: "pay_on_delivery" });
  assert.match(both.phone, /7 to 15 digits/);

  assert.equal(co.resumeStepIndex(DETAILS, RULES), 2, "a returning shopper with everything saved starts at payment");
  assert.equal(co.resumeStepIndex({ ...DETAILS, city: "" }, RULES), 1);
  assert.equal(co.reachedCheckoutStep(DETAILS, RULES), "review");
  assert.equal(co.reachedCheckoutStep({ ...DETAILS, email: "" }, RULES), "contact");
});

test("errors are summarised for screen readers in page order", () => {
  assert.equal(co.errorSummaryText({}), "");
  assert.equal(co.errorSummaryText({ city: "Enter your area or city.", name: "Enter your full name." }), "Check 2 things: Full name, Area or city.");
  assert.equal(co.errorSummaryText({ email: "Enter your email so we can send your receipt." }), "Check email: Enter your email so we can send your receipt.");
  assert.deepEqual(co.errorFields({ paymentMethod: "x", phone: "y", deliveryOption: "z" }), ["phone", "deliveryOption", "paymentMethod"]);
});

test("button labels: the seller's own, else the step or the total", () => {
  const plain = co.readCheckoutPageSettings(null, "");
  assert.equal(co.continueLabel(plain, "delivery"), "Continue to delivery");
  assert.equal(co.continueLabel(plain, undefined), "Continue");
  assert.equal(co.continueLabel({ labels: { continue: "Next" } }, "delivery"), "Next");
  assert.equal(co.placeOrderLabel(plain, { paystack: false, total: 5000, currency: "NGN" }), "Place order");
  assert.match(co.placeOrderLabel(plain, { paystack: true, total: 5000, currency: "NGN" }), /^Pay ₦5,000/);
  assert.equal(co.placeOrderLabel({ labels: { placeOrder: "Complete order" } }, { paystack: true, total: 5000, currency: "NGN" }), "Complete order");
});

test("summary blocks: totals follow the items and code box; blocks without data stay hidden", () => {
  assert.deepEqual(co.splitSummaryBlocks(["trust", "items", "whatsapp", "discount"]), { beforeTotals: ["items", "discount"], afterTotals: ["trust", "whatsapp"] });
  const none = { coupon: false, trustEnabled: true, trustCount: 0, deliveryEstimate: null, whatsapp: false, returns: false };
  assert.deepEqual(co.visibleSummaryBlocks(co.DEFAULT_SUMMARY_BLOCKS, none), ["items", "secure"]);
  const all = { coupon: true, trustEnabled: true, trustCount: 2, deliveryEstimate: "Usually delivered in 1-2 days", whatsapp: true, returns: true };
  assert.deepEqual(co.visibleSummaryBlocks(["whatsapp", "items"], all), ["whatsapp", "items"], "the seller's order is kept");
  assert.equal(co.visibleSummaryBlocks(["trust"], { ...all, trustEnabled: false }).length, 0, "Checkout settings' trust badge switch still applies");
  for (const block of ["discount", "trust", "delivery", "whatsapp", "returns"]) assert.ok(co.summaryBlockMissing(block, none), `${block} explains why it's hidden`);
  assert.equal(co.summaryBlockMissing("items", none), null);
});

test("trust badges, delivery estimate and help link come only from the store's real settings", () => {
  const zone = (extra) => ({ name: "Lagos", regions: ["Lagos"], fee: 2000, freeOver: null, alwaysFree: false, estimatedDays: null, pickupOnly: false, ...extra });
  assert.deepEqual(co.checkoutTrustBadges({ delivery: [], flatRate: null, payOnDelivery: false, paymentLabels: [] }), [], "nothing set, nothing promised");
  const badges = co.checkoutTrustBadges({ delivery: [zone({ freeOver: 50000, regions: [] })], flatRate: null, payOnDelivery: true, paymentLabels: ["Card", "Transfer", "USSD", "Pay on delivery"] });
  assert.deepEqual(badges.map((badge) => badge.title), ["Free delivery over ₦50,000", "Pay on delivery", "Pay by card or transfer"]);
  assert.equal(co.checkoutTrustBadges({ delivery: [zone()], flatRate: null, payOnDelivery: false, paymentLabels: [] })[0].title, "Delivery to your door");

  assert.equal(co.deliveryEstimateText({ delivery: [zone()] }), null);
  assert.equal(co.deliveryEstimateText({ delivery: [zone({ estimatedDays: "1-2 days" }), zone({ name: "Rest", regions: [], estimatedDays: "1-2 days" })] }), "Usually delivered in 1-2 days");
  assert.equal(co.deliveryEstimateText({ delivery: [zone({ estimatedDays: "1-2 days" }), zone({ name: "Rest", regions: [], estimatedDays: "3-5 days" })] }), "1-2 days in Lagos, 3-5 days elsewhere");
  assert.equal(co.deliveryEstimateText({ delivery: [] }, { estimatedDays: "Same day", pickup: false }), "Arrives in Same day");
  assert.equal(co.deliveryEstimateText({ delivery: [zone({ pickupOnly: true, estimatedDays: "2 days" })] }), null, "pickup zones aren't a delivery time");

  assert.equal(co.whatsappHelpHref(null, "Ada's"), null);
  assert.match(co.whatsappHelpHref("2348031234567", "Ada's"), /^https:\/\/wa\.me\/2348031234567\?text=Hi%20Ada's/);
  assert.equal(co.secureCheckoutText(["Card", "Pay on delivery"]), "Secure checkout: Card");
  assert.equal(co.secureCheckoutText([]), "Secure checkout");
});

test("the builder preview uses the store's own products, or a marked sample bag", () => {
  const own = co.previewBag([{ id: "a", name: "No photo", images: [], retailPrice: 1000 }, { id: "b", name: "Bag", images: ["https://cdn.example/b.jpg"], retailPrice: 25000 }]);
  assert.equal(own.sample, false);
  assert.deepEqual(own.lines.map((line) => line.productId), ["b", "a"], "products with a photo first");
  assert.equal(own.lines[0].image, "https://cdn.example/b.jpg");
  const sample = co.previewBag([]);
  assert.equal(sample.sample, true);
  assert.ok(sample.lines.length > 0 && sample.lines.every((line) => /sample/i.test(line.name)));
  assert.deepEqual(co.previewPaymentMethods({ paymentLabels: ["Card", "USSD"], payOnDelivery: true }), { card: true, transfer: false, cod: true });
  assert.equal(co.previewPaymentMethods({ paymentLabels: [], payOnDelivery: false }), null);
  // With the store's settings loaded, the preview shows the seller's own choices, Korapay included.
  const brandSettings = { paymentConfig: { methods: { card: false, korapay: true, transfer: true, cod: false, wa: true } } };
  assert.deepEqual(co.previewPaymentMethods({ paymentLabels: ["Card", "Transfer"], payOnDelivery: false }, brandSettings), brandSettings.paymentConfig.methods);
  assert.deepEqual(co.previewPaymentMethods({ paymentLabels: ["Card"], payOnDelivery: false }, {}), { card: true, transfer: false, cod: false }, "nothing saved: the labels");
  assert.match(read("src/components/storefront/checkout/CheckoutPreview.tsx"), /previewPaymentMethods\(info, store\.brandSettings\)/);
});

test("builder fields for the checkout section match what the layout draws", () => {
  const section = (settings = {}) => ({ id: "c", kind: "checkout-form", name: "Checkout", visible: true, blocks: [{ id: "k", type: "copy", content: {} }], settings });
  const ids = (sec, renderer, theme = "") => schema.visibleFields(sec, renderer, theme).map((field) => field.id);

  const noir = schema.visibleFields(section(), "boutique", "noir");
  assert.equal(noir.find((field) => field.id === "checkoutLayout").fallback, "minimal", "the panel shows the theme's own layout");
  assert.ok(!noir.some((field) => field.id === "checkoutHeader"), "minimal is always logo only");
  assert.ok(!noir.some((field) => field.id === "summaryPosition"), "minimal has no side summary");
  const order = noir.find((field) => field.id === "summaryBlocks");
  assert.equal(order.type, "order");
  assert.deepEqual(order.fallback, co.DEFAULT_SUMMARY_BLOCKS);

  const steps = ids(section({ checkoutLayout: "steps" }), "boutique", "noir");
  for (const id of ["summaryPosition", "checkoutHeader", "continueLabel", "placeOrderLabel", "checkoutMessage", "summaryThumbnails", "orderNote"]) assert.ok(steps.includes(id), id);
  assert.ok(!ids(section({ checkoutLayout: "stacked" }), "boutique", "noir").includes("continueLabel"), "continue button only for steps");
  assert.ok(ids(section(), "boutique", "plug").includes("continueLabel"), "plug's default layout is steps");

  // Classic: the saved classic layout picks the starting layout, so the fields follow it.
  assert.ok(ids(section({ layout: "multi-step" }), "classic").includes("continueLabel"));
  assert.ok(!ids(section({ layout: "single-page" }), "classic").includes("continueLabel"));
  assert.ok(!ids(section({ layout: "minimal" }), "classic").includes("checkoutHeader"));
  assert.ok(!ids(section({ layout: "minimal", checkoutLayout: "two-column" }), "classic").includes("continueLabel"));
  assert.ok(ids(section({ layout: "minimal", checkoutLayout: "two-column" }), "classic").includes("checkoutHeader"));
  for (const layout of ["single-page", "multi-step", "minimal", undefined]) {
    const visible = ids(section(layout ? { layout } : {}), "classic");
    assert.equal(new Set(visible).size, visible.length, `classic ${layout}: no duplicate fields`);
    assert.equal(visible.filter((id) => id === "checkoutLayout").length, 1, `classic ${layout}: one layout picker`);
  }
  const classicLayout = schema.visibleFields(section({ layout: "multi-step" }), "classic").find((field) => field.id === "checkoutLayout");
  assert.equal(classicLayout.fallback, "steps");
  // Every field the panel offers is read by the settings reader.
  const keys = schema.allFields(schema.sectionSchema("checkout-form", "boutique", "breeze")).filter((field) => field.target).map((field) => field.target.key);
  const source = read("src/components/storefront/checkout/checkout-layout.ts");
  for (const key of keys) assert.match(source, new RegExp(`\\.${key}\\b`), `${key} is read`);
});

test("the builder preview and the live checkout render the same checkout from the snapshot", () => {
  const client = read("src/app/s/[slug]/checkout/CheckoutClient.tsx");
  const preview = read("src/components/storefront/checkout/CheckoutPreview.tsx");
  for (const page of ["src/app/s/[slug]/checkout/page.tsx", "src/app/_domain/[domain]/checkout/page.tsx"]) {
    assert.match(read(page), /design=\{checkoutDesignFor\(store\.brandSettings, basePath\)\}/, page);
  }
  assert.match(read("src/lib/storefront/checkout-design.server.ts"), /boutiqueSnapshotFor\(boutique, brandSettings\) : classicSnapshotFor\(brandSettings\)/, "published snapshot, as the product page");
  for (const part of ["<CheckoutFrame", "<OrderSummary", "<ContactFields", "<DeliveryFields", "<PaymentFields"]) {
    assert.ok(client.includes(part) && preview.includes(part), `${part} in both`);
  }
  assert.match(preview, /inert/);
  assert.match(read("src/components/storefront/boutique/BoutiqueStorefront.tsx"), /<CheckoutPreview[\s\S]*readCheckoutPageSettings\(section, themeId\)/);
  assert.match(read("src/components/storefront/TemplateStorefrontSurface.tsx"), /<CheckoutPreview[\s\S]*readClassicCheckoutSettings\(kindSection\)/);
  // Behaviour kept: abandoned carts, analytics, discount codes, stock/quote errors, payment redirect.
  for (const piece of ["captureCart(", "useStoreCheckoutStart(", "checkDiscountCode(", "/checkout/quote", "PaystackCheckoutButton", "TransferInstructions", "router.push(orderPath)"]) {
    assert.ok(client.includes(piece), piece);
  }
});
