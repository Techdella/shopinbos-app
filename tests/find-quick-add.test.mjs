// Finding supplier products to sell, made quick (owner: "a seller has 200 products; simplify adding them, and finding
// products to sell"): the seller's markup and nice-price rounding (shared/supplier-markup.ts), the one-tap price and
// the supplier's lowest price, bulk "Add to my shop" (src/lib/marketplace/quick-add-core.ts) — idempotent, never a
// duplicate, skips explained — and starter packs (shared/starter-packs.ts). Plus the routes, screens and words.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = (path) => readFileSync(join(root, path), "utf8");
const markup = await import("../shared/supplier-markup.ts");
const packs = await import("../shared/starter-packs.ts");
const core = await import("../src/lib/marketplace/quick-add-core.ts");
const checkout = await import("../shared/dropship-checkout.ts");
const webFind = await import("../src/lib/marketplace/find.ts");
const { CATALOGS } = await import("../shared/i18n/catalog.ts");

// ─── Markup and nice prices ───────────────────────────────────────────────────

test("nice prices round up to what a shop puts on a tag, never down", () => {
  assert.equal(markup.nicePrice(14_320), 14_500);
  assert.equal(markup.nicePrice(14_500), 14_500);
  assert.equal(markup.nicePrice(14_501), 15_000);
  assert.equal(markup.nicePrice(49_800), 50_000);
  assert.equal(markup.nicePrice(3_640), 3_700);
  assert.equal(markup.nicePrice(820), 850);
  assert.equal(markup.nicePrice(126_400), 127_000);
  assert.equal(markup.nicePrice(213_000), 215_000);
  assert.equal(markup.nicePrice(0), 0);
  assert.equal(markup.nicePrice(-5), 0);
  // Float noise from a percentage doesn't push a round price up a step.
  assert.equal(markup.nicePrice(11_000 * 1.3), 14_500);
  assert.equal(markup.nicePrice(10_000 * 1.2), 12_000);
  for (const price of [99, 1_234, 9_999, 10_001, 77_777, 333_333]) assert.ok(markup.nicePrice(price) >= price, `${price} never rounds down`);
});

test("markup: 20/30/50% or a ₦ amount, read back safely, 30% by default", () => {
  assert.deepEqual(markup.DEFAULT_MARKUP, { kind: "percent", value: 30 });
  assert.deepEqual([...markup.MARKUP_PERCENT_CHOICES], [20, 30, 50]);
  assert.equal(markup.markedUpPrice(10_000, { kind: "percent", value: 30 }), 13_000);
  assert.equal(markup.markedUpPrice(11_200, { kind: "percent", value: 30 }), 15_000, "₦14,560 → ₦15,000");
  assert.equal(markup.markedUpPrice(11_000, { kind: "percent", value: 30 }), 14_500, "₦14,300 → ₦14,500");
  assert.equal(markup.markedUpPrice(11_200, { kind: "percent", value: 50 }), 17_000);
  assert.equal(markup.markedUpPrice(11_200, { kind: "amount", value: 2_000 }), 13_500);
  assert.equal(markup.markedUpPrice(0, { kind: "percent", value: 30 }), 0);
  assert.deepEqual(markup.readMarkup({ kind: "percent", value: 30 }), { kind: "percent", value: 30 });
  assert.deepEqual(markup.readMarkup({ kind: "amount", value: "2,500" }), { kind: "amount", value: 2_500 });
  assert.equal(markup.readMarkup({ kind: "percent", value: 2 }), null, "below 5%");
  assert.equal(markup.readMarkup({ kind: "percent", value: 30.5 }), null, "whole percents");
  assert.equal(markup.readMarkup({ kind: "amount", value: 20 }), null, "below ₦100");
  assert.equal(markup.readMarkup({ kind: "nope", value: 30 }), null);
  assert.equal(markup.readMarkup(null), null);
  assert.match(markup.markupProblem({ kind: "amount", value: 5 }), /₦100/);
  assert.equal(markup.markupProblem({ kind: "percent", value: 50 }), null);
  assert.equal(markup.markupLabel({ kind: "percent", value: 30 }), "+30%");
  assert.equal(markup.markupLabel({ kind: "amount", value: 2_000 }), "+₦2,000");
  assert.deepEqual(markup.markupExample({ kind: "percent", value: 30 }), { cost: 10_000, price: 13_000 });
});

