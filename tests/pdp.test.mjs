// Behaviour tests for the 2026 themes' product page: settings with theme defaults, savings, stock, badges, rails.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const pdp = await import("../src/components/storefront/boutique/pdp/pdp-logic.ts");
const schema = await import("../src/components/builder/editor/section-schema.ts");

const productPage = (settings = {}, copy = {}, relatedTitle) => ({
  pages: [
    { pageType: "home", sections: [] },
    {
      pageType: "product",
      sections: [
        { kind: "product-detail", settings, blocks: [{ type: "copy", content: copy }] },
        ...(relatedTitle ? [{ kind: "featured-products", settings: { source: "related" }, blocks: [{ type: "copy", content: { title: relatedTitle } }] }] : []),
      ],
    },
  ],
});

test("product page settings fall back to each theme's own layout, gallery and details style", () => {
  const plug = pdp.readPdpSettings(null, "plug");
  assert.equal(plug.layout, "compact");
  assert.equal(plug.gallery, "thumbs-left");
  assert.equal(plug.details, "tabs");
  assert.equal(pdp.readPdpSettings(null, "adire").layout, "gallery-stack");
  assert.equal(pdp.readPdpSettings(null, "stride").layout, "editorial");
  assert.equal(pdp.readPdpSettings(null, "unknown-theme").layout, "classic");
  assert.deepEqual(plug.buyBox, pdp.DEFAULT_BUY_BLOCKS);
  assert.deepEqual(plug.sections, ["details", "reviews", "related", "recent"]);
  assert.equal(plug.labels.addToBag, "Add to bag");
  assert.equal(plug.stickyBar, true);

  // Older snapshots only have the seeded layout; it maps onto the new layouts.
  assert.equal(pdp.pdpSettingsForSnapshot(productPage({ layout: "wide-gallery" }), "breeze").layout, "editorial");
  // The seller's choice wins over both.
  assert.equal(pdp.pdpSettingsForSnapshot(productPage({ layout: "wide-gallery", pdpLayout: "compact" }), "breeze").layout, "compact");
  assert.equal(pdp.pdpSettingsForSnapshot(productPage({ pdpLayout: "nonsense" }), "noir").layout, "classic", "unknown values are ignored");
});

test("product page settings read block order, toggles, labels and the related section title", () => {
  const s = pdp.pdpSettingsForSnapshot(
    productPage(
      { buyBox: ["buttons", "price", "price", "bogus"], pageBlocks: ["reviews"], stickyBar: false, galleryStyle: "slider", detailsStyle: "accordion", trustPayOnDelivery: false },
      { addToBagLabel: " Add to cart ", trustCustomText: "100% original" },
      "Goes well with",
    ),
    "plug",
  );
  assert.deepEqual(s.buyBox, ["buttons", "price"], "duplicates and unknown ids dropped, order kept");
  assert.deepEqual(s.sections, ["reviews"]);
  assert.equal(s.stickyBar, false);
  assert.equal(s.gallery, "slider");
  assert.equal(s.details, "accordion");
  assert.equal(s.labels.addToBag, "Add to cart");
  assert.equal(s.labels.buyNow, "Buy now");
  assert.equal(s.labels.related, "Goes well with", "the theme's related heading carries over");
  assert.equal(s.trust.payOnDelivery, false);
  assert.equal(s.trust.customText, "100% original");
  assert.equal(pdp.pdpSettingsForSnapshot(productPage({}, { relatedTitle: "You may like" }, "Goes well with"), "plug").labels.related, "You may like");
});

test("savings percent only shows for a genuine discount", () => {
  assert.equal(pdp.savingsPercent(7500, 10000), 25);
  assert.equal(pdp.savingsPercent(9999, 10000), null, "under half a percent rounds to nothing");
  assert.equal(pdp.savingsPercent(10000, 10000), null);
  assert.equal(pdp.savingsPercent(12000, 10000), null);
  assert.equal(pdp.savingsPercent(5000, null), null);
  assert.equal(pdp.savingsPercent(3333, 10000), 67);
});

