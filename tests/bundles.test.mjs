// Product bundles (shared/bundles.ts): what a bundle may hold, its saving, how many can be bought from its items'
// stock, and the units each item gives at checkout.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const b = await import("../shared/bundles.ts");

const part = (id, extra = {}) => ({ id, storeId: "s1", name: id.toUpperCase(), retailPrice: 1000, status: "published", ...extra });
const parts = [part("soap"), part("cream", { retailPrice: 2500 }), part("towel", { retailPrice: 4000 })];
const input = (items, extra = {}) => ({ storeId: "s1", name: "Glow kit", price: 6000, items, ...extra });

test("a bundle needs a name, a price above 0 and 2 to 10 different products of the store", () => {
  assert.deepEqual(b.checkBundle(input([{ productId: "soap", quantity: 2 }, { productId: "cream", quantity: 1 }]), parts), { ok: true, items: [{ productId: "soap", quantity: 2 }, { productId: "cream", quantity: 1 }] });
  assert.equal(b.checkBundle(input([{ productId: "soap", quantity: 1 }, { productId: "cream", quantity: 1 }], { name: "  " }), parts).problem, "name");
  assert.equal(b.checkBundle(input([{ productId: "soap", quantity: 1 }, { productId: "cream", quantity: 1 }], { price: 0 }), parts).problem, "price");
  assert.equal(b.checkBundle(input([{ productId: "soap", quantity: 1 }]), parts).problem, "too_few");
  // The same product twice is one line, so it's still one product.
  assert.equal(b.checkBundle(input([{ productId: "soap", quantity: 1 }, { productId: "soap", quantity: 2 }]), parts).problem, "too_few");
  const many = Array.from({ length: 11 }, (_, i) => part(`p${i}`));
  assert.equal(b.checkBundle(input(many.map((p) => ({ productId: p.id, quantity: 1 }))), many).problem, "too_many");
  assert.equal(b.checkBundle(input(many.slice(0, 10).map((p) => ({ productId: p.id, quantity: 1 }))), many).ok, true);
});

test("quantities are 1 to 20 each", () => {
  assert.equal(b.checkBundle(input([{ productId: "soap", quantity: 0 }, { productId: "cream", quantity: 1 }]), parts).problem, "quantity");
  assert.equal(b.checkBundle(input([{ productId: "soap", quantity: 21 }, { productId: "cream", quantity: 1 }]), parts).problem, "quantity");
  assert.equal(b.checkBundle(input([{ productId: "soap", quantity: 1.5 }, { productId: "cream", quantity: 1 }]), parts).problem, "quantity");
  assert.equal(b.checkBundle(input([{ productId: "soap", quantity: 20 }, { productId: "cream", quantity: 1 }]), parts).ok, true);
  // Merged lines can't go past 20 either.
  assert.equal(b.checkBundle(input([{ productId: "soap", quantity: 15 }, { productId: "soap", quantity: 10 }, { productId: "cream", quantity: 1 }]), parts).problem, "quantity");
});

test("items belong to the same store; no bundle inside a bundle, no supplier, versions, pre-order or archived products", () => {
  const two = [{ productId: "soap", quantity: 1 }, { productId: "x", quantity: 1 }];
  assert.equal(b.checkBundle(input(two), [...parts, part("x", { storeId: "other" })]).problem, "missing");
  assert.equal(b.checkBundle(input(two), parts).problem, "missing");
  const nested = part("x", { productDetails: { bundle: { items: [{ productId: "soap", quantity: 1 }] } } });
  assert.deepEqual(b.checkBundle(input(two), [...parts, nested]), { ok: false, problem: "nested", product: "X" });
  assert.equal(b.checkBundle(input(two), [...parts, part("x", { fulfillmentType: "dropship" })]).problem, "dropship");
  // A product with sizes needs one named (see the sizes tests below); one whose sizes are all switched off can't go in.
  assert.deepEqual(b.checkBundle(input(two), [...parts, part("x", { variants: [{ id: "v1", name: "Red" }] })]), { ok: false, problem: "variant", product: "X" });
  assert.equal(b.checkBundle(input(two), [...parts, part("x", { variants: [{ id: "v1", name: "Red", enabled: false }] })]).problem, "versions");
  assert.equal(b.checkBundle(input(two), [...parts, part("x", { variants: [{ id: "v1", enabled: false }] })]).ok, true, "unreadable versions don't count");
  assert.equal(b.checkBundle(input(two), [...parts, part("x", { preorderEnabled: true })]).problem, "preorder");
  assert.equal(b.checkBundle(input(two), [...parts, part("x", { status: "archived" })]).problem, "archived");
  assert.equal(b.checkBundle(input([{ productId: "soap", quantity: 1 }, { productId: "me", quantity: 1 }], { selfId: "me" }), [...parts, part("me")]).problem, "self");
  for (const problem of ["name", "price", "too_few", "too_many", "quantity", "missing", "self", "nested", "dropship", "versions", "variant", "preorder", "archived"]) assert.ok(b.bundleProblemMessage(problem, "Soap").length > 5);
});