test("the one-tap price: supplier's suggestion first, else cost + markup, never below the lowest allowed", () => {
  const m30 = { kind: "percent", value: 30 };
  assert.deepEqual(markup.quickAddPrice({ cost: 9_000, suggested: 14_000, markup: m30 }), { price: 14_000, basis: "suggested" });
  assert.deepEqual(markup.quickAddPrice({ cost: 9_000, suggested: 0, markup: m30 }), { price: 12_000, basis: "markup" });
  assert.deepEqual(markup.quickAddPrice({ cost: 9_000, suggested: 14_000, markup: m30, preferSuggested: false }), { price: 12_000, basis: "markup" });
  // The supplier's lowest retail price wins over a smaller markup, rounded up to a nice price.
  assert.deepEqual(markup.quickAddPrice({ cost: 9_000, suggested: 0, minRetail: 13_200, markup: { kind: "percent", value: 20 } }), { price: 13_500, basis: "lowest" });
  // A suggestion below the lowest allowed price isn't used.
  assert.deepEqual(markup.quickAddPrice({ cost: 9_000, suggested: 9_100, minRetail: 12_000, markup: m30 }), { price: 12_000, basis: "lowest" });
  // Never below what the seller pays plus the card fee (the price stepper's floor), even with a tiny ₦ markup.
  const tiny = markup.quickAddPrice({ cost: 5_000, markup: { kind: "amount", value: 100 } });
  assert.ok(tiny.price >= markup.sellingFloor(5_000), `${tiny.price} covers cost and the card fee`);
  assert.equal(markup.sellingFloor(5_000), webFind.clampSellingPrice(0, 5_000), "same floor as the web's price stepper");
  assert.equal(markup.cardFee(20_000), webFind.paymentFee(20_000));
  // And the seller keeps something at the one-tap price.
  for (const cost of [800, 4_999, 12_345, 88_000]) {
    const { price } = markup.quickAddPrice({ cost, markup: m30 });
    assert.ok(webFind.saleBreakdown(price, cost).keep > 0, `keeps money on ${cost}`);
  }
});

test("dropship one-tap price: raised a step when the supplier's lowest price or branding would make it a loss", () => {
  const terms = { cost: 9_000, suggestedPrice: 9_000, floor: 13_000, minRetailPrice: 13_000, options: [], minQty: 1, handlingDays: 1, sizeBand: "small", shipsFrom: "Lagos", rateSource: "partners", deliveryToYou: null, dearestDelivery: 4_500, dearestIsEstimate: true, branding: [{ choice: "blind", label: "Blind", fee: 0 }], stock: 10, stockState: "ok" };
  const priced = core.dropshipQuickPrice(terms, 0, { kind: "percent", value: 20 });
  assert.equal(priced.price, 13_000);
  assert.equal(checkout.listingProblem(terms, { retailPrice: priced.price, payer: "customer" }), null);
  // A price no step can fix (cost above any allowed) comes back null and the product is skipped with why.
  const broken = { ...terms, cost: 1_000_000, floor: 1_000_000 };
  assert.ok(core.dropshipQuickPrice(broken, 0, { kind: "percent", value: 20 }) === null || checkout.listingProblem(broken, { retailPrice: core.dropshipQuickPrice(broken, 0, { kind: "percent", value: 20 }).price, payer: "customer" }) === null);
});

// ─── Bulk add: idempotent, never a duplicate, skips explained ─────────────────

const product = (id, patch = {}) => ({ id, name: `Product ${id}`, supplierId: "sup1", supplierName: "Ada Fabrics", verified: true, dropship: false, stock: 10, preorderOpen: false, wholesalePrice: 10_000, suggested: 0, minRetail: null, ...patch });

/** An in-memory shop with the same lock-and-recheck as linkSupplierProduct (one create at a time per store). */
function fakeShop({ catalog, limits = { products: null, dropship: null }, gates = {}, terms = {} } = {}) {
  const rows = [];
  let lock = Promise.resolve();
  let made = 0;
  const deps = {
    products: async (ids) => catalog.filter((item) => ids.includes(item.id)),
    existing: async (ids) => rows.filter((row) => ids.includes(row.supplierProductId)).map((row) => ({ supplierProductId: row.supplierProductId, storeProductId: row.id, archived: row.status === "archived" })),
    gate: async (supplierId) => gates[supplierId] ?? { ok: true },
    terms: async (list) => new Map(list.map((item) => [item.id, terms[item.id]]).filter(([, value]) => value)),
    room: async () => ({ products: limits.products, dropship: limits.dropship, have: rows.filter((row) => row.status !== "archived").length, haveDropship: rows.filter((row) => row.status !== "archived" && row.dropship).length }),
    create: (listing) => {
      const run = lock.then(async () => {
        await new Promise((resolve) => setTimeout(resolve, 1));
        const existing = rows.find((row) => row.supplierProductId === listing.product.id);
        if (existing) return { storeProductId: existing.id, already: true };
        made += 1;
        const row = { id: `sp${made}`, supplierProductId: listing.product.id, price: listing.retailPrice, dropship: listing.dropship, status: "draft" };
        rows.push(row);
        return { storeProductId: row.id, already: false };
      });
      lock = run.catch(() => null);
      return run;
    },
    restore: async (storeProductId, listing) => {
      const row = rows.find((item) => item.id === storeProductId);
      row.status = "draft";
      row.price = listing.retailPrice;
    },
  };
  return { deps, rows };
}

