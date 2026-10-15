// Product types, versions (variants), details, related products and Peggy's product assistant:
// shared/product-types.ts, shared/product-variants.ts, shared/product-variants-schema.ts, shared/product-assistant.ts,
// the stock holds in src/lib/commerce/stock-holds.ts and the wiring in the API, checkout and pages.
// Node strips the types natively.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const types = await import("../shared/product-types.ts");
const v = await import("../shared/product-variants.ts");
const schema = await import("../shared/product-variants-schema.ts");
const assistant = await import("../shared/product-assistant.ts");
const holds = await import("../src/lib/commerce/stock-holds.ts");
const cart = await import("../shared/cart-checkout.ts");
const catalog = await import("../src/components/storefront/shopper/catalog.ts");
const edit = await import("../shared/product-edit.ts");
const peggySpecs = await import("../src/lib/ai/peggy/products-specs.ts");
const peggyPure = await import("../src/lib/ai/peggy/pure.ts");
const schemas = await import("../src/lib/schemas/index.ts");
const en = (await import("../shared/i18n/messages/productTypes/en.ts")).default;
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

// ─── Types ────────────────────────────────────────────────────────────────────

test("product types: every preset is complete, with unique keys and words for the form", () => {
  const keys = types.PRODUCT_TYPES.map((type) => type.key);
  assert.deepEqual(keys, [...types.PRODUCT_TYPE_KEYS], "one definition per key, in order");
  assert.equal(new Set(keys).size, keys.length);
  for (const required of ["clothing", "shoes", "bags", "jewellery", "beauty", "hair", "food", "phones", "electronics", "home", "baby", "books", "digital", "service", "other"]) {
    assert.ok(keys.includes(required), required);
  }
  for (const type of types.PRODUCT_TYPES) {
    assert.ok(type.label && type.hint && type.icon, type.key);
    assert.ok(type.options.length <= v.MAX_OPTIONS, `${type.key}: at most ${v.MAX_OPTIONS} suggested options`);
    for (const option of type.options) {
      assert.ok(option.name && option.values.length > 0, `${type.key}/${option.name}`);
      assert.equal(new Set(option.values.map((value) => value.toLowerCase())).size, option.values.length, `${type.key}/${option.name}: no repeated values`);
      assert.ok(option.values.length <= v.MAX_OPTION_VALUES);
    }
    const fieldKeys = type.fields.map((field) => field.key);
    assert.equal(new Set(fieldKeys).size, fieldKeys.length, `${type.key}: unique detail keys`);
    for (const field of type.fields) {
      assert.match(field.key, /^[A-Za-z][A-Za-z0-9_]{0,39}$/);
      if (field.kind === "select") assert.ok(field.choices?.length, `${type.key}/${field.key} has choices`);
      assert.ok(en[`field.${field.key}`], `the form has words for field.${field.key}`);
    }
    assert.ok(en[`type.${type.key}`] && en[`hint.${type.key}`], `the form has words for ${type.key}`);
  }
  const clothing = types.productTypeDef("clothing");
  assert.deepEqual(clothing.options.map((o) => o.name), ["Size", "Colour"]);
  assert.ok(clothing.options[0].values.includes("3XL") && clothing.options[0].values.includes("14"), "XS–3XL plus Nigerian numeric sizes");
  assert.deepEqual(types.productTypeDef("clothing").fields.map((f) => f.key).filter((k) => ["material", "fit", "care"].includes(k)), ["material", "fit", "care"]);
  assert.ok(types.productTypeDef("beauty").fields.some((f) => f.key === "skinType") && types.productTypeDef("beauty").fields.some((f) => f.key === "expiry"));
  assert.ok(types.productTypeDef("phones").fields.find((f) => f.key === "condition").choices.includes("UK used"));
  assert.deepEqual(types.productTypeDef("hair").options.slice(0, 2).map((o) => o.name), ["Length", "Texture"]);
  assert.equal(types.productTypeDef("phones").options[0].name, "Storage");
});

