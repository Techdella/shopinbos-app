// Peggy's catalogue helpers: the bulk import check (column mapping, row problems, accepted suggestions), the
// validation of AI-written product content, and editing many products at once. All pure.
import test from "node:test";
import assert from "node:assert/strict";

const imp = await import("../shared/product-import.ts");
const content = await import("../shared/product-content.ts");
const edit = await import("../shared/product-bulk-edit.ts");

test("import columns: known names match, unknown ones are guessed once, the rest become details", () => {
  const columns = imp.suggestColumnMapping(["Item Title", "Selling Price (₦)", "Old Price", "Qty Available", "Pic link", "Colour", "Unit Cost", "Department", "id"]);
  const by = Object.fromEntries(columns.map((c) => [c.header, c]));
  assert.equal(by["Item Title"].target, "name");
  assert.equal(by["Selling Price (₦)"].target, "retailPrice");
  assert.equal(by["Old Price"].target, "compareAtPrice");
  assert.equal(by["Qty Available"].target, "stock");
  assert.equal(by["Pic link"].target, "images");
  assert.equal(by["Unit Cost"].target, "costPrice");
  assert.equal(by["Department"].target, "category");
  assert.equal(by["Colour"].target, "detail");
  assert.equal(by["id"].target, "ignored");
  assert.equal(by["Item Title"].how, "guessed");

  // A field already matched by a known name isn't guessed again.
  const twice = imp.suggestColumnMapping(["name", "price", "Retail Amount"]);
  assert.equal(twice[2].target, "detail");

  // The chosen columns are what the import reads.
  const map = imp.columnMapFrom(columns);
  assert.equal(imp.importHeadersProblem(Object.keys(map)), imp.importHeadersProblem(["Item Title"]), "without the map the file has no name/price columns");
  assert.equal(imp.importHeadersProblem(Object.keys(map), map), null);
  const row = imp.mapImportRow({ "Item Title": "Smart Lamp", "Selling Price (₦)": "₦15,000", Colour: "White", Department: "Lighting" }, "NGN", map);
  assert.equal(row.name, "Smart Lamp");
  assert.equal(row.retailPrice, 15000);
  assert.equal(row.category, "Lighting");
  assert.deepEqual(row.specifications, [{ name: "Colour", value: "White" }]);
  assert.equal(imp.isColumnTarget("price"), false);
  assert.equal(imp.isColumnTarget("retailPrice"), true);
});

test("import check flags missing and odd data", () => {
  const rows = [
    { name: "Lamp", price: "15000", sku: "L-1", cost: "20000", images: "https://cdn.example.com/lamp.jpg" },
    { name: "Lamp 2", price: "abc", sku: "L-2" },
    { name: "", price: "100" },
    { name: "Fan", price: "", sku: "F-1" },
    { name: "Lamp copy", price: "9000", sku: "l-1", images: "lamp-side.jpg | http://localhost/y.jpg" },
    { name: "Kettle", price: "8000", sku: "K-9", compareAtPrice: "5000", images: "" },
  ];
  const analysis = imp.analyseImport(rows, { currency: "NGN", existingSkus: new Set(["k-9"]), uploaded: new Map([["kettle.jpg", "https://proj.supabase.co/kettle.jpg"]]) });
  const kinds = analysis.issues.map((issue) => `${issue.row}:${issue.kind}`);
  assert.ok(kinds.includes("2:cost_above_price"));
  assert.ok(kinds.includes("3:bad_price"));
  assert.ok(kinds.includes("4:no_name"));
  assert.ok(kinds.includes("5:no_price"));
  assert.ok(kinds.includes("6:duplicate_sku"));
  assert.ok(kinds.includes("6:photo_missing"));
  assert.ok(kinds.includes("6:bad_image_link"));
  assert.ok(kinds.includes("7:sku_exists"));
  assert.ok(kinds.includes("7:was_price_low"));
  assert.deepEqual(analysis.counts, { rows: 6, ready: 3, blocked: 3, noPhoto: 1, noDescription: 3 });
  assert.deepEqual(analysis.rows[5].images, ["https://proj.supabase.co/kettle.jpg"], "an uploaded photo named after the product is matched");
  assert.ok(imp.BLOCKING_ISSUES.has("no_price"));
});

