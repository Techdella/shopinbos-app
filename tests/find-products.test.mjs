// Find products (/marketplace) and Rex's settings (China imports: tests/imports.test.mjs): pure helpers (Node strips the types natively).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const find = await import("../src/lib/marketplace/find.ts");
const rex = await import("../shared/rex-preferences.ts");
const { publicBrandSettings } = await import("../shared/public-brand-settings.ts");

test("payment fee is 1.5% plus ₦100 (waived under ₦2,500), capped at ₦2,000", () => {
  assert.equal(find.paymentFee(13000), 295);
  assert.equal(find.paymentFee(2000), 30);
  assert.equal(find.paymentFee(2500), 138);
  assert.equal(find.paymentFee(500000), 2000);
  assert.equal(find.paymentFee(0), 0);
  assert.equal(find.paymentFee(Number.NaN), 0);
});

test("each sale: shopper pays, supplier gets cost, fee comes off, the seller keeps the rest", () => {
  const sale = find.saleBreakdown(13000, 6000);
  assert.deepEqual(sale, { shopperPays: 13000, supplierGets: 6000, fee: 295, keep: 6705, keepPct: 52 });
  assert.equal(find.saleBreakdown(0, 100).keepPct, 0);
  assert.ok(find.saleBreakdown(5000, 6000).keep < 0, "a price under cost shows a loss");
});

test("the selling price stepper stays above cost plus fees and moves in sensible steps", () => {
  assert.equal(find.priceStep(4500), 100);
  assert.equal(find.priceStep(13000), 500);
  assert.equal(find.priceStep(85000), 1000);
  const floor = find.clampSellingPrice(1, 6000);
  assert.ok(floor > 6000 + find.paymentFee(6000));
  assert.equal(find.clampSellingPrice(13000, 6000), 13000);
  assert.equal(find.clampSellingPrice(10_000_000, 6000), 60000);
});

test("wholesale tiers pick the unit price for a quantity", () => {
  const tiers = [{ minQty: 10, maxQty: 49, price: 5400 }, { minQty: 50, price: 4900 }];
  assert.equal(find.tierPrice(tiers, 10, 6000), 5400);
  assert.equal(find.tierPrice(tiers, 120, 6000), 4900);
  assert.equal(find.tierPrice(tiers, 5, 6000), 6000);
  assert.deepEqual(find.parsePricingTiers([{ minQty: 50, price: 4900 }, { minQty: 0, price: 1 }, { minQty: 10, maxQty: 49, price: 5400 }, "x"]), [
    { minQty: 10, maxQty: 49, price: 5400 },
    { minQty: 50, price: 4900 },
  ]);
});

test("labels: ships line, short categories, initials", () => {
  assert.equal(find.shipsLabel("24 hours"), "Ships in 24 hours");
  assert.equal(find.shipsLabel("same day in Lagos"), "Same day in Lagos");
  assert.equal(find.shipsLabel(null), "");
  assert.equal(find.shortCategory("Electronics & Gadgets"), "Gadgets");
  assert.equal(find.shortCategory("Fashion & Clothing"), "Fashion");
  assert.equal(find.shortCategory("Food & Groceries"), "Food");
  assert.equal(find.shortCategory("Pets and Animals"), "Pets");
  assert.equal(find.supplierInitials("Aba Leatherworks"), "AL");
  assert.equal(find.supplierInitials("Ọja Crafts"), "ỌC");
  assert.equal(find.supplierLine(find.SAMPLE_PRODUCTS[0]), "Aba Leatherworks · Aba · Ships in 24 hours");
});

test("live supplier products become cards; similar prices need two other listings", () => {
  const row = (id, price, category = "Fashion & Clothing") => ({
    id, name: `Item ${id}`, description: "", images: ["https://x/y.jpg", ""], wholesalePrice: 1000, suggestedRetailPrice: price, moq: 0, stockQuantity: 4,
    pricingTiers: [], dropshipAvailable: true, bulkOrderAvailable: false, processingTime: "48 hours", trendScore: 2, category: { name: category },
    supplier: { id: "s1", userId: "u1", slug: "s", displayName: "Supplier", city: "Lagos", rating: 4.5, ratingCount: 0, verificationStatus: "verified" },
  });
  const card = find.toFindProduct(row("a", 3000));
  assert.equal(card.sample, false);
  assert.equal(card.category, "Fashion");
  assert.deepEqual(card.images, ["https://x/y.jpg"]);
  assert.equal(card.moq, 1);
  assert.equal(card.supplier.rating, null, "no rating until someone rates");
  assert.equal(card.ships, "Ships in 48 hours");
  const all = [card, find.toFindProduct(row("b", 2500)), find.toFindProduct(row("c", 4200)), find.toFindProduct(row("d", 9000, "Home"))];
  assert.deepEqual(find.similarRange(card, all), [2500, 4200]);
  assert.equal(find.similarRange(all[3], all), null);
});

