// The phone's full product editor (apps/mobile/src/lib/product-more-pure.ts, app/product/[id].tsx): everything the
// web product form fills in, saved with the web form's PATCH route and limits. Node strips the types natively.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const more = await import("../apps/mobile/src/lib/product-more-pure.ts");
const variants = await import("../shared/product-variants.ts");
const schemas = await import("../src/lib/schemas/index.ts").catch(() => null);
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const stored = {
  longDescription: "Hand made in Aba.",
  specifications: [{ name: "Origin", value: "Aba" }],
  faqs: [{ question: "Is it leather?", answer: "Yes, real leather." }],
  careInstructions: "Wipe clean",
  shippingInfo: null,
  returnPolicy: "7 days",
  warranty: null,
  supportInfo: null,
  sku: "TOTE-1",
  barcode: null,
  videoUrl: null,
  tags: ["leather", "bag"],
  costPrice: 8000,
  weight: null,
  weightUnit: "kg",
  featured: false,
  trackStock: true,
  continueSellingWhenOut: false,
  reservedStock: 0,
  seoTitle: null,
  seoDescription: null,
};

test("product details: nothing changed sends nothing", () => {
  const form = more.moreFormFrom(stored);
  assert.equal(form.tags, "leather, bag");
  assert.equal(form.costPrice, "8000");
  assert.equal(form.specs.length, 1);
  assert.deepEqual(more.morePatch(stored, form, { tracksStock: true }), { ok: true, patch: {} });
});

test("product details: only the changed fields go, cleaned like the web form", () => {
  const form = more.moreFormFrom(stored);
  const edited = {
    ...form,
    longDescription: "  Hand made in Aba, Abia.  ",
    shippingInfo: "Sent in 2 days",
    tags: "leather, Bag, gift, ,leather",
    videoUrl: "youtube.com/watch?v=abc",
    sku: "TOTE-2",
    weight: "0.5",
    weightUnit: "g",
    featured: true,
    trackStock: true,
    continueSelling: true,
    reservedStock: "2",
    seoTitle: "Leather tote",
    specs: [...form.specs, { key: "x", name: "Colour", value: "Brown" }, { key: "y", name: "", value: "" }],
    faqs: [],
  };
  const result = more.morePatch(stored, edited, { tracksStock: true });
  assert.equal(result.ok, true);
  assert.deepEqual(result.patch, {
    longDescription: "Hand made in Aba, Abia.",
    specifications: [{ name: "Origin", value: "Aba" }, { name: "Colour", value: "Brown" }],
    faqs: [],
    shippingInfo: "Sent in 2 days",
    sku: "TOTE-2",
    videoUrl: "https://youtube.com/watch?v=abc",
    tags: ["leather", "Bag", "gift"],
    weight: 0.5,
    weightUnit: "g",
    featured: true,
    continueSellingWhenOut: true,
    reservedStock: 2,
    seoTitle: "Leather tote",
  });
  // The web's update schema takes it (when the schema module loads here).
  if (schemas) assert.equal(schemas.StoreProductUpdateSchema.safeParse(result.patch).success, true);
});

test("product details: half-filled rows, bad links and amounts stop the save with the row number", () => {
  const form = more.moreFormFrom(stored);
  assert.deepEqual(more.morePatch(stored, { ...form, specs: [{ key: "a", name: "Origin", value: "" }] }, { tracksStock: true }), { ok: false, problem: "spec", row: 1 });
  assert.deepEqual(more.morePatch(stored, { ...form, faqs: [...form.faqs, { key: "b", question: "", answer: "Yes" }] }, { tracksStock: true }), { ok: false, problem: "faq", row: 2 });
  assert.deepEqual(more.morePatch(stored, { ...form, videoUrl: "not a link" }, { tracksStock: true }), { ok: false, problem: "video" });
  assert.deepEqual(more.morePatch(stored, { ...form, costPrice: "" }, { tracksStock: true }), { ok: false, problem: "costPrice" }, "cost can't be emptied (the API takes numbers above 0)");
  assert.deepEqual(more.morePatch(stored, { ...form, weight: "heavy" }, { tracksStock: true }), { ok: false, problem: "weight" });
  assert.deepEqual(more.morePatch(stored, { ...form, reservedStock: "1.5" }, { tracksStock: true }), { ok: false, problem: "reserved" });
  assert.deepEqual(more.morePatch(stored, { ...form, seoTitle: "x".repeat(71) }, { tracksStock: true }), { ok: false, problem: "seoTitle" });
  assert.deepEqual(more.morePatch(stored, { ...form, shippingInfo: "x".repeat(5001) }, { tracksStock: true }), { ok: false, problem: "longText" });
});

test("product details: stock settings only for own stock, and only when the server sent them", () => {
  const form = { ...more.moreFormFrom(stored), trackStock: false, continueSelling: true };
  assert.deepEqual(more.morePatch(stored, form, { tracksStock: true }).patch, { trackStock: false });
  assert.deepEqual(more.morePatch(stored, form, { tracksStock: false }).patch, {});
  const older = { ...stored, trackStock: undefined };
  assert.deepEqual(more.morePatch(older, form, { tracksStock: true }).patch, {});
});