test("stock status uses tracked stock only", () => {
  const tracked = (left, lowAt = 5, continueSelling = false) => ({ left, lowAt, continueSelling });
  assert.deepEqual(pdp.stockStatus({ soldOut: true }), { tone: "out", text: "Sold out" });
  assert.deepEqual(pdp.stockStatus({ variantStock: 3 }), { tone: "low", text: "Only 3 left" });
  assert.deepEqual(pdp.stockStatus({ variantStock: 40 }), { tone: "in", text: "In stock" });
  assert.deepEqual(pdp.stockStatus({ variantStock: 0 }), { tone: "out", text: "Sold out" });
  assert.equal(pdp.stockStatus({ stock: null }), null, "untracked products never say anything about stock");
  assert.equal(pdp.stockStatus({}), null);
  assert.deepEqual(pdp.stockStatus({ stock: tracked(0) }), { tone: "out", text: "Sold out" }, "tracked at 0 is sold out");
  assert.deepEqual(pdp.stockStatus({ stock: tracked(8, 10) }), { tone: "low", text: "Only 8 left" }, "at or below the seller's level");
  assert.deepEqual(pdp.stockStatus({ stock: tracked(10, 10) }), { tone: "low", text: "Only 10 left" });
  assert.deepEqual(pdp.stockStatus({ stock: tracked(11, 10) }), { tone: "in", text: "In stock" });
  assert.deepEqual(pdp.stockStatus({ stock: tracked(8) }), { tone: "in", text: "In stock" }, "default level is 5");
  assert.deepEqual(pdp.stockStatus({ stock: tracked(40), variantStock: 2 }), { tone: "low", text: "Only 2 left" }, "a version's own count wins");
  assert.deepEqual(pdp.stockStatus({ supplierStock: 2, stock: tracked(100) }), { tone: "low", text: "Only 2 left" }, "dropship uses the supplier's stock");
  assert.equal(pdp.stockStatus({ stock: tracked(0, 5, true) }), null, "keep selling at 0: no sold out line");
});

test("availability: what can be bought and how many", () => {
  const tracked = (left, lowAt = 5, continueSelling = false) => ({ left, lowAt, continueSelling });
  assert.deepEqual(pdp.pdpAvailability({ stock: null }), { tone: "untracked", text: null, canBuy: true, maxQuantity: null });
  assert.deepEqual(pdp.pdpAvailability({ stock: tracked(0) }), { tone: "out", text: "Sold out", canBuy: false, maxQuantity: 0 });
  assert.equal(pdp.pdpAvailability({ stock: tracked(3) }).maxQuantity, 3, "the quantity stepper stops at what is left");
  assert.equal(pdp.pdpAvailability({ stock: tracked(30) }).maxQuantity, 30);
  assert.equal(pdp.pdpAvailability({ soldOut: true, stock: tracked(30) }).canBuy, false, "a switched-off or sold-out version can't be bought");
  const backorder = pdp.pdpAvailability({ stock: tracked(0, 5, true) });
  assert.equal(backorder.canBuy, true, "keep selling when out of stock");
  assert.equal(backorder.maxQuantity, null);
  assert.deepEqual(pdp.pdpAvailability({ stock: tracked(2, 5, true) }), { tone: "low", text: "Only 2 left", canBuy: true, maxQuantity: null });
  assert.equal(pdp.pdpAvailability({ supplierStock: 0, stock: tracked(9, 5, true) }).canBuy, false, "dropship never oversells the supplier");
});

test("detail panels hide when the product has nothing for them", () => {
  assert.deepEqual(pdp.detailPanels({}).map((p) => p.id), []);
  const full = {
    description: "Short",
    specifications: [{ name: "Material", value: "Cotton" }, { name: "", value: "x" }],
    careInstructions: "Hand wash",
    returnPolicy: "7 days",
    warranty: " ",
    supportInfo: "Call us",
    faqs: [{ question: "Q?", answer: "A" }, { question: "No answer", answer: "" }],
  };
  assert.deepEqual(pdp.detailPanels(full).map((p) => p.id), ["description", "specs", "care", "shipping", "warranty", "faqs"]);
  assert.deepEqual(pdp.detailPanels({}, 2).map((p) => p.id), ["shipping"], "delivery zones alone fill shipping and returns");
  assert.deepEqual(pdp.detailPanels({}, 0, 3).map((p) => p.id), ["specs"], "product-type detail rows fill the specifications panel");
  assert.deepEqual(pdp.detailPanels(full, 0, 0).map((p) => p.id), ["description", "care", "shipping", "warranty", "faqs"]);
  assert.equal(pdp.readSpecs(full.specifications).length, 1);
  assert.equal(pdp.readFaqs(full.faqs).length, 1);
});