test("product types: products without a type are Other, and details read safely", () => {
  assert.equal(types.productTypeDef(null).key, "other");
  assert.equal(types.productTypeDef("spaceship").key, "other");
  assert.equal(types.productTypeKey(undefined), "other");
  assert.equal(types.guessProductType("Ankara gown with puff sleeves"), "clothing");
  assert.equal(types.guessProductType("Bone straight wig 24 inch"), "hair");
  assert.equal(types.guessProductType("iPhone 13 Pro UK used"), "phones");
  assert.deepEqual(types.readProductDetails({ material: " Cotton ", "bad key": "x", fit: "", weight: 2, nested: { a: 1 } }), { material: "Cotton", weight: "2" });
  assert.deepEqual(types.readProductDetails(null), {});
  const rows = types.productDetailRows(
    { productType: "clothing", productDetails: { material: "Adire cotton", fit: "Loose fit", skinType: "Oily" }, specifications: [{ name: "Origin", value: "Aba" }, { name: "Material", value: "dupe" }, { name: "", value: "x" }], careInstructions: "Hand wash" },
    { includeColumns: true },
  );
  assert.deepEqual(rows, [
    { label: "Material", value: "Adire cotton" },
    { label: "Fit", value: "Loose fit" },
    { label: "Care instructions", value: "Hand wash" },
    { label: "Skin type", value: "Oily" },
    { label: "Origin", value: "Aba" },
  ], "type details in order, details from another type after, then the seller's own (no duplicate labels)");
});

// ─── Versions ─────────────────────────────────────────────────────────────────

const options = [
  { name: "Size", values: ["S", "M", "L", "XL"] },
  { name: "Colour", values: ["Red", "Black"] },
];

test("variants: every combination becomes a row at the main price, and existing rows keep their own values", () => {
  const rows = v.generateVariants(options, [], 15000);
  assert.equal(rows.length, 8);
  assert.deepEqual(rows.map((row) => row.name), ["S / Red", "S / Black", "M / Red", "M / Black", "L / Red", "L / Black", "XL / Red", "XL / Black"]);
  assert.ok(rows.every((row) => row.price === 15000 && row.stock === null && row.enabled));
  assert.equal(new Set(rows.map((row) => row.id)).size, 8, "unique ids");

  const priced = rows.map((row) => (row.name === "XL / Red" ? { ...row, price: 17000, stock: 3 } : row));
  const more = v.generateVariants([{ name: "Size", values: ["S", "M", "L", "XL", "XXL"] }, options[1]], priced, 15000);
  assert.equal(more.length, 10);
  const xlRed = more.find((row) => row.name === "XL / Red");
  assert.equal(xlRed.price, 17000);
  assert.equal(xlRed.stock, 3, "a combination keeps its stock when values are added");

  const sizesOnly = v.generateVariants([{ name: "Size", values: ["M", "L"] }], [], 9000).map((row) => (row.name === "L" ? { ...row, price: 11000 } : row));
  const withColour = v.generateVariants([{ name: "Size", values: ["M", "L"] }, { name: "Colour", values: ["Red"] }], sizesOnly, 9000);
  assert.equal(withColour.find((row) => row.name === "L / Red").price, 11000, "adding Colour keeps each size's price");

  assert.equal(v.generateVariants([{ name: "A", values: Array.from({ length: 11 }, (_, i) => `a${i}`) }, { name: "B", values: Array.from({ length: 10 }, (_, i) => `b${i}`) }], [], 1), null, "more than 100 combinations is refused");
  assert.equal(v.combinationCount(options), 8);
  assert.deepEqual(v.generateVariants([], [], 100), []);
});

test("variants: bulk tools set and adjust prices", () => {
  const rows = v.generateVariants(options, [], 15000);
  assert.ok(v.setAllPrices(rows, 12000).every((row) => row.price === 12000));
  const adjusted = v.adjustPrices(rows, "Size", "xl", 2000, 15000);
  assert.deepEqual(adjusted.filter((row) => row.price === 17000).map((row) => row.name), ["XL / Red", "XL / Black"]);
  assert.equal(v.adjustPrices(rows, "Size", "S", -20000, 15000)[0].price, 0, "never below zero");
  assert.deepEqual(v.priceRange(adjusted, 15000), { min: 15000, max: 17000 });
});