test("product details: tags, video links, margin, row moves", () => {
  assert.deepEqual(more.parseTags("#sale, Sale, gift\nshoes"), ["sale", "gift", "shoes"]);
  assert.equal(more.cleanVideoUrl(""), "");
  assert.equal(more.cleanVideoUrl("https://www.tiktok.com/@shop/video/1"), "https://www.tiktok.com/@shop/video/1");
  assert.equal(more.cleanVideoUrl("hello"), null);
  assert.equal(more.marginPercent(10000, 6000), 40);
  assert.equal(more.marginPercent(null, 6000), null);
  assert.deepEqual(more.moveRow(["a", "b", "c"], 2, -1), ["a", "c", "b"]);
  assert.deepEqual(more.moveRow(["a", "b"], 0, -1), ["a", "b"]);
});

test("sizes and colours: add, extend and remove options; prices and stock are kept", () => {
  let state = { options: [], rows: [] };
  let result = more.addOption(state, "Size", "S, M, m, L");
  assert.equal(result.ok, true);
  state = result.state;
  assert.deepEqual(state.options, [{ name: "Size", values: ["S", "M", "L"] }]);
  assert.deepEqual(state.rows.map((row) => row.name), ["S", "M", "L"]);
  assert.equal(state.rows[0].price, null, "new versions follow the main price");
  assert.deepEqual(more.addOption(state, "size", "XL"), { ok: false, problem: "optionTwice" });
  assert.deepEqual(more.addOption(state, " ", "XL"), { ok: false, problem: "optionName" });

  // A size with its own price keeps it when colours are added.
  state = { ...state, rows: state.rows.map((row) => (row.name === "L" ? { ...row, price: 12000, stock: 4 } : row)) };
  state = more.addOption(state, "Colour", "Red, Black").state;
  assert.equal(state.rows.length, 6);
  assert.equal(state.rows.find((row) => row.name === "L / Red").price, 12000);

  state = more.addOptionValues(state, 0, "XL").state;
  assert.equal(state.rows.length, 8);
  state = more.removeOptionValue(state, 1, "Black").state;
  assert.equal(state.rows.length, 4);
  state = more.removeOption(state, 1).state;
  assert.deepEqual(state.rows.map((row) => row.name), ["S", "M", "L", "XL"]);

  const big = more.addOption({ options: [{ name: "A", values: Array.from({ length: 11 }, (_, i) => `a${i}`) }], rows: [] }, "B", Array.from({ length: 10 }, (_, i) => `b${i}`).join(","));
  assert.deepEqual(big, { ok: false, problem: "tooMany", count: 110 });
});

test("sizes and colours: same shape sends variantUpdates (with on/off); a new shape sends every row", () => {
  const rows = variants.normalizeVariants([
    { id: "s", options: { Size: "S" }, name: "S", price: null, stock: 3, enabled: true },
    { id: "m", options: { Size: "M" }, name: "M", price: 9000, stock: null, enabled: true },
  ]);
  const before = { options: [{ name: "Size", values: ["S", "M"] }], rows };
  const editable = rows.map(({ id, name, price, stock, enabled }) => ({ id, name, price, stock, enabled }));
  const edits = { s: { price: "", stock: "5" }, m: { price: "9000", stock: "" } };
  const same = more.versionSave(editable, before, before, edits, { s: true, m: false });
  assert.deepEqual(same, { ok: true, updates: [{ id: "s", stock: 5 }, { id: "m", enabled: false }], full: null });

  const after = more.addOptionValues(before, 0, "L").state;
  const allEdits = more.editsWithNew(after.rows, edits);
  assert.deepEqual(allEdits.l ?? allEdits[after.rows[2].id], { price: "", stock: "" });
  const changed = more.versionSave(editable, before, after, allEdits, { s: true, m: true });
  assert.equal(changed.ok, true);
  assert.deepEqual(changed.full.variantOptions, [{ name: "Size", values: ["S", "M", "L"] }]);
  assert.deepEqual(changed.full.variants.map((row) => [row.name, row.price, row.stock, row.size]), [["S", null, 5, "S"], ["M", 9000, null, "M"], ["L", null, null, "L"]]);
  if (schemas) assert.equal(schemas.StoreProductUpdateSchema.safeParse(changed.full).success, true);

  assert.deepEqual(more.versionSave(editable, before, after, { ...allEdits, s: { price: "abc", stock: "" } }, {}), { ok: false, problem: "variantPrice", name: "S" });
});

test("the phone screen edits everything natively; only the page layout opens the website", () => {
  const screen = read("apps/mobile/src/app/product/[id].tsx");
  for (const call of ["morePatch(", "versionSave(", "addOption(", "removeOption(", "moveRow(", "makeMainPhoto("]) assert.ok(screen.includes(call), call);
  assert.doesNotMatch(screen, /edit\.moreOnWeb/);
  assert.equal((screen.match(/openWeb\(/g) ?? []).length, 1, "one link: the product page layout");
  assert.doesNotMatch(screen, /window\.(confirm|alert|prompt)/);
  const route = read("src/app/api/app/store-products/[id]/route.ts");
  for (const field of ["longDescription", "specifications", "faqs", "shippingInfo", "returnPolicy", "supportInfo", "videoUrl", "tags", "trackStock", "variantRows"]) assert.ok(route.includes(field), field);
  const en = read("shared/i18n/messages/m_productedit/en.ts");
  const keys = [...en.matchAll(/^  "([^"]+)":/gm)].map((match) => match[1]);
  for (const lang of ["pcm", "yo", "ha", "ig"]) {
    const words = read(`shared/i18n/messages/m_productedit/${lang}.ts`);
    for (const key of keys.filter((key) => /^(fold|spec|opt|faq|policy|codes|more|stock|ptype|long)\./.test(key))) assert.ok(words.includes(`"${key}":`), `${lang} ${key}`);
  }
  assert.doesNotMatch(en, /\b(error|failed|invalid)\b/i);
});