test("trust badges only promise what the store has set up", () => {
  const trust = pdp.readPdpSettings(null, "breeze").trust;
  const none = { delivery: [], flatRate: null, payOnDelivery: false };
  assert.deepEqual(pdp.trustBadges(trust, none, {}), []);
  const zone = { name: "Lagos", regions: [], fee: 2000, freeOver: 40000, alwaysFree: false, estimatedDays: null, pickupOnly: false };
  const badges = pdp.trustBadges(trust, { delivery: [zone], flatRate: null, payOnDelivery: true }, { returnPolicy: "7 days" });
  assert.deepEqual(badges.map((b) => b.title), ["Free delivery over ₦40,000", "Pay on delivery", "See return policy"]);
  const custom = { ...trust, deliveryText: "Same-day in Lagos", payOnDelivery: false, returnsText: "7-day returns", customText: "Original" };
  assert.deepEqual(pdp.trustBadges(custom, { delivery: [], flatRate: 1500, payOnDelivery: true }, {}).map((b) => b.title), ["Same-day in Lagos", "7-day returns", "Original"]);
});

test("recently viewed keeps newest first without duplicates", () => {
  assert.deepEqual(pdp.pushRecentlyViewed(["a", "b", "c"], "b"), ["b", "a", "c"]);
  assert.deepEqual(pdp.pushRecentlyViewed("junk", "x"), ["x"]);
  assert.equal(pdp.pushRecentlyViewed(["a", "b", "c"], "d", 2).length, 2);
});

test("product videos embed YouTube and Vimeo and play https files", () => {
  assert.equal(pdp.productVideo("https://www.youtube.com/watch?v=dQw4w9WgXcQ").src, "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0&playsinline=1");
  assert.equal(pdp.productVideo("https://youtu.be/dQw4w9WgXcQ").kind, "youtube");
  assert.equal(pdp.productVideo("https://vimeo.com/123456789").src, "https://player.vimeo.com/video/123456789");
  assert.equal(pdp.productVideo("https://cdn.example.com/bag.mp4").kind, "file");
  assert.equal(pdp.productVideo("http://cdn.example.com/bag.mp4"), null);
  assert.equal(pdp.productVideo("javascript:alert(1)"), null);
  assert.equal(pdp.productVideo(""), null);
});

test("rating breakdown and inspector order helpers", () => {
  const rows = pdp.ratingBreakdown([{ rating: 5 }, { rating: 5 }, { rating: 4 }, { rating: 1 }]);
  assert.deepEqual(rows.map((r) => r.count), [2, 1, 0, 0, 1]);
  assert.equal(rows[0].percent, 50);

  const defaults = ["price", "rating", "summary", "buttons"];
  assert.deepEqual(pdp.moveInOrder(["price", "rating", "buttons"], "buttons", -1), ["price", "buttons", "rating"]);
  assert.deepEqual(pdp.moveInOrder(["price", "rating"], "price", -1), ["price", "rating"]);
  assert.deepEqual(pdp.toggleInOrder(["price", "buttons"], "rating", true, defaults), ["price", "rating", "buttons"], "goes back to its default place");
  assert.deepEqual(pdp.toggleInOrder(["buttons", "price"], "summary", true, defaults), ["buttons", "price", "summary"]);
  assert.deepEqual(pdp.toggleInOrder(["price", "rating"], "rating", false, defaults), ["price"]);
});