test("AI-written content is checked field by field and matched to its product", () => {
  const clean = content.sanitizeContent({
    description: "  A bright lamp.  ",
    seoTitle: "x".repeat(90),
    specifications: [{ name: "Power", value: "10W" }, { name: "", value: "bad" }, { name: "power", value: "dup" }, "nonsense"],
    tags: ["lamp", "Lamp", 5],
    productType: "Electronics",
    productDetails: { condition: "Brand new", __proto__x: "no", made: { up: true } },
    faqs: [{ question: "Does it charge?", answer: "Yes" }, { question: "No answer" }],
    storeId: "store-B",
    price: 1,
  });
  assert.equal(clean.description, "A bright lamp.");
  assert.ok(clean.seoTitle.length <= 70 && clean.seoTitle.endsWith("…"));
  assert.deepEqual(clean.specifications, [{ name: "Power", value: "10W" }]);
  assert.deepEqual(clean.tags, ["lamp"]);
  assert.equal(clean.productType, "electronics");
  assert.equal(clean.faqs.length, 1);
  assert.equal("storeId" in clean, false);
  assert.equal("price" in clean, false);
  assert.deepEqual(content.sanitizeContent({ productType: "spaceships", description: 42 }), {});

  const parsed = content.parseContentReply({ products: [{ index: 2, description: "Second" }, { index: 1, description: "First" }, { index: 9, description: "Nobody" }] }, 3);
  assert.deepEqual(parsed.map((p) => p?.description ?? null), ["First", "Second", null]);
  assert.deepEqual(content.parseContentReply(null, 2), [null, null]);
});

test("without AI, the rules still fill type, specs, tags, category and SEO from the columns", () => {
  const filled = content.ruleBasedContent({ name: "Ankara wrap dress", category: "women clothing", specifications: [{ name: "Size", value: "M" }], tags: ["Ankara"] });
  assert.equal(filled.productType, "clothing");
  assert.equal(filled.category, "Women Clothing");
  assert.deepEqual(filled.specifications, [{ name: "Size", value: "M" }]);
  assert.equal(filled.seoTitle, "Ankara wrap dress");
  assert.match(filled.description, /- Size: M/);
  assert.deepEqual(filled.tags, ["women clothing", "ankara"]);
  assert.deepEqual(Object.keys(content.ruleBasedContent({ name: "Lamp", description: "Bright" }, ["seo"])).sort(), ["seoDescription", "seoTitle"]);
});

test("accepted import suggestions are validated and merged over the columns", () => {
  assert.equal(content.ImportEnhancementsSchema.safeParse({ 0: { description: "Hi" } }).success, true);
  assert.equal(content.ImportEnhancementsSchema.safeParse({ 0: { storeId: "x" } }).success, false, "unknown fields are refused");
  assert.equal(content.ImportEnhancementsSchema.safeParse({ abc: { description: "Hi" } }).success, false, "keys are row numbers");
  const merged = content.mergeEnhancement(
    { name: "Lamp", description: null, tags: ["old"], specifications: [{ name: "Colour", value: "White" }] },
    { description: "Bright", category: "Lighting", productType: "other", seoTitle: "Lamp", specifications: [{ name: "Power", value: "10W" }] },
  );
  assert.equal(merged.description, "Bright");
  assert.equal(merged.categoryName, "Lighting");
  assert.deepEqual(merged.specifications, [{ name: "Power", value: "10W" }]);
  assert.deepEqual(merged.tags, ["old"]);
  assert.equal(merged.extra.productType, null, "other is saved as no type");
  assert.equal(merged.extra.seoTitle, "Lamp");
  assert.deepEqual(content.mergeEnhancement({ description: "a", tags: [], specifications: [] }, undefined).extra, {});
});

const product = (extra = {}) => ({
  id: "p1", name: "Smart Lamp", retailPrice: 15000, description: "Old", longDescription: null, specifications: [{ name: "Colour", value: "White" }], faqs: [],
  careInstructions: null, shippingInfo: null, returnPolicy: null, warranty: null, supportInfo: null, seoTitle: null, seoDescription: null, productType: null,
  productDetails: {}, categoryId: null, categoryName: null, tags: ["lamp"], weight: null, weightUnit: "kg", dimensions: null, relatedProductIds: [], compareAtPrice: null, ...extra,
});
const none = () => Object.fromEntries(Object.keys(edit.ProductChangesSchema.shape).map((key) => [key, null]));