test("search and category chips filter the cards", () => {
  const all = find.SAMPLE_PRODUCTS;
  assert.deepEqual(find.categoriesOf(all), ["Shoes", "Fashion", "Home", "Gadgets", "Food"]);
  assert.equal(find.filterFindProducts(all, { category: "shoes" }).length, 4);
  assert.deepEqual(find.filterFindProducts(all, { q: "leather slides" }).map((p) => p.name), ["Leather slides"]);
  assert.ok(find.filterFindProducts(all, { q: "Ikorodu" }).length === 2, "supplier city matches");
  assert.equal(find.filterFindProducts(all, { q: "shoes, gadgets" }).length, 5, "comma list finds any");
  assert.equal(find.filterFindProducts(all, { q: "zzz" }).length, 0);
  // Every trend idea's "Find suppliers" search finds something in the sample catalogue.
  for (const idea of find.TREND_IDEAS) assert.ok(find.filterFindProducts(all, { q: idea.query }).length > 0, idea.title);
});

test("samples look like the prototype, use real Unsplash photos and can be told apart", () => {
  const names = find.SAMPLE_PRODUCTS.map((p) => p.name);
  assert.equal(names.length, 10);
  assert.ok(names.includes("Leather slides") && names.includes("Court sneakers") && names.includes("Rattan armchair"));
  const ids = new Set();
  for (const product of find.SAMPLE_PRODUCTS) {
    assert.ok(product.sample && find.isSampleId(product.id), product.id);
    assert.ok(product.images.length > 0 && product.images.every((src) => src.startsWith("https://images.unsplash.com/photo-")), product.name);
    assert.ok(product.price > product.cost && find.saleBreakdown(product.price, product.cost).keep > 0, product.name);
    assert.ok(product.similar[0] <= product.price && product.price <= product.similar[1], `${product.name} sits inside its similar range`);
    assert.ok(product.tiers.length && product.tiers[0].minQty === product.moq, product.name);
    for (const src of product.images) {
      assert.ok(!ids.has(src), `${src} is used once`);
      ids.add(src);
    }
  }
  assert.equal(find.findSample("sample-leather-slides")?.name, "Leather slides");
  assert.equal(find.findSample("cm123"), null);
  assert.equal(find.isSampleId("cm123"), false);
});

test("Peggy suggests a category from what the store sells, or falls back on a generic line", () => {
  const categories = ["Shoes", "Fashion", "Home"];
  const fashion = find.peggyInsight({ storeCategory: "Women's fashion and bags", customers: "Young professionals in Lagos.", categories });
  assert.equal(fashion.category, "Shoes");
  assert.equal(fashion.lead, "Shoes would suit your store.");
  assert.match(fashion.body, /Chosen for your buyers: young professionals in Lagos\./);
  assert.match(fashion.body, /packed with your label\.$/);
  assert.equal(find.peggyInsight({ storeCategory: "sneakers", categories }).category, "Fashion");
  const generic = find.peggyInsight({ storeCategory: "", categories });
  assert.equal(generic.category, null);
  assert.match(generic.lead, /Start with one product/);
  assert.equal(find.peggyInsight({ storeCategory: "gadgets", categories }).category, null, "only suggests categories that have products");
  assert.doesNotMatch(fashion.body + generic.body, /\d+ in \d+/, "no made-up statistics");
});

test("live trends group trending products by category", () => {
  const product = (id, category, trendScore) => ({ ...find.SAMPLE_PRODUCTS[0], id, name: `P${id}`, category, trendScore });
  const trends = find.trendsFromProducts([product("1", "Shoes", 5), product("2", "Shoes", 9), product("3", "Home", 3), product("4", "Food", 0)]);
  assert.deepEqual(trends.map((t) => t.title), ["P2", "P3"]);
  assert.match(trends[0].reason, /^2 trending in Shoes · keep up to \d+%$/);
});

test("sourcing settings parse safely", () => {
  assert.deepEqual(find.parseSourcing(null), { saved: [], notifyNewSuppliers: false });
  const parsed = find.parseSourcing({ saved: ["a", "a", 3, "b"], notifyNewSuppliers: true, imports: "nope" });
  assert.deepEqual(parsed, { saved: ["a", "b"], notifyNewSuppliers: true });
});