test("the builder's product page section edits the PDP settings with theme defaults", () => {
  const fields = schema.sectionSchema("product-detail", "boutique", "plug").settings.flatMap((group) => group.fields);
  const byId = Object.fromEntries(fields.map((field) => [field.id, field]));
  assert.equal(byId.pdpLayout.fallback, "compact");
  assert.deepEqual(byId.pdpLayout.options.map((o) => o.value), ["classic", "gallery-stack", "editorial", "compact"]);
  assert.equal(byId.galleryStyle.fallback, "thumbs-left");
  assert.equal(byId.detailsStyle.fallback, "tabs");
  assert.equal(byId.buyBox.type, "order");
  assert.deepEqual(byId.buyBox.target, { scope: "settings", key: "buyBox" });
  assert.deepEqual(byId.pageBlocks.target, { scope: "settings", key: "pageBlocks" });
  assert.deepEqual(byId.addToBagLabel.target, { scope: "copy", key: "addToBagLabel" });
  for (const id of ["stickyBar", "zoom", "breadcrumbs", "trustDelivery", "trustPayOnDelivery", "trustReturns", "trustCustomText", "buyNowLabel", "relatedTitle", "recentTitle", "reviewsTitle"]) assert.ok(byId[id], id);
  assert.ok(schema.sectionSchema("product-detail", "classic").settings.length > 0, "classic templates keep their own product section settings");
});

// ─── Classic templates use the same product page ─────────────────────────────

const classic = await import("../src/components/storefront/boutique/pdp/classic-pdp.ts");

const classicSection = (settings = {}, copy = {}) => ({ kind: "product-detail", settings, blocks: [{ type: "copy", content: copy }] });

test("classic product layouts map onto the shared product page layouts", () => {
  assert.deepEqual(classic.classicPdpDefaults("gallery-left"), { layout: "classic", gallery: "thumbs-left", details: "accordion" });
  assert.equal(classic.classicPdpDefaults("split").layout, "classic");
  assert.equal(classic.classicPdpDefaults("split").gallery, "thumbs-bottom");
  assert.equal(classic.classicPdpDefaults("minimal").layout, "compact");
  assert.equal(classic.classicPdpDefaults("sticky-summary").layout, "gallery-stack");
  // Sections saved with no layout, or one the builder never offered (seeded "premium-product-detail"), start as the default.
  for (const value of [undefined, "", "premium-product-detail", 42]) {
    assert.equal(classic.classicProductLayout(value), "gallery-left");
    assert.equal(classic.classicPdpDefaults(value).layout, "classic");
  }
});

test("classic product page settings: the seller's explicit choice wins over the classic layout", () => {
  const sticky = classic.readClassicPdpSettings(classicSection({ layout: "sticky-summary" }));
  assert.equal(sticky.layout, "gallery-stack");
  assert.equal(sticky.gallery, "thumbs-bottom");
  assert.deepEqual(sticky.buyBox, pdp.DEFAULT_BUY_BLOCKS, "everything else uses the shared defaults");

  const picked = classic.readClassicPdpSettings(classicSection({ layout: "sticky-summary", pdpLayout: "editorial", galleryStyle: "slider", detailsStyle: "tabs", buyBox: ["buttons", "price"], stickyBar: false }));
  assert.equal(picked.layout, "editorial");
  assert.equal(picked.gallery, "slider");
  assert.equal(picked.details, "tabs");
  assert.deepEqual(picked.buyBox, ["buttons", "price"]);
  assert.equal(picked.stickyBar, false);
  assert.equal(classic.readClassicPdpSettings(classicSection({ layout: "minimal", pdpLayout: "nonsense" })).layout, "compact", "unknown values are ignored");
  assert.equal(classic.readClassicPdpSettings(null).layout, "classic");

  // Add-to-bag wording: the product page setting, else the store's cart setting, else the shared default.
  assert.equal(classic.readClassicPdpSettings(classicSection({}, { addToBagLabel: "Grab it" }), { addToBagFallback: "Add to basket" }).labels.addToBag, "Grab it");
  assert.equal(classic.readClassicPdpSettings(classicSection(), { addToBagFallback: "Add to basket" }).labels.addToBag, "Add to basket");
  assert.equal(classic.readClassicPdpSettings(classicSection()).labels.addToBag, "Add to bag");
  assert.equal(classic.classicCartButtonLabel({ addToCartLabel: "basket" }), "Add to basket");
  assert.equal(classic.classicCartButtonLabel(undefined), "Add to cart");
  assert.equal(classic.classicCartButtonLabel({ addToCartLabel: "weird" }), "Add to cart");
  assert.equal(classic.classicBuyNowOnly({ addToCartLabel: "buy_now" }), true);
  assert.equal(classic.classicBuyNowOnly({}), false);

  // From a whole snapshot: the product page's product-detail section and its related heading.
  const snap = classic.classicPdpSettingsForSnapshot(productPage({ layout: "split", pageBlocks: ["reviews"] }, {}, "Pairs well with"));
  assert.equal(snap.layout, "classic");
  assert.deepEqual(snap.sections, ["reviews"]);
  assert.equal(snap.labels.related, "Pairs well with");
  assert.equal(classic.classicPdpSettingsForSnapshot(null).layout, "classic");
});