test("variants: older saved rows still read, price and match (backward compatible)", () => {
  const legacy = [
    { name: "Black / M", color: "Black", size: "M", price: 6500, stock: 2 },
    { name: "Red / S", color: "Red", size: "S", stock: 0 },
    { name: "Gift box", price: 9000 },
    null,
    "junk",
    { price: 5 },
  ];
  const rows = v.normalizeVariants(legacy);
  assert.equal(rows.length, 3);
  assert.deepEqual(rows[0].options, { Colour: "Black", Size: "M" });
  assert.deepEqual(rows[2].options, { Option: "Gift box" });
  assert.equal(rows[2].name, "Gift box");
  assert.ok(rows.every((row) => row.enabled), "older rows are on");
  assert.deepEqual(v.readVariantOptions(undefined, rows).map((o) => o.name), ["Colour", "Size", "Option"]);
  // The bag's older labels still find the right row and price.
  assert.equal(cart.linePrice(5000, legacy, "Black / M"), 6500);
  assert.equal(cart.linePrice(5000, legacy, "gift box"), 9000);
  const resolved = v.resolveLineVariant({ retailPrice: 5000, variants: legacy }, { label: "Black / M" });
  assert.equal(resolved.ok && resolved.price, 6500);
  assert.equal(v.resolveLineVariant({ retailPrice: 5000, variants: legacy }, { label: "M / Black" }).ok, true, "either order of values");
  // Saving them again keeps name / colour / size for older readers.
  const stored = v.serializeVariants(rows, v.readVariantOptions(undefined, rows));
  assert.equal(stored[0].color, "Black");
  assert.equal(stored[0].size, "M");
  assert.equal(stored[2].name, "Gift box");
  assert.equal(cart.findVariant(stored, "Black / M")?.price, 6500);
  // The storefront helpers agree.
  assert.equal(catalog.lowStockLabel({ variants: legacy }), "Only 2 left");
  assert.equal(catalog.needsOptions({ variants: legacy }), true);
  assert.equal(catalog.needsOptions({ variants: [{ name: "One size" }] }), false);
  assert.deepEqual(edit.editableVariantRows(legacy).map((row) => row.id), ["legacy-0", "legacy-1", "legacy-2"]);
});

test("variants: server price comes from the chosen version, never the browser", () => {
  const rows = v.serializeVariants(v.adjustPrices(v.generateVariants(options, [], 15000), "Size", "XL", 2000, 15000), options);
  const product = { retailPrice: 15000, variants: rows };
  const xl = rows.find((row) => row.name === "XL / Black");
  const byId = v.resolveLineVariant(product, { variantId: xl.id, label: "S / Red" });
  assert.equal(byId.ok && byId.price, 17000, "the id wins over the label");
  const byLabel = v.resolveLineVariant(product, { label: "xl / black" });
  assert.equal(byLabel.ok && byLabel.variant.id, xl.id);
  assert.equal(v.resolveLineVariant(product, { label: "S / Red" }).price, 15000);
  assert.deepEqual(v.resolveLineVariant({ retailPrice: 8000, variants: [] }, { label: "Anything" }), { ok: true, variant: null, price: 8000 }, "no versions: the product price");
  const single = v.resolveLineVariant({ retailPrice: 8000, variants: [{ id: "a", options: { Size: "One" }, price: 9000, enabled: true }] }, {});
  assert.equal(single.ok && single.price, 9000, "one version is chosen for the shopper");
  // A version priced ₦0 sells at ₦0 (a free sample), never at the main price.
  assert.equal(v.variantPrice({ price: 0 }, 5000), 0);
  assert.equal(v.variantCompareAt({ price: 17000, compareAtPrice: 20000 }, { retailPrice: 15000 }), 20000);
  assert.equal(v.variantCompareAt({ price: 17000, compareAtPrice: null }, { retailPrice: 15000, compareAtPrice: 16000 }), null, "a was price below the price is hidden");
});