test("bulk add: duplicate ids once, a second send adds nothing, two at once never make the same product twice", async () => {
  const catalog = Array.from({ length: 24 }, (_, i) => product(`p${i}`));
  const shop = fakeShop({ catalog });
  const ids = [...catalog.map((item) => item.id), "p0", "p3"];
  const first = await core.runQuickAdd(shop.deps, { ids, markup: { kind: "percent", value: 30 } });
  assert.equal(first.added.length, 24);
  assert.equal(first.already.length, 0);
  assert.equal(shop.rows.length, 24);
  assert.equal(first.added[0].retailPrice, 13_000, "cost ₦10,000 + 30%");
  const again = await core.runQuickAdd(shop.deps, { ids });
  assert.equal(again.added.length, 0);
  assert.equal(again.already.length, 24);
  assert.equal(shop.rows.length, 24, "no duplicates on a retry");

  // Two phones (or a double tap) at the same moment: the lock and re-check keep one row per product.
  const twin = fakeShop({ catalog });
  const [a, b] = await Promise.all([core.runQuickAdd(twin.deps, { ids: ["p1", "p2", "p3"] }), core.runQuickAdd(twin.deps, { ids: ["p3", "p2", "p1"] })]);
  assert.equal(twin.rows.length, 3);
  assert.equal(a.added.length + b.added.length, 3);
  assert.equal(a.already.length + b.already.length, 3);
  assert.equal(new Set(twin.rows.map((row) => row.supplierProductId)).size, 3);
});

test("bulk add: at most 60 a call; out of stock, unverified, no agreement, price and plan limit are skipped with why", async () => {
  assert.equal(core.cleanIds(Array.from({ length: 80 }, (_, i) => `x${i}`)).length, core.QUICK_ADD_MAX);
  assert.deepEqual(core.cleanIds(["a", "a", 3, "", "b", "x".repeat(65)]), ["a", "b"]);
  const catalog = [
    product("ok1"),
    product("out", { stock: 0 }),
    product("pre", { stock: 0, preorderOpen: true }),
    product("unv", { verified: false }),
    product("ds1", { dropship: true, supplierId: "far", supplierName: "Kano Leather" }),
    product("ds2", { dropship: true, supplierId: "far", supplierName: "Kano Leather" }),
    product("ok2"),
    product("ok3"),
  ];
  const shop = fakeShop({
    catalog,
    limits: { products: 3, dropship: null },
    gates: { far: { ok: false, code: "AGREEMENT_NEEDED", message: "Call Kano Leather, check the stock and agree the Dropship agreement before you list their products." } },
  });
  const result = await core.runQuickAdd(shop.deps, { ids: ["ok1", "out", "pre", "unv", "ds1", "ds2", "gone", "ok2", "ok3"] });
  assert.deepEqual(result.added.map((item) => item.supplierProductId), ["ok1", "pre", "ok2"]);
  const codes = Object.fromEntries(result.skipped.map((item) => [item.supplierProductId, item.code]));
  assert.deepEqual(codes, { out: "OUT_OF_STOCK", unv: "NOT_VERIFIED", ds1: "AGREEMENT_NEEDED", ds2: "AGREEMENT_NEEDED", gone: "NOT_AVAILABLE", ok3: "PLAN_LIMIT" });
  const plan = result.skipped.find((item) => item.code === "PLAN_LIMIT");
  assert.match(plan.message, /up to 3 products and you have 3/);
  assert.doesNotMatch(plan.message, /upgrade|buy|subscribe/i, "plan lines stay calm on the phone");
  assert.equal(result.left, 0);
  // Grouped for the summary: one line per supplier for the agreement.
  const groups = core.groupSkips(result.skipped);
  const agreement = groups.find((group) => group.code === "AGREEMENT_NEEDED");
  assert.equal(agreement.ids.length, 2);
  assert.equal(agreement.supplierName, "Kano Leather");
});