test("the classic builder's product section edits the same product page settings", () => {
  const sec = (settings = {}) => ({ id: "p", kind: "product-detail", name: "Product", visible: true, blocks: [{ id: "c", type: "copy", content: {} }], settings });
  const cases = [[undefined, "classic", "thumbs-left"], ["gallery-left", "classic", "thumbs-left"], ["split", "classic", "thumbs-bottom"], ["minimal", "compact", "thumbs-bottom"], ["sticky-summary", "gallery-stack", "thumbs-bottom"], ["premium-product-detail", "classic", "thumbs-left"]];
  for (const [layout, expected, gallery] of cases) {
    const settings = layout ? { layout } : {};
    const shown = schema.visibleFields(sec(settings), "classic");
    const fields = Object.fromEntries(shown.map((field) => [field.id, field]));
    assert.equal(fields.pdpLayout.fallback, expected, `${layout}: layout shown`);
    assert.equal(fields.galleryStyle.fallback, gallery, `${layout}: photos shown`);
    assert.equal(fields.pdpLayout.fallback, classic.readClassicPdpSettings(sec(settings)).layout, "the panel shows what the page draws");
    assert.equal(new Set(shown.map((field) => field.id)).size, shown.length, `${layout}: one of each field`);
    for (const id of ["buyBox", "pageBlocks", "zoom", "stickyBar", "detailsStyle", "addToBagLabel", "trustDelivery", "trustCustomText"]) assert.ok(fields[id], `${layout}: ${id}`);
    assert.ok(!fields.layout, "the old classic style cards are gone");
  }
  assert.deepEqual(schema.sectionSchema("product-detail", "classic").addable, [], "product options come from each product now");
});

// ─── One product's own page settings over the store's ─────────────────────────

const override = await import("../src/components/storefront/boutique/pdp/product-override.ts");

test("product page settings merge: theme default, then store settings, then the product's own choice", () => {
  const theme = pdp.readPdpSettings(null, "plug");
  assert.equal(theme.layout, "compact", "theme default");
  const store = pdp.pdpSettingsForSnapshot(productPage({ pdpLayout: "editorial", pageBlocks: ["details", "related"], buyBox: ["price", "buttons", "actions"] }), "plug");
  assert.equal(store.layout, "editorial", "store settings beat the theme");

  const none = override.readProductPageOverride({ override: true });
  assert.equal(override.applyProductPageOverride(store, none), store, "no choices: the store's settings as they are");

  const layoutOnly = override.applyProductPageOverride(store, override.readProductPageOverride({ override: true, layout: "gallery-stack" }));
  assert.equal(layoutOnly.layout, "gallery-stack", "the product's layout beats the store's");
  assert.deepEqual(layoutOnly.sections, store.sections, "parts it didn't choose stay the store's");
  assert.deepEqual(layoutOnly.buyBox, store.buyBox);

  const parts = override.applyProductPageOverride(store, override.readProductPageOverride({ override: true, sections: ["details", "reviews"], buyBox: ["buttons", "price", "stock"] }));
  assert.equal(parts.layout, "editorial");
  assert.deepEqual(parts.sections, ["details", "reviews"], "related hidden for this product; reviews shown although the store hides them");
  assert.deepEqual(parts.buyBox, ["price", "stock", "buttons"], "the store's order is kept, shown parts come back near their default place");
  assert.equal(parts.zoom, store.zoom, "everything else is the store's");
});