test("the bundle is saved in productDetails and survives the product form", () => {
  const details = b.bundleDetails({ material: "Shea" }, [{ productId: "soap", quantity: 2 }]);
  assert.deepEqual(details, { material: "Shea", bundle: { items: [{ productId: "soap", quantity: 2 }] } });
  assert.deepEqual(b.readBundle(details), [{ productId: "soap", quantity: 2 }]);
  assert.equal(b.isBundleProduct({ productDetails: details }), true);
  assert.equal(b.isBundleProduct({ productDetails: { material: "Shea" } }), false);
  assert.equal(b.readBundle({ bundle: { items: [{ productId: "", quantity: 1 }, { quantity: 2 }] } }), null);
  assert.equal(b.readBundle(null), null);
  // The product form sends string details only: the bundle is put back.
  assert.deepEqual(b.keepBundle(details, { colour: "Brown" }), { colour: "Brown", bundle: { items: [{ productId: "soap", quantity: 2 }] } });
  assert.deepEqual(b.keepBundle({ material: "Shea" }, { colour: "Brown" }), { colour: "Brown" });
});

test("savings: the parts' total, the amount and percent saved", () => {
  const items = [{ productId: "soap", quantity: 2 }, { productId: "cream", quantity: 1 }];
  const prices = new Map([["soap", 1000], ["cream", 2500]]);
  const total = b.partsTotal(items, (id) => prices.get(id));
  assert.equal(total, 4500);
  assert.deepEqual(b.bundleSaving(total, 4000), { amount: 500, percent: 11 });
  assert.deepEqual(b.bundleSaving(total, 5000), { amount: 0, percent: 0 }, "dearer than the parts: no saving shown");
  assert.deepEqual(b.bundleSaving(0, 100), { amount: 0, percent: 0 });
});

test("available bundles: the lowest floor(stock / quantity) over items that track stock", () => {
  const rows = new Map([
    ["soap", { trackStock: true, currentStock: 7, reservedStock: 1, status: "published" }],
    ["cream", { trackStock: true, currentStock: 10, status: "published" }],
    ["towel", { trackStock: false, currentStock: 0, status: "published" }],
  ]);
  const of = (id) => rows.get(id);
  assert.equal(b.bundleAvailable([{ productId: "soap", quantity: 2 }, { productId: "cream", quantity: 1 }], of), 3, "(7 - 1) / 2 = 3");
  assert.equal(b.bundleAvailable([{ productId: "cream", quantity: 3 }, { productId: "towel", quantity: 1 }], of), 3);
  assert.equal(b.bundleAvailable([{ productId: "towel", quantity: 5 }], of), null, "nothing tracked: no limit");
  assert.equal(b.bundleAvailable([{ productId: "towel", quantity: 1 }, { productId: "gone", quantity: 1 }], of), 0, "an item no longer for sale");
  assert.equal(b.partLimit({ trackStock: true, currentStock: -2 }, 1), 0, "oversold item");
  assert.equal(b.partLimit({ trackStock: true, currentStock: 5, status: "draft" }, 1), 0);
  assert.equal(b.partLimit({ trackStock: true, currentStock: 5, preorderEnabled: true }, 1), 0);
  assert.deepEqual(b.bundleShopperStock([{ productId: "soap", quantity: 2 }], of), { left: 3, lowAt: 5, continueSelling: false });
  assert.equal(b.bundleShopperStock([{ productId: "towel", quantity: 2 }], of), null);
});