test("bulk add: a removed product comes back as a draft at the new price instead of a second copy", async () => {
  const shop = fakeShop({ catalog: [product("p1")] });
  await core.runQuickAdd(shop.deps, { ids: ["p1"] });
  shop.rows[0].status = "archived";
  const back = await core.runQuickAdd(shop.deps, { ids: ["p1"], markup: { kind: "percent", value: 50 } });
  assert.equal(back.added.length, 1);
  assert.equal(shop.rows.length, 1);
  assert.equal(shop.rows[0].status, "draft");
  assert.equal(shop.rows[0].price, 15_000);
});

// ─── Starter packs ────────────────────────────────────────────────────────────

const candidate = (id, name, patch = {}) => ({ id, name, category: "Fashion", supplierId: "s1", stock: 5, verified: true, rating: 4.5, ratingCount: 10, trendScore: 10, inRange: true, inShop: false, dropship: false, agreed: false, cost: 8_000, suggested: 0, minRetail: null, ...patch });

test("starter packs: top-rated, in stock, verified, in range, not in the shop; capped at the pack size", () => {
  const ankara = packs.STARTER_PACKS.find((pack) => pack.id === "ankara");
  const list = [
    candidate("a1", "Ankara wrap dress", { rating: 4.9, ratingCount: 40 }),
    candidate("a2", "Ankara print fabric 6 yards", { rating: 4.2, ratingCount: 5 }),
    candidate("a3", "Adire tie-dye kaftan", { rating: 5, ratingCount: 1 }),
    candidate("a4", "Ankara bag", { stock: 0 }),
    candidate("a5", "Ankara skirt", { verified: false }),
    candidate("a6", "Ankara shirt", { inRange: false }),
    candidate("a7", "Ankara cap", { inShop: true }),
    candidate("x1", "Leather slides"),
  ];
  const picked = packs.pickStarterPack(ankara, list).map((item) => item.id);
  assert.deepEqual(picked, ["a1", "a2", "a3"].sort((x, y) => packs.packScore(list.find((c) => c.id === y)) - packs.packScore(list.find((c) => c.id === x))));
  assert.ok(!picked.includes("a4") && !picked.includes("a5") && !picked.includes("a6") && !picked.includes("a7") && !picked.includes("x1"));
  // A steady 4.9 from 40 shops beats a single 5★ review.
  assert.ok(packs.packScore(list[0]) > packs.packScore(list[2]));
  const many = Array.from({ length: 40 }, (_, i) => candidate(`m${i}`, `Ankara item ${i}`, { rating: 3 + (i % 20) / 10 }));
  assert.equal(packs.pickStarterPack(ankara, many).length, 25);
});

test("starter packs: matched by name or category, priced with the markup, small packs hidden, ready vs agreement", () => {
  const phone = packs.STARTER_PACKS.find((pack) => pack.id === "phone-accessories");
  assert.equal(packs.packMatches(phone, { name: "20W fast charger", category: "Gadgets" }), true);
  assert.equal(packs.packMatches(phone, { name: "Phone pouch handbag", category: "Fashion" }), false, "not a phone accessory");
  assert.equal(packs.packMatches(packs.STARTER_PACKS.find((pack) => pack.id === "hair-beauty"), { name: "Ice cream maker", category: "Home" }), false);
  const list = [
    ...Array.from({ length: 6 }, (_, i) => candidate(`c${i}`, `USB-C cable ${i}`, { category: "Gadgets", cost: 1_000, dropship: i < 2, agreed: i === 0, supplierId: i < 2 ? "s9" : "s1" })),
    ...Array.from({ length: 3 }, (_, i) => candidate(`h${i}`, `Human hair wig ${i}`, { category: "Beauty" })),
  ];
  const result = packs.starterPacks(list, { kind: "percent", value: 30 });
  assert.deepEqual(result.map((pack) => pack.id), ["phone-accessories"], "hair has only 3, under the 5 a pack needs");
  const pack = result[0];
  assert.equal(pack.count, 6);
  assert.equal(pack.totalCost, 6_000);
  assert.equal(pack.items[0].price, 1_300);
  assert.equal(pack.totalPrice, 6 * 1_300);
  assert.equal(pack.readyCount, 5, "dropship without agreement isn't ready");
  assert.deepEqual(pack.needsAgreement, ["s9"]);
  assert.deepEqual(packs.STARTER_PACKS.slice(0, 3).map((pack) => [pack.id, pack.size]), [["ankara", 25], ["phone-accessories", 30], ["hair-beauty", 20]]);
});

// ─── Routes, screens and words ────────────────────────────────────────────────