test("older saved page settings without the marker never override the store", () => {
  for (const legacy of [{}, null, undefined, "shopify", { layout: "editorial" }, { sections: [] }, { override: "yes", layout: "compact" }]) {
    assert.deepEqual(override.readProductPageOverride(legacy), override.NO_OVERRIDE, JSON.stringify(legacy));
  }
  const store = pdp.readPdpSettings(null, "breeze");
  assert.deepEqual(override.applyProductPageOverride(store, override.readProductPageOverride({ sections: ["details"] })).sections, store.sections, "the wishlist and rails stay on existing products");
  const junk = override.readProductPageOverride({ override: true, layout: "huge", buyBox: ["price", "nope", "price"], sections: "x" });
  assert.deepEqual(junk, { layout: null, buyBox: ["price"], sections: null }, "unknown layouts and parts are dropped");
  assert.deepEqual(override.readProductPageOverride({ override: true, sections: [] }).sections, [], "hiding every part below is a real choice");
});

test("the product form saves only what the seller chose, with the marker", () => {
  assert.deepEqual(override.writeProductPageOverride(override.NO_OVERRIDE), { override: true });
  const saved = override.writeProductPageOverride({ layout: "compact", buyBox: null, sections: ["details"] });
  assert.deepEqual(saved, { override: true, layout: "compact", sections: ["details"] });
  assert.deepEqual(override.readProductPageOverride(JSON.parse(JSON.stringify(saved))), { layout: "compact", buyBox: null, sections: ["details"] });
  assert.equal(override.hasProductPageOverride(override.readProductPageOverride(saved)), true);
  assert.equal(override.hasProductPageOverride(override.readProductPageOverride({ override: true })), false);
});