test("checkout: a bundle line takes its items' units, added to the same items bought alone", () => {
  const bundles = new Map([["kit", [{ productId: "soap", quantity: 2 }, { productId: "cream", quantity: 1 }]]]);
  const out = b.bundleStockQuantities(new Map([["kit", 3], ["soap", 1], ["towel", 2]]), bundles);
  assert.deepEqual(Object.fromEntries(out), { soap: 7, cream: 3, towel: 2 });
});

test("storefront: What's inside, the saving and stock from the items' rows; catalogue stock per bundle", () => {
  const rows = [
    { id: "soap", name: "Black soap", images: ["s.jpg"], retailPrice: 1000, trackStock: true, currentStock: 4 },
    { id: "cream", name: "Shea cream", images: [], retailPrice: 2500, trackStock: false },
  ];
  const { summary, stock } = b.bundleForShoppers([{ productId: "soap", quantity: 2 }, { productId: "cream", quantity: 1 }], 4000, rows);
  assert.deepEqual(summary.items, [
    { id: "soap", name: "Black soap", image: "s.jpg", quantity: 2, price: 1000 },
    { id: "cream", name: "Shea cream", image: null, quantity: 1, price: 2500 },
  ]);
  assert.equal(summary.partsTotal, 4500);
  assert.deepEqual(summary.saving, { amount: 500, percent: 11 });
  assert.equal(stock.left, 2);
  const kit = { id: "kit", productDetails: { bundle: { items: [{ productId: "soap", quantity: 2 }] } } };
  const stocks = b.bundleStocks([...rows, kit]);
  assert.equal(stocks.size, 1);
  assert.equal(stocks.get("kit").left, 2);
});