test("Rex preferences: defaults, field-by-field parsing and form validation", () => {
  assert.deepEqual(rex.parseRexPreferences(undefined), rex.DEFAULT_REX_PREFERENCES);
  const parsed = rex.parseRexPreferences({ mode: "ask", designStyle: "neon", keepVersions: 5, brandNotes: "  Earthy  " });
  assert.equal(parsed.mode, "ask");
  assert.equal(parsed.designStyle, rex.DEFAULT_REX_PREFERENCES.designStyle, "unknown values fall back");
  assert.equal(parsed.keepVersions, 5);
  assert.equal(parsed.brandNotes, "Earthy");

  const ok = rex.rexPreferencesFromForm({ mode: "apply", designStyle: "luxury", imageStyle: "lifestyle", voice: "punchy", language: "pidgin_touches", autoSaveVersions: "on", keepVersions: "10", brandNotes: "Gold and cream." });
  assert.equal(ok.success, true);
  assert.equal(ok.data.autoSaveVersions, true);
  assert.equal(ok.data.keepVersions, 10);
  const off = rex.rexPreferencesFromForm({ mode: "apply", designStyle: "luxury", imageStyle: "lifestyle", voice: "punchy", language: "english", keepVersions: "10", brandNotes: "" });
  assert.equal(off.data.autoSaveVersions, false);
  assert.equal(rex.rexPreferencesFromForm({ mode: "yolo", designStyle: "luxury", imageStyle: "lifestyle", voice: "punchy", language: "english", keepVersions: "10" }).success, false);
  assert.equal(rex.rexPreferencesFromForm({ mode: "ask", designStyle: "luxury", imageStyle: "lifestyle", voice: "punchy", language: "english", keepVersions: "500" }).success, false);
  assert.equal(rex.rexPreferencesFromForm({ mode: "ask", designStyle: "luxury", imageStyle: "lifestyle", voice: "punchy", language: "english", keepVersions: "5", brandNotes: "x".repeat(2001) }).success, false);
});

test("Rex preferences reach the prompt only once saved, and set how many versions are kept", () => {
  assert.equal(rex.rexPreferencesBlock({}), "");
  assert.equal(rex.rexPreferencesBlock(null), "");
  const block = rex.rexPreferencesBlock({ rexPreferences: { mode: "ask", designStyle: "bold", imageStyle: "lifestyle", voice: "warm_naija", language: "pidgin_touches", brandNotes: "We sell Aba-made leather." } });
  assert.match(block, /^The seller's Rex settings/);
  assert.match(block, /Ask before changing/);
  assert.match(block, /bold and colourful/);
  assert.match(block, /African models/);
  assert.match(block, /Pidgin/);
  assert.match(block, /Aba-made leather/);
  assert.equal(rex.rexVersionLimitFor({}), 20);
  assert.equal(rex.rexVersionLimitFor({ rexPreferences: { autoSaveVersions: true, keepVersions: 5 } }), 5);
  assert.equal(rex.rexVersionLimitFor({ rexPreferences: { autoSaveVersions: false, keepVersions: 20 } }), rex.REX_MIN_VERSIONS);
});

test("Rex preferences and sourcing data never reach shoppers", () => {
  const pub = publicBrandSettings({ rexPreferences: { brandNotes: "secret" }, sourcing: { imports: [{ id: "a" }] }, themeTokens: { accent: "#000" } });
  assert.equal(pub.rexPreferences, undefined);
  assert.equal(pub.sourcing, undefined);
  assert.deepEqual(pub.themeTokens, { accent: "#000" });
});

test("wiring: Rex Studio reads the settings, the settings tab is renamed with the old name kept, Imports has its page", () => {
  const studioEdit = readFileSync(new URL("../src/lib/ai/rex/studio-edit.server.ts", import.meta.url), "utf8");
  assert.match(studioEdit, /rexPreferencesBlock\(settings\)/);
  const studio = readFileSync(new URL("../src/lib/ai/rex/studio.server.ts", import.meta.url), "utf8");
  assert.match(studio, /boundRexVersions\(versions\.items, rexVersionLimitFor\(settings\)\)/);
  const settings = readFileSync(new URL("../src/app/home/settings/page.tsx", import.meta.url), "utf8");
  assert.match(settings, /"Peggy & Rex"/);
  assert.match(settings, /"Peggy & AI": "Peggy & Rex"/);
  const nav = readFileSync(new URL("../src/lib/nav.ts", import.meta.url), "utf8");
  assert.match(nav, /id: "imports", label: "Imports", icon: "truck", href: "\/home\/imports"/);
  const actions = readFileSync(new URL("../src/app/actions/sourcing.ts", import.meta.url), "utf8");
  // Samples can never become real store products.
  assert.match(actions, /if \(isSampleId\(parsed\.data\.supplierProductId\)\) return \{ ok: false, sample: true/);
});