test("checkout: unknown, switched-off or missing versions are refused", () => {
  const rows = v.serializeVariants(v.generateVariants(options, [], 15000).map((row) => (row.name === "M / Black" ? { ...row, enabled: false } : row)), options);
  const product = { retailPrice: 15000, variants: rows };
  assert.deepEqual(v.resolveLineVariant(product, { label: "Purple / XXL" }), { ok: false, reason: "unknown" });
  assert.deepEqual(v.resolveLineVariant(product, { variantId: "v-nope" }), { ok: false, reason: "unknown" });
  assert.deepEqual(v.resolveLineVariant(product, { label: "M / Black" }), { ok: false, reason: "off" });
  assert.deepEqual(v.resolveLineVariant(product, {}), { ok: false, reason: "choose" }, "a product with sizes needs one chosen");
  // The checkout route prices through resolveLineVariant and accepts the version id.
  const pricing = read("src/lib/commerce/pricing.server.ts");
  assert.match(pricing, /resolveLineVariant\(product, \{ variantId: line\.variantId, label: line\.variant \}\)/);
  assert.match(pricing, /if \(!choice\.ok\)/);
  assert.match(pricing, /`\$\{product\.name\} · \$\{variant\.name\}`/, "the order line names the version: Ankara dress · L / Red");
  assert.doesNotMatch(pricing, /linePrice\(/, "no client-trusting fallback to the product price");
  assert.match(read("src/app/api/public/store/[slug]/checkout/route.ts"), /variantId: z\.string\(\)\.max\(80\)\.optional\(\)/);
  assert.match(read("src/app/api/public/store/[slug]/checkout/quote/route.ts"), /variantId: z\.string\(\)\.max\(80\)\.optional\(\)/);
});

test("checkout: stock per version is held, taken and given back", () => {
  const rows = v.serializeVariants(v.generateVariants([{ name: "Size", values: ["M", "L"] }], [], 5000).map((row) => ({ ...row, stock: row.name === "L" ? 2 : null })), [{ name: "Size", values: ["M", "L"] }]);
  const l = rows.find((row) => row.name === "L");
  assert.equal(v.totalVariantStock(v.normalizeVariants(rows)), 2);

  const taken = v.adjustVariantStock(rows, [{ id: l.id, delta: -2 }]);
  assert.equal(taken.ok, true);
  assert.equal(taken.variants.find((row) => row.id === l.id).stock, 0);
  assert.equal(taken.variants.find((row) => row.name === "M").stock, null, "uncounted versions are left alone");
  assert.deepEqual(v.adjustVariantStock(rows, [{ id: l.id, delta: -3 }]), { ok: false, name: "L" }, "never below zero");
  const back = v.adjustVariantStock(taken.variants, [{ id: l.id, delta: 2 }]);
  assert.equal(back.variants.find((row) => row.id === l.id).stock, 2);
  // Older rows (no ids) are found by position.
  const legacy = [{ name: "Red / M", color: "Red", size: "M", stock: 1 }];
  const legacyTaken = v.adjustVariantStock(legacy, [{ id: "legacy-0", delta: -1 }]);
  assert.equal(legacyTaken.variants[0].stock, 0);
  assert.equal(legacyTaken.variants[0].color, "Red", "the rest of the row is kept");

  // Holds carry the versions for the store's own stock (not for dropship), and survive saving on the order.
  const products = [
    { id: "p1", name: "Ankara dress", currentStock: 5 },
    { id: "p2", name: "Dropship tee", currentStock: 0, fulfillmentType: "dropship", supplierProductId: "s1", supplierProduct: { id: "s1", stockQuantity: 9, status: "published" } },
  ];
  const quantities = new Map([["p1", 3], ["p2", 1]]);
  const variantQuantities = new Map([["p1", [{ id: l.id, quantity: 2, name: "Ankara dress · L" }]], ["p2", [{ id: "x", quantity: 1, name: "Tee" }]]]);
  const built = holds.buildStockHolds(products, quantities, variantQuantities);
  assert.deepEqual(built[0], { source: "store", productId: "p1", quantity: 3, name: "Ankara dress", variants: [{ id: l.id, quantity: 2, name: "Ankara dress · L" }] });
  assert.equal(built[1].source, "supplier");
  assert.equal("variants" in built[1], false);
  assert.deepEqual(holds.parseStockHold(JSON.parse(JSON.stringify(built))), built);
  const totals = holds.variantHoldTotals([...built, { source: "store", productId: "p1", quantity: 1, name: "Ankara dress", variants: [{ id: l.id, quantity: 1, name: "L" }] }]);
  assert.equal(totals.get("p1").get(l.id).quantity, 3, "two holds on one version add up");
  assert.deepEqual(holds.parseStockHold([{ source: "store", productId: "p9", quantity: 1, name: "Old" }]), [{ source: "store", productId: "p9", quantity: 1, name: "Old" }], "older holds without versions still read");

  const stock = read("src/lib/commerce/stock.server.ts");
  assert.match(stock, /FOR UPDATE/, "the product row is locked while its versions change");
  assert.match(stock, /changeVariantStock\(tx, holds, -1, oversell\)/);
  assert.match(stock, /changeVariantStock\(tx, holds, 1\)/);
});

test("saving: options and versions are checked, normalized and keep stock totals right", () => {
  const rows = v.generateVariants(options, [], 15000).map((row, i) => ({ ...row, stock: i }));
  const saved = v.prepareVariantSave({ variants: rows, variantOptions: options }, { inventoryType: "seller" });
  assert.equal(saved.ok, true);
  assert.equal(saved.data.currentStock, 28, "the product's stock is the versions' total");
  assert.equal(saved.data.variants[0].size, "S");
  assert.equal(saved.data.variants[0].color, "Red");
  assert.deepEqual(saved.data.variantOptions, options);
  assert.equal(v.prepareVariantSave({ variants: rows, variantOptions: options }, { inventoryType: "dropshipping" }).data.currentStock, undefined, "dropship stock is the supplier's");
  assert.deepEqual(v.prepareVariantSave({}, {}), { ok: true, data: {} }, "nothing sent, nothing changed");

  const dup = [...rows.slice(0, 2), { ...rows[0], id: "other" }];
  assert.equal(v.prepareVariantSave({ variants: dup, variantOptions: options }, {}).ok, false, "a combination twice is refused");
  assert.match(v.variantSetProblem([{ name: "Size", values: ["S"] }, { name: "size", values: ["M"] }], []), /twice/);
  assert.match(v.variantSetProblem([1, 2, 3, 4].map((n) => ({ name: `O${n}`, values: ["a"] })), []), /at most 3/);

  const phone = v.prepareVariantSave({ variantUpdates: [{ id: saved.data.variants[0].id, price: 9000, stock: 10 }] }, { variants: saved.data.variants, variantOptions: saved.data.variantOptions, inventoryType: "seller" });
  assert.equal(phone.data.variants[0].price, 9000);
  assert.equal(phone.data.currentStock, 38);

  // The zod schemas the API uses.
  assert.equal(schema.VariantRowsSchema.safeParse([{ options: { Size: "S" }, price: -1 }]).success, false, "prices can't be below zero");
  assert.equal(schema.VariantRowsSchema.safeParse([{ options: { Size: "S" }, price: 0 }]).success, true);
  assert.equal(schema.VariantRowsSchema.safeParse([{ options: { Size: "S" } }, { options: { size: "s" } }]).success, false, "unique combinations");
  assert.equal(schema.VariantRowsSchema.safeParse(Array.from({ length: 101 }, (_, i) => ({ options: { N: String(i) } }))).success, false, "at most 100");
  assert.equal(schema.VariantOptionsSchema.safeParse([1, 2, 3, 4].map((n) => ({ name: `O${n}`, values: ["a"] }))).success, false, "at most 3 options");
  assert.equal(schema.VariantRowsSchema.safeParse([{ name: "Red / M", color: "Red", size: "M", price: 5000, stock: 3 }]).success, true, "older rows are still accepted");
  assert.equal(schema.RelatedProductIdsSchema.safeParse(Array.from({ length: 9 }, (_, i) => `p${i}`)).success, false, "up to 8 related products");
  if (schemas) {
    const created = schemas.StoreProductCreateSchema.safeParse({ name: "Ankara dress", retailPrice: 15000, productType: "clothing", productDetails: { material: "Cotton" }, variantOptions: options, variants: rows, relatedProductIds: ["a"] });
    assert.equal(created.success, true, created.error?.issues?.[0]?.message);
    assert.equal(schemas.StoreProductUpdateSchema.safeParse({ variantUpdates: [{ id: "v-s-red", price: 100, stock: 1 }] }).success, true);
    assert.equal(schemas.StoreProductCreateSchema.safeParse({ name: "Old", retailPrice: 100 }).success, true, "products without a type still save");
  }
});

// ─── Storefront ───────────────────────────────────────────────────────────────

test("product page: picking options greys out what can't be bought and moves to a buyable version", () => {
  const rows = v.normalizeVariants(
    v.serializeVariants(
      v.generateVariants(options, [], 15000).map((row) => ({ ...row, stock: row.name === "XL / Red" ? 0 : row.name === "L / Black" ? 3 : null, enabled: row.name !== "S / Black" })),
      options,
    ),
  );
  const names = options.map((o) => o.name);
  assert.deepEqual(v.initialSelection(rows), { Size: "S", Colour: "Red" });
  assert.equal(v.valueAvailable(rows, { Size: "S", Colour: "Red" }, "Colour", "Black"), false, "S / Black is switched off");
  assert.equal(v.valueAvailable(rows, { Size: "XL", Colour: "Black" }, "Colour", "Red"), false, "XL / Red is sold out");
  assert.equal(v.valueAvailable(rows, { Size: "S", Colour: "Red" }, "Size", "XL"), false, "with Red chosen, XL can't be bought");
  assert.equal(v.valueAvailable(rows, { Size: "S", Colour: "Black" }, "Size", "XL"), true);
  assert.deepEqual(v.choose(rows, { Size: "S", Colour: "Red" }, "Colour", "Black", names), { Size: "M", Colour: "Black" }, "moves to the nearest version that can be bought");
  assert.equal(v.matchSelection(rows, { Size: "L", Colour: "Black" }, names).stock, 3);
  assert.equal(v.matchSelection(rows, { Size: "S", Colour: "Black" }, names), null);

  for (const file of ["src/components/storefront/boutique/BoutiqueProductView.tsx", "src/app/s/[slug]/product/[productId]/ProductDetailClient.tsx"]) {
    const src = read(file);
    assert.match(src, /useVariantPicker\(product\)/, `${file} picks versions with the shared picker`);
    assert.match(src, /productDetailRows\(product/, `${file} shows the Details table`);
    assert.match(src, /picker\.line/, `${file} puts the version id in the bag`);
    assert.match(src, /Customers also like/);
  }
  assert.match(read("src/components/storefront/shopper/useVariantPicker.ts"), /variantCompareAt/);
  assert.match(read("src/lib/storefront/product-page.server.ts"), /relatedProducts\(publicProduct, catalog\)/);
});

test("related products: the seller's picks first, else the same type, category or tags", () => {
  const product = { id: "p0", productType: "clothing", category: { slug: "dresses" }, tags: ["ankara"], relatedProductIds: [] };
  const list = [
    { id: "p0" },
    { id: "a", productType: "shoes", tags: [] },
    { id: "b", productType: "clothing", tags: [] },
    { id: "c", category: { slug: "dresses" }, tags: ["Ankara"] },
    { id: "d" },
  ];
  assert.deepEqual(catalog.relatedProducts(product, list).map((p) => p.id), ["c", "b", "a", "d"]);
  assert.deepEqual(catalog.relatedProducts({ ...product, relatedProductIds: ["d", "zz", "p0", "a"] }, list).map((p) => p.id), ["d", "a"], "picks in order, never itself or unknown ids");
  assert.equal(catalog.relatedProducts(product, Array.from({ length: 20 }, (_, i) => ({ id: `x${i}` }))).length, 8);
});

test("orders and emails name the version", () => {
  assert.match(read("src/app/home/orders/[id]/page.tsx"), /item\.variant && !name\.includes\(item\.variant\)/);
  // The confirmation email lists item names, which carry the version.
  assert.match(read("src/app/api/public/store/[slug]/checkout/route.ts"), /orderItems\.map\(\(item\) => \(\{ name: item\.name/);
  const line = cart.sanitizeLines([{ productId: "p1", name: "Ankara dress · L / Red", price: 1, quantity: 1, variant: "L / Red", variantId: "v-l-red" }])[0];
  assert.equal(line.variantId, "v-l-red", "the bag keeps the version id");
});

// ─── Peggy ────────────────────────────────────────────────────────────────────

const emptyForm = { name: "Ankara dress", description: "", productType: "clothing", basePrice: 15000, options: [], variants: [], details: {}, customDetails: [] };

test("Peggy: a suggestion is checked with zod before the form sees it", async () => {
  const good = {
    message: "Added 4 sizes in red and black. L and XL cost ₦2,000 more.",
    productType: "clothing",
    name: null,
    description: null,
    basePrice: null,
    options: [{ name: "Size", values: ["S", "M", "L", "XL"] }, { name: "Colour", values: ["Red", "Black"] }],
    priceAdjustments: [{ option: "Size", value: "L", amount: 2000 }, { option: "Size", value: "XL", amount: 2000 }],
    variantPrices: [{ options: { Size: "XL", Colour: "Black" }, price: null, stock: 4 }],
    details: { material: "Cotton" },
    customDetails: [{ name: "Origin", value: "Aba" }],
  };
  assert.equal(schema.ProductSuggestionSchema.safeParse(good).success, true);
  assert.equal(schema.ProductSuggestionSchema.safeParse({ ...good, productType: "spaceship" }).success, false);
  assert.equal(schema.ProductSuggestionSchema.safeParse({ ...good, basePrice: -5 }).success, false);
  assert.equal(schema.ProductSuggestionSchema.safeParse({ ...good, options: [1, 2, 3, 4].map((n) => ({ name: `O${n}`, values: ["a"] })) }).success, false);
  assert.equal(schema.ProductSuggestionSchema.safeParse({ message: "Hi" }).success, false, "every key is required (null = leave it)");
  assert.equal(schema.ProductSuggestionSchema.safeParse(assistant.withSuggestionDefaults({ message: "Hi", basePrice: 9000 })).success, true, "missing keys become null");

  const { state, changes } = assistant.applySuggestion(emptyForm, good);
  assert.equal(state.variants.length, 8);
  assert.equal(state.variants.find((row) => row.name === "XL / Black").price, 17000);
  assert.equal(state.variants.find((row) => row.name === "XL / Black").stock, 4);
  assert.equal(state.variants.find((row) => row.name === "S / Red").price, 15000);
  assert.equal(state.details.material, "Cotton");
  assert.deepEqual(state.customDetails, [{ name: "Origin", value: "Aba" }]);
  assert.ok(changes.some((line) => /8 versions/.test(line)));
  assert.equal(emptyForm.variants.length, 0, "the form passed in is not changed");
  assert.match(assistant.priceSummary(state.variants, 15000), /₦15,000.*₦17,000/);

  // The API route validates the request and the model's reply the same way.
  assert.match(read("src/lib/products/assistant.server.ts"), /ProductSuggestionSchema\.safeParse/);
  assert.match(read("src/app/api/app/products/assistant/route.ts"), /ProductAssistantRequestSchema\.safeParse/);
  assert.equal(schema.ProductAssistantRequestSchema.safeParse({ message: "sizes S M", form: {} }).success, true);
  assert.equal(schema.ProductAssistantRequestSchema.safeParse({ message: "", form: {} }).success, false);
});

test("Peggy without AI still understands everyday requests", () => {
  const suggestion = assistant.ruleBasedSuggestion("sizes S M L XL, red and black, L and XL cost 2000 more", emptyForm);
  assert.deepEqual(suggestion.options, [{ name: "Size", values: ["S", "M", "L", "XL"] }, { name: "Colour", values: ["Red", "Black"] }]);
  assert.deepEqual(suggestion.priceAdjustments, [{ option: "Size", value: "L", amount: 2000 }, { option: "Size", value: "XL", amount: 2000 }]);
  assert.equal(suggestion.basePrice, null, "\"2000 more\" is not the main price");
  assert.equal(schema.ProductSuggestionSchema.safeParse(suggestion).success, true);
  assert.equal(assistant.ruleBasedSuggestion("price 12k", emptyForm).basePrice, 12000);
  assert.equal(assistant.ruleBasedSuggestion("hello", emptyForm), null);
});

test("Peggy tool: set_product_variants previews first and shares the form's rules", () => {
  const input = { product: "Ankara dress", options: [{ name: "Size", values: ["S", "M"] }, { name: "Colour", values: ["Red"] }], basePrice: 15000, priceAdjustments: null, exactPrices: [{ values: ["M", "Red"], price: 18000, stock: 2 }], confirmCode: null };
  assert.equal(peggyPure.parseToolInput("set_product_variants", input).ok, true);
  assert.equal(peggyPure.parseToolInput("set_product_variants", { ...input, options: [] }).ok, false);
  assert.equal(peggyPure.PEGGY_TOOL_SPECS.set_product_variants.write, true);
  const suggestion = peggySpecs.variantsSuggestion(input);
  assert.deepEqual(suggestion.variantPrices, [{ options: { Size: "M", Colour: "Red" }, price: 18000, stock: 2 }]);
  const { state } = assistant.applySuggestion({ ...emptyForm, basePrice: 12000 }, suggestion);
  assert.deepEqual(state.variants.map((row) => [row.name, row.price, row.stock]), [["S / Red", 15000, null], ["M / Red", 18000, 2]]);
  const tool = read("src/lib/ai/peggy/products-tools.ts");
  assert.match(tool, /checkConfirmationCode\(input\.confirmCode, parts\)/, "saves only with the seller's confirmation");
  assert.match(tool, /NOT SAVED YET/);
  assert.match(tool, /productFieldsData\(/, "the same checks as the product API");
});

test("product form: Peggy greets once per session, and the form saves type, details, versions and related products", () => {
  const peggy = read("src/app/components/product-form/ProductPeggy.tsx");
  assert.match(peggy, /sessionStorage/);
  assert.match(peggy, /\/api\/app\/products\/assistant/);
  assert.match(en["peggy.greeting"], /^I'm here to help with this product\. Tell me the sizes, colours and prices, and I'll fill them in\. You can also send a photo\.$/);
  const form = read("src/app/components/ProductForm.tsx");
  for (const key of ["productType:", "productDetails:", "relatedProductIds: relatedIds", "variantPayload("]) assert.ok(form.includes(key), key);
  assert.match(form, /<ProductPeggy /);
  assert.match(form, /w-\[96px\] shrink-0/, "the weight unit keeps its fixed-width box");
  const api = read("src/app/api/store/products/[id]/route.ts");
  assert.match(api, /productFieldsData\(/);
  assert.match(read("docs/migrations/2026-10-27-product-types.sql"), /ADD COLUMN IF NOT EXISTS "productType"/);
  assert.match(read("prisma/schema.prisma"), /relatedProductIds String\[\]\s+@default\(\[\]\)/);
});

test("phone: version price and stock become variantUpdates, details only when changed", () => {
  const rows = [
    { id: "a", name: "S", price: null, stock: 3, enabled: true },
    { id: "b", name: "M", price: 9000, stock: null, enabled: true },
  ];
  const edits = edit.variantEditsFrom(rows);
  assert.deepEqual(edits, { a: { price: "", stock: "3" }, b: { price: "9000", stock: "" } });
  assert.deepEqual(edit.variantUpdatesFrom(rows, edits), { ok: true, updates: [] });
  assert.deepEqual(edit.variantUpdatesFrom(rows, { ...edits, a: { price: "12,000", stock: "" } }), { ok: true, updates: [{ id: "a", price: 12000, stock: null }] });
  assert.deepEqual(edit.variantUpdatesFrom(rows, { ...edits, b: { price: "abc", stock: "" } }), { ok: false, problem: "variantPrice", name: "M" });
  assert.deepEqual(edit.variantUpdatesFrom(rows, { ...edits, b: { price: "", stock: "1.5" } }), { ok: false, problem: "variantStock", name: "M" });
  assert.equal(edit.detailsPatch({ material: "Cotton" }, { material: "Cotton " }), null);
  assert.deepEqual(edit.detailsPatch({ material: "Cotton" }, { material: "", fit: "Slim fit" }), { fit: "Slim fit" });
  const screen = read("apps/mobile/src/app/product/[id].tsx");
  assert.match(screen, /variantUpdates: versions\.updates/);
  assert.match(screen, /type\.fields\.map/);
});
