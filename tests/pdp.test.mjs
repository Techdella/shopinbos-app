// Behaviour tests for the 2026 themes' product page: settings with theme defaults, savings, stock, badges, rails.
import test from "node:test";
import assert from "node:assert/strict";

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
  assert.deepEqual(pdp.stockStatus({ soldOut: true }), { tone: "out", text: "Sold out" });
  assert.deepEqual(pdp.stockStatus({ variantStock: 3 }), { tone: "low", text: "Only 3 left" });
  assert.deepEqual(pdp.stockStatus({ variantStock: 40 }), { tone: "in", text: "In stock" });
  assert.deepEqual(pdp.stockStatus({ variantStock: 0 }), { tone: "out", text: "Sold out" });
  assert.equal(pdp.stockStatus({ currentStock: 0 }), null, "new products default to 0 and aren't sold out");
  assert.deepEqual(pdp.stockStatus({ currentStock: 8, lowStockThreshold: 10 }), { tone: "low", text: "Only 8 left" });
  assert.deepEqual(pdp.stockStatus({ currentStock: 8 }), { tone: "in", text: "In stock" }, "default threshold is 5");
  assert.deepEqual(pdp.stockStatus({ currentStock: 9, lowStockThreshold: 50 }), { tone: "low", text: "Only 9 left" }, "threshold is capped at 10");
  assert.deepEqual(pdp.stockStatus({ supplierStock: 2, currentStock: 100 }), { tone: "low", text: "Only 2 left" });
  assert.equal(pdp.stockStatus({}), null);
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