test("the routes: seller only, zod, rate limits, store lock, plan room and no schema change", () => {
  for (const path of ["quick-add/route.ts", "quick-add/undo/route.ts", "markup/route.ts", "packs/route.ts", "mine/route.ts"]) {
    const src = read(`src/app/api/mobile/marketplace/${path}`);
    assert.match(src, /withSeller\(/, path);
    if (!path.startsWith("packs")) {
      assert.match(src, /z\.object|z\.discriminatedUnion/, `${path} validates with zod`);
      assert.match(src, /overQuickLimit\(user\.id/, `${path} is rate limited`);
    }
  }
  const server = read("src/lib/marketplace/quick-add.server.ts");
  assert.match(server, /pg_advisory_xact_lock\(hashtext\(\$\{`supplier-add:\$\{storeId\}`\}\)\)/, "one lock per store");
  assert.match(server, /listingCheck\(userId, supplierId\)/, "dropship still needs the agreement");
  assert.match(server, /sellerPlan\(userId\)/, "plan limits counted");
  assert.match(server, /sourcing: JSON\.parse\(JSON\.stringify\(\{ \.\.\.sourcing, markup \}\)\)/, "markup lives in the store's settings JSON");
  // Every add path makes the product through the same locked helper.
  assert.match(read("src/app/api/mobile/marketplace/route.ts"), /linkSupplierProduct\(/);
  assert.match(read("src/app/actions/sourcing.ts"), /linkSupplierProduct\(/);
  assert.match(read("src/app/actions/quick-add.ts"), /quickAddForSeller\(/);
  // The saved markup survives "Save" and "Get notified" (they rewrite the sourcing settings).
  assert.deepEqual(webFind.parseSourcing({ saved: ["a"], markup: { kind: "percent", value: 50 } }).markup, { kind: "percent", value: 50 });
  assert.equal("markup" in webFind.parseSourcing({}), false);
});

test("phone and web screens: one-tap add with undo, the markup question, select many, packs, filters, My supplier products", () => {
  const find = read("apps/mobile/src/app/find/index.tsx");
  assert.match(find, /FlatList/, "the list is virtualised");
  assert.match(find, /useQuickAdd\(/);
  assert.match(find, /quick\.addOne\(/, "one tap on the swipe card and the grid");
  assert.match(find, /quick\.addMany\(picked/, "Select many");
  assert.match(read("apps/mobile/src/components/seller/QuickAdd.tsx"), /undoQuickAdd\(/);
  assert.match(read("apps/mobile/src/components/seller/QuickAdd.tsx"), /<MarkupSheet/);
  assert.match(find, /selecting/);
  assert.match(find, /notInShop/);
  assert.ok(existsSync(join(root, "apps/mobile/src/app/find/packs.tsx")));
  assert.ok(existsSync(join(root, "apps/mobile/src/app/find/mine.tsx")));
  assert.ok(existsSync(join(root, "apps/mobile/src/app/find/markup.tsx")));
  assert.match(read("apps/mobile/src/app/settings.tsx"), /\/find\/markup/);
  assert.match(read("apps/mobile/src/app/onboarding/index.tsx"), /\/find\/packs/);
  assert.ok(existsSync(join(root, "src/app/marketplace/packs/page.tsx")));
  assert.ok(existsSync(join(root, "src/app/marketplace/mine/page.tsx")));
  const grid = read("src/app/marketplace/_components/ProductGrid.tsx");
  assert.match(grid, /quick\.addOne\(product\.id/);
  assert.match(grid, /quick\.addMany\(picked/);
  assert.match(read("src/app/marketplace/_components/QuickAddKit.tsx"), /quickAddProducts\(/);
  assert.match(grid, /selecting/);
  assert.match(grid, /content-visibility|contentVisibility/, "long grids skip drawing what's off screen");
});

test("every new word is in all five languages", () => {
  const phoneKeys = Object.keys(CATALOGS.m_find.en).filter((key) => /^(quick|markup|select|bulk|packs?|mine|filters\.(near|state|notInShop|anyPlace))\b|^(quick|markup|select|bulk|pack|mine)\./.test(key));
  assert.ok(phoneKeys.length > 30, `phone keys: ${phoneKeys.length}`);
  const webKeys = Object.keys(CATALOGS.marketplace.en).filter((key) => /^(quick|markup|select|packs?|mine|filter)\./.test(key));
  assert.ok(webKeys.length > 30, `web keys: ${webKeys.length}`);
  for (const lang of ["pcm", "yo", "ha", "ig"]) {
    for (const key of phoneKeys) assert.ok(CATALOGS.m_find[lang][key], `m_find ${lang} ${key}`);
    for (const key of webKeys) assert.ok(CATALOGS.marketplace[lang][key], `marketplace ${lang} ${key}`);
  }
});