test("the live product route, the builder preview and the product form use the override", () => {
  const view = read("src/components/storefront/boutique/BoutiqueProductView.tsx");
  assert.match(view, /applyProductPageOverride\(props\.settings \?\? readPdpSettings\(null, props\.look\.id\), override\)/);
  assert.match(read("src/lib/storefront/product-page.server.ts"), /pageLayout: true/);
  assert.match(read("src/app/api/store/editor/route.ts"), /pageLayout: true/);
  const form = read("src/app/components/ProductForm.tsx");
  assert.match(form, /pageLayout: writeProductPageOverride\(/);
  assert.doesNotMatch(form, /enabledModules|setPageVariant/, "the old page variant and module checkboxes are gone");
});

// ─── Stock tracking ───────────────────────────────────────────────────────────

const stock = await import("../shared/product-stock.ts");
const holds = await import("../src/lib/commerce/stock-holds.ts");

test("shoppers only see tracked stock: available is in stock minus set aside", () => {
  assert.equal(stock.shopperStock({ trackStock: false, currentStock: 9 }), null, "untracked: no stock at all");
  assert.deepEqual(stock.shopperStock({ trackStock: true, currentStock: 9, reservedStock: 2, lowStockThreshold: 3 }), { left: 7, lowAt: 3, continueSelling: false });
  assert.deepEqual(stock.shopperStock({ trackStock: true, currentStock: -2, continueSellingWhenOut: true }), { left: 0, lowAt: 5, continueSelling: true }, "oversold counts show as 0");
  assert.equal(stock.availableStock({ currentStock: 5, reservedStock: -3 }), 5, "a negative set-aside counts as none");

  const row = { id: "p", trackStock: false, continueSellingWhenOut: false, currentStock: 0, reservedStock: 0, lowStockThreshold: 10, fulfillmentType: "merchant_fulfilled", variants: [{ id: "a", options: { Size: "S" }, stock: 0 }], supplierProduct: { stockQuantity: 50, moq: 1 } };
  const shaped = stock.forShoppers(row);
  assert.equal(shaped.stock, null);
  assert.equal("currentStock" in shaped || "reservedStock" in shaped || "trackStock" in shaped, false, "raw counts never reach shoppers");
  assert.equal(shaped.variants[0].stock, null, "an untracked product's versions are never sold out");
  assert.equal(shaped.supplierProduct.stockQuantity, null, "only dropship products sell the supplier's stock");
  assert.equal(shaped.supplierProduct.moq, 1);
  const trackedRow = stock.forShoppers({ ...row, trackStock: true, currentStock: 4 });
  assert.deepEqual(trackedRow.stock, { left: 4, lowAt: 10, continueSelling: false });
  assert.equal(trackedRow.variants[0].stock, 0, "tracked versions keep their own counts");
  const dropship = stock.forShoppers({ ...row, trackStock: true, fulfillmentType: "dropship" });
  assert.equal(dropship.stock, null);
  assert.equal(dropship.supplierProduct.stockQuantity, 50);
  assert.equal(dropship.variants[0].stock, null);
});

test("cards: Sold out only for tracked stock at 0 (or the supplier's) without backorders", () => {
  assert.equal(stock.listingSoldOut({ stock: null }), false);
  assert.equal(stock.listingSoldOut({ stock: { left: 0, lowAt: 5, continueSelling: false } }), true);
  assert.equal(stock.listingSoldOut({ stock: { left: 0, lowAt: 5, continueSelling: true } }), false);
  assert.equal(stock.listingSoldOut({ stock: { left: 1, lowAt: 5, continueSelling: false } }), false);
  assert.equal(stock.listingSoldOut({ supplierProduct: { stockQuantity: 0 } }), true);
  assert.equal(stock.listingSoldOut({ supplierProduct: { stockQuantity: null }, stock: null }), false);
  assert.match(read("src/components/storefront/boutique/ProductTile.tsx"), /soldOutLabel\(product\)/);
  assert.match(read("src/components/storefront/TemplateStorefrontSurface.tsx"), /soldOut: listingSoldOut\(mapped\)/);
});

test("saving: the seller's choice wins, else a count above 0 switches tracking on", () => {
  assert.equal(stock.stockTrackingFor({ trackStock: false, currentStock: 9 }), false);
  assert.equal(stock.stockTrackingFor({ currentStock: 9 }), true, "a new product with a count is tracked");
  assert.equal(stock.stockTrackingFor({ currentStock: 0 }), false, "a new product without one isn't");
  assert.equal(stock.stockTrackingFor({ currentStock: 0, variantsCounted: true }), true, "versions with their own counts");
  assert.equal(stock.stockTrackingFor({ currentStock: 5 }, { trackStock: false }), true, "the phone sets a count: start counting");
  assert.equal(stock.stockTrackingFor({ currentStock: 0 }, { trackStock: true }), undefined, "0 never switches tracking off by itself");
  assert.equal(stock.stockTrackingFor({}, { trackStock: false }), undefined);
  assert.equal(stock.stockTrackingFor({ trackStock: false }, { trackStock: true }), false);
});

test("checkout refuses more than is left of tracked products, with a clear message", () => {
  const own = (extra) => ({ id: "own", name: "Ankara dress", currentStock: 5, reservedStock: 1, trackStock: true, fulfillmentType: "merchant_fulfilled", ...extra });
  const q = (n) => new Map([["own", n]]);
  assert.deepEqual(holds.stockShortfallDetails([own()], q(4)), [], "4 of 5 - 1 set aside is fine");
  assert.deepEqual(holds.stockShortfallDetails([own()], q(5)), [{ name: "Ankara dress", available: 4 }], "set-aside units can't be sold");
  assert.deepEqual(holds.stockShortfallDetails([own({ trackStock: false, currentStock: 0 })], q(50)), [], "untracked: no limit");
  assert.deepEqual(holds.stockShortfallDetails([own({ continueSellingWhenOut: true, currentStock: 0 })], q(3)), [], "keep selling when out of stock");
  assert.deepEqual(holds.stockShortfallDetails([own({ trackStock: undefined, currentStock: 2, reservedStock: 0 })], q(3)), [{ name: "Ankara dress", available: 2 }], "callers that don't read the switch stay strict");
  assert.equal(holds.stockShortfallMessage([{ name: "Ankara dress", available: 2 }]), "Sorry, only 2 of Ankara dress are left. Lower the quantity in your bag and try again.");
  assert.equal(holds.stockShortfallMessage([{ name: "Tote", available: 1 }]), "Sorry, only 1 of Tote is left. Lower the quantity in your bag and try again.");
  assert.equal(holds.stockShortfallMessage([{ name: "Tote", available: 0 }]), "Sorry, Tote is sold out. Remove it from your bag and try again.");
  assert.equal(holds.stockShortfallMessage([]), "");

  // What checkout takes: strict holds as before; untracked only counts the sale; backorders may go below 0.
  const built = holds.buildStockHolds([own(), own({ id: "u", name: "Free", trackStock: false }), own({ id: "b", name: "Back", continueSellingWhenOut: true })], new Map([["own", 1], ["u", 2], ["b", 3]]), new Map([["u", [{ id: "v", quantity: 2, name: "Free · S" }]]]));
  assert.deepEqual(built, [
    { source: "store", productId: "own", quantity: 1, name: "Ankara dress" },
    { source: "store", productId: "u", quantity: 2, name: "Free", mode: "off" },
    { source: "store", productId: "b", quantity: 3, name: "Back", mode: "oversell" },
  ], "untracked products carry no version counts");
  assert.deepEqual(holds.parseStockHold(JSON.parse(JSON.stringify(built))), built, "the mode survives saving on the order");
  assert.equal(holds.holdTotals(built).store.get("u").mode, "off");
  assert.equal(holds.holdTotals([{ source: "store", productId: "x", quantity: 1, name: "Old" }]).store.get("x").mode, "strict", "older saved holds are strict");

  const pricing = read("src/lib/commerce/pricing.server.ts");
  assert.match(pricing, /stockShortfallDetails\(products, quantities\)/);
  assert.match(pricing, /storeStockMode\(product\) !== "off"/, "untracked products' versions aren't counted");
  const reserve = read("src/lib/commerce/stock.server.ts");
  assert.match(reserve, /"currentStock" - GREATEST\("reservedStock", 0\) >= \$\{quantity\}/, "the conditional decrement leaves set-aside units alone");
  assert.match(reserve, /if \(mode === "off"\)/);
});

test("stock tracking migration is additive, backfills once and is not applied by code", () => {
  const sql = read("docs/migrations/2026-10-30-product-track-stock.sql");
  assert.match(sql, /Run BEFORE deploying/);
  assert.match(sql, /IF NOT EXISTS \(\s*SELECT 1 FROM information_schema\.columns/);
  assert.match(sql, /ADD COLUMN "trackStock" BOOLEAN NOT NULL DEFAULT false/);
  assert.match(sql, /SET "trackStock" = true\s+WHERE "currentStock" > 0/);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS "continueSellingWhenOut" BOOLEAN NOT NULL DEFAULT false/);
  assert.doesNotMatch(sql, /DROP |DELETE /);
  const schemaText = read("prisma/schema.prisma");
  assert.match(schemaText, /trackStock\s+Boolean\s+@default\(false\)/);
  assert.match(schemaText, /continueSellingWhenOut\s+Boolean\s+@default\(false\)/);
});

test("product import tracks stock only when the row has a count", async () => {
  const imp = await import("../shared/product-import.ts");
  assert.equal(imp.mapImportRow({ name: "Tote", price: "5000", stock: "12" }, "NGN").trackStock, true);
  assert.equal(imp.mapImportRow({ name: "Tote", price: "5000", stock: "0" }, "NGN").trackStock, true, "0 typed in the sheet means sold out");
  assert.equal(imp.mapImportRow({ name: "Tote", price: "5000" }, "NGN").trackStock, false);
});