test("product edits: before → after, nothing for unchanged fields, details and specs merged", () => {
  const changes = { ...none(), warranty: "12 months", description: "Old", specifications: { mode: "merge", items: [{ name: "Power", value: "10W" }, { name: "colour", value: "" }] }, tags: { mode: "add", items: ["Lamp", "smart"] }, productType: "electronics", productDetails: [{ key: "condition", value: "Brand new" }, { key: "warranty", value: "ignored when warranty is set" }], compareAtPrice: 20000, weight: 1.5 };
  const applied = edit.applyProductChanges(product(), changes);
  assert.equal(applied.data.description, undefined, "same description: no change");
  assert.equal(applied.data.warranty, "12 months");
  assert.deepEqual(applied.data.specifications, [{ name: "Power", value: "10W" }]);
  assert.deepEqual(applied.data.tags, ["lamp", "smart"]);
  assert.equal(applied.data.productType, "electronics");
  assert.deepEqual(applied.data.productDetails, { condition: "Brand new" });
  assert.equal(applied.data.compareAtPrice, 20000);
  assert.equal(applied.data.weight, 1.5);
  const preview = edit.editPreview([{ name: "Smart Lamp", diff: applied.diff }]);
  assert.match(preview, /Smart Lamp:\n  - Warranty: \(empty\) → 12 months/);
  assert.match(preview, /Specs: Colour: White → Power: 10W/);

  const cleared = edit.applyProductChanges(product({ seoTitle: "Lamp", compareAtPrice: 20000 }), { ...none(), seoTitle: "", compareAtPrice: 0, relatedProducts: [] }, { related: [] });
  assert.equal(cleared.data.seoTitle, null);
  assert.equal(cleared.data.compareAtPrice, null);
  assert.equal(cleared.data.relatedProductIds, undefined, "already empty");
  const low = edit.applyProductChanges(product(), { ...none(), compareAtPrice: 100 });
  assert.equal(low.problems.length, 1);
  assert.deepEqual(low.data, {});
});

test("product edits: picking products by name, category, tag and type, 50 at a time", () => {
  const list = Array.from({ length: 120 }, (_, i) => ({ id: `p${i}`, name: `Lamp ${String(i).padStart(3, "0")}`, categoryName: i % 2 ? "Lighting" : "Kitchen", tags: i % 3 ? [] : ["sale"], productType: i < 10 ? "home" : null }));
  const all = edit.selectProducts(list, { products: null, name: "lamps", category: null, tag: null, productType: null, batch: null });
  assert.equal(all.ok, true);
  assert.equal(all.total, 120);
  assert.equal(all.products.length, edit.EDIT_MAX_PRODUCTS);
  assert.equal(all.batches, 3);
  const third = edit.selectProducts(list, { products: null, name: "lamp", category: null, tag: null, productType: null, batch: 3 });
  assert.equal(third.products.length, 20);
  assert.equal(edit.selectProducts(list, { products: null, name: null, category: "kitchen", tag: "sale", productType: null, batch: null }).total, 20);
  assert.equal(edit.selectProducts(list, { products: null, name: null, category: null, tag: null, productType: "home", batch: null }).total, 10);
  assert.equal(edit.selectProducts(list, { products: null, name: null, category: null, tag: null, productType: "other", batch: null }).total, 110, "no type = other");
  const ambiguous = edit.selectProducts(list, { products: ["Lamp 00"], name: null, category: null, tag: null, productType: null, batch: null });
  assert.equal(ambiguous.ok, false);
  assert.match(ambiguous.error, /matches 11 products/);
  assert.equal(edit.EditTargetSchema.safeParse({ products: null, name: null, category: null, tag: null, productType: null, batch: null }).success, false);
});

test("product edit codes are tied to the products and the exact change", () => {
  const a = edit.editConfirmationParts("s", ["b", "a"], { changes: { x: 1, y: 2 } });
  const b = edit.editConfirmationParts("s", ["a", "b"], { changes: { y: 2, x: 1 } });
  assert.deepEqual(a, b, "order doesn't matter");
  assert.notDeepEqual(a, edit.editConfirmationParts("s", ["a"], { changes: { x: 1, y: 2 } }));
  assert.notDeepEqual(a, edit.editConfirmationParts("s", ["a", "b"], { changes: { x: 1, y: 3 } }));
  const changes = edit.suggestionToChanges({ description: "New", tags: ["a"], specifications: [{ name: "Power", value: "10W" }] });
  assert.equal(edit.ProductChangesSchema.safeParse(changes).success, true, "written content is a valid change");
  assert.equal(changes.tags.mode, "add");
  assert.equal(changes.specifications.mode, "merge");
});