test("checkout and the storefront use the bundle rules", () => {
  const pricing = readFileSync(new URL("../src/lib/commerce/pricing.server.ts", import.meta.url), "utf8");
  assert.match(pricing, /bundleStockQuantities/);
  const page = readFileSync(new URL("../src/lib/storefront/product-page.server.ts", import.meta.url), "utf8");
  assert.match(page, /bundleForProductPage/);
  const helper = readFileSync(new URL("../src/lib/products/bundles.server.ts", import.meta.url), "utf8");
  assert.match(helper, /bundleForShoppers\(/);
});

// ─── Sizes and options (shared/product-variants.ts) ──────────────────────────

const dress = part("dress", {
  name: "Ankara dress",
  retailPrice: 10000,
  images: ["dress.jpg"],
  variants: [
    { id: "v-s", options: { Size: "S" }, name: "S", price: null, stock: 4 },
    { id: "v-m", options: { Size: "M" }, name: "M", price: 12000, stock: 3, imageUrl: "m.jpg" },
    { id: "v-l", options: { Size: "L" }, name: "L", price: null, stock: null },
    { id: "v-xl", options: { Size: "XL" }, name: "XL", price: null, stock: 9, enabled: false },
  ],
});

test("sizes: a product with sizes names one of its switched-on sizes; one without names none", () => {
  const ok = b.checkBundle(input([{ productId: "dress", variantId: "v-m", quantity: 1 }, { productId: "soap", quantity: 1 }]), [...parts, dress]);
  assert.deepEqual(ok, { ok: true, items: [{ productId: "dress", variantId: "v-m", quantity: 1 }, { productId: "soap", quantity: 1 }] });
  assert.equal(b.checkBundle(input([{ productId: "dress", quantity: 1 }, { productId: "soap", quantity: 1 }]), [...parts, dress]).problem, "variant", "no size picked");
  assert.equal(b.checkBundle(input([{ productId: "dress", variantId: "v-zz", quantity: 1 }, { productId: "soap", quantity: 1 }]), [...parts, dress]).problem, "variant", "unknown size");
  assert.equal(b.checkBundle(input([{ productId: "dress", variantId: "v-xl", quantity: 1 }, { productId: "soap", quantity: 1 }]), [...parts, dress]).problem, "variant", "switched-off size");
  assert.equal(b.checkBundle(input([{ productId: "soap", variantId: "v-m", quantity: 1 }, { productId: "cream", quantity: 1 }]), parts).problem, "variant", "a product without sizes names none");
  // null / empty variantId means none (what forms may send).
  assert.equal(b.checkBundle(input([{ productId: "soap", variantId: null, quantity: 1 }, { productId: "cream", variantId: "", quantity: 1 }]), parts).ok, true);
  // Still refused with sizes: supplier, pre-order, unpublished-for-sale checks and bundles inside bundles.
  const sized = { variants: dress.variants };
  const two = [{ productId: "soap", quantity: 1 }, { productId: "x", variantId: "v-m", quantity: 1 }];
  assert.equal(b.checkBundle(input(two), [...parts, part("x", { ...sized, fulfillmentType: "dropship" })]).problem, "dropship");
  assert.equal(b.checkBundle(input(two), [...parts, part("x", { ...sized, preorderEnabled: true })]).problem, "preorder");
  assert.equal(b.checkBundle(input(two), [...parts, part("x", { ...sized, status: "archived" })]).problem, "archived");
  assert.equal(b.checkBundle(input(two), [...parts, part("x", { ...sized, productDetails: { bundle: { items: [{ productId: "soap", quantity: 1 }] } } })]).problem, "nested");
  assert.equal(b.partProblem(dress), null, "the pickers offer products with sizes");
});

test("sizes: the same product twice with different sizes is two lines; the same size twice is one", () => {
  const two = b.checkBundle(input([{ productId: "dress", variantId: "v-s", quantity: 1 }, { productId: "dress", variantId: "v-m", quantity: 2 }]), [...parts, dress]);
  assert.deepEqual(two, { ok: true, items: [{ productId: "dress", variantId: "v-s", quantity: 1 }, { productId: "dress", variantId: "v-m", quantity: 2 }] });
  assert.equal(b.checkBundle(input([{ productId: "dress", variantId: "v-m", quantity: 1 }, { productId: "dress", variantId: "v-m", quantity: 2 }]), [...parts, dress]).problem, "too_few");
  assert.deepEqual(b.mergeBundleItems([{ productId: "dress", variantId: "v-m", quantity: 1 }, { productId: "dress", variantId: "v-m", quantity: 2 }, { productId: "soap", variantId: null, quantity: 1 }]), [{ productId: "dress", variantId: "v-m", quantity: 3 }, { productId: "soap", quantity: 1 }]);
  assert.equal(b.bundleItemKey({ productId: "dress", variantId: "v-m" }), "dress::v-m");
  assert.equal(b.bundleItemKey({ productId: "soap" }), b.bundleItemKey({ productId: "soap", variantId: null }));
});

test("sizes: saved and read back with the size; older items without one still read", () => {
  const details = b.bundleDetails({}, [{ productId: "dress", variantId: "v-m", quantity: 1 }, { productId: "soap", quantity: 2 }]);
  assert.deepEqual(details.bundle.items, [{ productId: "dress", variantId: "v-m", quantity: 1 }, { productId: "soap", quantity: 2 }]);
  assert.deepEqual(b.readBundle(details), [{ productId: "dress", variantId: "v-m", quantity: 1 }, { productId: "soap", quantity: 2 }]);
  assert.deepEqual(b.readBundle({ bundle: { items: [{ productId: "soap", quantity: 2, variantId: "" }, { productId: "cream", quantity: 1, variantId: 5 }] } }), [{ productId: "soap", quantity: 2 }, { productId: "cream", quantity: 1 }]);
  assert.deepEqual(b.keepBundle(details, { colour: "Brown" }).bundle.items[0], { productId: "dress", variantId: "v-m", quantity: 1 });
});

test("sizes: the saving uses a size's own price when it has one", () => {
  assert.equal(b.bundleItemPrice(dress, { variantId: "v-m" }), 12000);
  assert.equal(b.bundleItemPrice(dress, { variantId: "v-s" }), 10000, "no own price: the product's");
  assert.equal(b.bundleItemPrice(part("soap"), {}), 1000);
  const items = [{ productId: "dress", variantId: "v-m", quantity: 1 }, { productId: "soap", quantity: 2 }];
  const rows = new Map([["dress", dress], ["soap", part("soap")]]);
  const total = b.partsTotal(items, (id, item) => b.bundleItemPrice(rows.get(id), item));
  assert.equal(total, 14000);
  assert.deepEqual(b.bundleSaving(total, 12600), { amount: 1400, percent: 10 });
});

test("sizes: availability is the lowest of the product's count and the size's own count, over items sharing them", () => {
  const tracked = { ...dress, trackStock: true, currentStock: 7, reservedStock: 0 };
  const of = (id) => (id === "dress" ? tracked : id === "soap" ? { status: "published", trackStock: false } : undefined);
  assert.equal(b.partLimit(tracked, 1, "v-m"), 3, "size M has 3");
  assert.equal(b.partLimit(tracked, 2, "v-s"), 2, "size S has 4");
  assert.equal(b.partLimit(tracked, 1, "v-l"), 7, "L isn't counted on its own: the product's 7");
  assert.equal(b.partLimit(tracked, 1, "v-xl"), 0, "switched off");
  assert.equal(b.partLimit(tracked, 1, "v-zz"), 0, "gone");
  assert.equal(b.partLimit(tracked, 1), 0, "no size named and more than one");
  assert.equal(b.partLimit({ ...tracked, trackStock: false }, 1, "v-m"), null, "stock not tracked");
  assert.equal(b.bundleAvailable([{ productId: "dress", variantId: "v-m", quantity: 1 }, { productId: "soap", quantity: 1 }], of), 3);
  // S and L together share the product's 7: 2 S + 2 L per bundle = 4 units → 1 bundle.
  assert.equal(b.bundleAvailable([{ productId: "dress", variantId: "v-s", quantity: 2 }, { productId: "dress", variantId: "v-l", quantity: 2 }], of), 1, "7 / 4 = 1");
  assert.equal(b.bundleAvailable([{ productId: "dress", variantId: "v-s", quantity: 1 }, { productId: "dress", variantId: "v-l", quantity: 1 }], of), 3, "7 / 2 = 3, S allows 4");
  assert.equal(b.bundleAvailable([{ productId: "dress", variantId: "v-xl", quantity: 1 }, { productId: "soap", quantity: 1 }], of), 0, "a switched-off size: none");
  // Older rows (no sizes) work as before.
  assert.equal(b.partLimit({ trackStock: true, currentStock: 5 }, 2), 2);
});

test("sizes: checkout takes each size's units from the bundles in the bag, added up across bundles", () => {
  const bundles = new Map([
    ["kit", [{ productId: "dress", variantId: "v-m", quantity: 1 }, { productId: "soap", quantity: 2 }]],
    ["pair", [{ productId: "dress", variantId: "v-m", quantity: 1 }, { productId: "dress", variantId: "v-s", quantity: 1 }]],
  ]);
  const lines = new Map([["kit", 2], ["pair", 1], ["soap", 1]]);
  const rows = new Map([["dress", dress], ["soap", part("soap")]]);
  const variants = b.bundleVariantQuantities(lines, bundles, (id) => rows.get(id));
  assert.deepEqual([...variants.keys()], ["dress"], "products without sizes give no size units");
  assert.deepEqual(Object.fromEntries(variants.get("dress")), { "v-m": 3, "v-s": 1 });
  // The product's own count takes every size's units.
  assert.deepEqual(Object.fromEntries(b.bundleStockQuantities(lines, bundles)), { dress: 4, soap: 5 });
});

test("storefront: What's inside names the size, with its price and photo", () => {
  const rows = [
    { ...dress, trackStock: true, currentStock: 7 },
    { id: "soap", name: "Black soap", images: ["s.jpg"], retailPrice: 1000, trackStock: false },
  ];
  const { summary, stock } = b.bundleForShoppers([{ productId: "dress", variantId: "v-m", quantity: 1 }, { productId: "soap", quantity: 1 }], 12000, rows);
  assert.deepEqual(summary.items, [
    { id: "dress", name: "Ankara dress", variant: "M", image: "m.jpg", quantity: 1, price: 12000 },
    { id: "soap", name: "Black soap", image: "s.jpg", quantity: 1, price: 1000 },
  ]);
  assert.equal(summary.partsTotal, 13000);
  assert.deepEqual(summary.saving, { amount: 1000, percent: 8 });
  assert.equal(stock.left, 3);
  const kit = { id: "kit", productDetails: { bundle: { items: [{ productId: "dress", variantId: "v-s", quantity: 2 }] } } };
  assert.equal(b.bundleStocks([...rows, kit]).get("kit").left, 2, "size S: 4 / 2");
});

test("checkout and record-sale take a bundle's size stock through the same paths", () => {
  const pricing = readFileSync(new URL("../src/lib/commerce/pricing.server.ts", import.meta.url), "utf8");
  assert.match(pricing, /bundleVariantQuantities\(/);
  assert.match(pricing, /itemVariant\(part, item\.variantId\)/);
  const sale = readFileSync(new URL("../src/lib/orders/record-sale.ts", import.meta.url), "utf8");
  assert.match(sale, /adjustVariantStock/);
});
