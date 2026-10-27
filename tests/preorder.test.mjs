import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const pre = await import("../shared/preorder.ts");
const stock = await import("../shared/product-stock.ts");
const holds = await import("../src/lib/commerce/stock-holds.ts");

const NOW = new Date("2026-10-27T10:00:00Z");

test("preorder state: on/off, cap, ship date and the line under the button", () => {
  assert.deepEqual(pre.preorderState(null), { on: false, open: false, left: null, shipsOn: null, note: null });
  const open = pre.preorderState({ enabled: true, shipsAt: "2026-12-12T12:00:00Z", limit: 50, taken: 42, note: "  Ships by 12 Dec.  " });
  assert.deepEqual(open, { on: true, open: true, left: 8, shipsOn: "2026-12-12", note: "Ships by 12 Dec." });
  assert.equal(pre.preorderLine(open, NOW), "Ships from 12 Dec · 8 left");
  assert.equal(pre.preorderLine(pre.preorderState({ enabled: true }), NOW), "Ships soon", "no date");
  assert.equal(pre.preorderLine(pre.preorderState({ enabled: true, shipsAt: "2026-10-01" }), NOW), "Ships soon", "a date that passed");
  const full = pre.preorderState({ enabled: true, limit: 10, taken: 10 });
  assert.equal(full.open, false);
  assert.equal(pre.preorderLine(full, NOW), "Preorders are full");
  assert.equal(pre.preorderMaxQuantity(full), 0);
  assert.equal(pre.preorderMaxQuantity(pre.preorderState({ enabled: true })), null, "no cap: no limit per line");
  assert.match(pre.shipDateLabel("2027-01-05", NOW), /2027/, "another year names the year");
});

test("preorder input: real dates, whole caps, past dates only when already saved", () => {
  const good = pre.parsePreorderInput({ enabled: true, shipsAt: "2026-12-01", limit: 20, note: " Promise " }, NOW);
  assert.equal(good.ok, true);
  assert.equal(good.value.preorderShipsAt.toISOString().slice(0, 10), "2026-12-01");
  assert.equal(good.value.preorderLimit, 20);
  assert.equal(good.value.preorderNote, "Promise");
  assert.equal(pre.parsePreorderInput({ enabled: true, shipsAt: "soon" }, NOW).ok, false);
  assert.equal(pre.parsePreorderInput({ enabled: true, limit: 0 }, NOW).ok, false);
  assert.equal(pre.parsePreorderInput({ enabled: true, limit: 2.5 }, NOW).ok, false);
  assert.equal(pre.parsePreorderInput({ enabled: true, shipsAt: "2026-10-01" }, NOW).ok, false, "a new date can't be past");
  assert.equal(pre.parsePreorderInput({ enabled: true, shipsAt: "2026-10-01" }, NOW, new Date("2026-10-01T12:00:00Z")).ok, true, "a saved date that passed still saves");
  assert.equal(pre.parsePreorderInput({ enabled: false, shipsAt: "2026-10-01" }, NOW).ok, true, "switched off: kept for next time");
  assert.equal(pre.preorderSaveData(good.value, { dropship: true }).preorderEnabled, false, "never on dropship products");
  assert.equal(pre.preorderSaveData(good.value).preorderTaken, 0, "switching on starts a fresh count");
  assert.equal("preorderTaken" in pre.preorderSaveData(good.value, { wasEnabled: true }), false, "already on: the count stays");
});

test("shoppers: a preorder product is buyable up to the cap, whatever the stock says", () => {
  const row = { trackStock: true, currentStock: 0, reservedStock: 0, preorderEnabled: true, preorderLimit: 5, preorderTaken: 2, preorderShipsAt: new Date("2026-12-12T12:00:00Z"), preorderNote: "Ships in December", fulfillmentType: "merchant_fulfilled" };
  const shaped = stock.forShoppers(row);
  assert.equal(shaped.stock, null, "the stock count doesn't apply while taking preorders");
  assert.equal(shaped.preorder.left, 3);
  assert.equal("preorderTaken" in shaped, false, "raw counts never reach shoppers");
  const availability = stock.stockAvailability({ stock: shaped.stock, preorder: shaped.preorder });
  assert.equal(availability.tone, "preorder");
  assert.equal(availability.canBuy, true);
  assert.equal(availability.maxQuantity, 3);
  assert.equal(stock.listingSoldOut(shaped), false);
  const full = stock.forShoppers({ ...row, preorderTaken: 5 });
  assert.equal(stock.listingSoldOut(full), true);
  assert.equal(stock.forShoppers({ ...row, fulfillmentType: "dropship", supplierProduct: { stockQuantity: 4 } }).preorder, null, "dropship products sell the supplier's stock");
  assert.equal(stock.forShoppers({ ...row, preorderEnabled: false }).preorder, null);
});

test("checkout: preorders take a place under the cap, never stock, and give it back on expiry", () => {
  const product = { id: "p", name: "Ankara bag", currentStock: 0, reservedStock: 0, trackStock: true, preorderEnabled: true, preorderLimit: 4, preorderTaken: 3, fulfillmentType: "merchant_fulfilled" };
  const built = holds.buildStockHolds([product], new Map([["p", 1]]), new Map([["p", [{ id: "v", quantity: 1, name: "Ankara bag · Red" }]]]));
  assert.deepEqual(built, [{ source: "store", productId: "p", quantity: 1, name: "Ankara bag", mode: "preorder" }], "no version counts are taken");
  assert.deepEqual(holds.parseStockHold(JSON.parse(JSON.stringify(built))), built, "the mode survives saving on the order");
  assert.deepEqual(holds.stockShortfallDetails([product], new Map([["p", 1]])), [], "the last place is fine");
  const short = holds.stockShortfallDetails([product], new Map([["p", 2]]));
  assert.deepEqual(short, [{ name: "Ankara bag", available: 1, preorder: true }]);
  assert.equal(holds.stockShortfallMessage(short), "Sorry, only 1 preorder of Ankara bag is left. Lower the quantity in your bag and try again.");
  assert.equal(holds.stockShortfallMessage([{ name: "Ankara bag", available: 0, preorder: true }]), "Sorry, preorders for Ankara bag are full. Remove it from your bag and try again.");
  assert.deepEqual(holds.stockShortfallDetails([{ ...product, preorderLimit: null }], new Map([["p", 500]])), [], "no cap");

  const server = read("src/lib/commerce/stock.server.ts");
  assert.match(server, /"preorderLimit" IS NULL OR "preorderTaken" \+ \$\{quantity\} <= "preorderLimit"/, "the cap is checked in the same update that takes the place");
  assert.match(server, /preorderTaken: \{ decrement: quantity \}/, "expiry gives the place back");
  const pricing = read("src/lib/commerce/pricing.server.ts");
  assert.match(pricing, /preorder: true as const, shipsOn: preorderDay\(product\.preorderShipsAt\)/, "preorder lines are tagged on the order");
});

test("orders and sharing", () => {
  assert.equal(pre.orderHasPreorder([{ name: "a" }, { name: "b", preorder: true, shipsOn: "2026-12-12" }]), true);
  assert.equal(pre.orderHasPreorder([{ name: "a" }]), false);
  assert.equal(pre.orderPreorderShipsOn([{ preorder: true, shipsOn: "2026-12-20" }, { preorder: true, shipsOn: "2026-12-12" }]), "2026-12-12");
  const text = pre.preorderShareText({ name: "Ankara bag", price: "₦18,500", shipsOn: "2026-12-12", url: "https://ada.shopinbos.com/product/p?ref=wa", now: NOW });
  assert.match(text, /^Preorder now: Ankara bag\. ₦18,500\. Ships from 12 Dec\./);
  assert.match(text, /\?ref=wa$/);
  const sql = read("docs/migrations/2026-12-01-preorders.sql");
  assert.match(sql, /ADD COLUMN IF NOT EXISTS "preorderEnabled" BOOLEAN NOT NULL DEFAULT false/);
  assert.doesNotMatch(sql, /DROP |DELETE /);
});

test("suppliers: preorder bulk orders take places under the cap, not stock, and give them back once", () => {
  const wholesale = read("src/lib/supplier-orders/wholesale.server.ts");
  assert.match(wholesale, /const reservation = preorder\.on \? \{ reserve: 0 \} : wholesaleReservation/, "a preorder reserves no stock");
  assert.match(wholesale, /"preorderLimit" IS NULL OR "preorderTaken" \+ \$\{input\.quantity\} <= "preorderLimit"/, "the cap is checked as the place is taken");
  assert.match(wholesale, /preorder: preorder\.on,\s+preorderShipsAt:/, "the order remembers it was a preorder and the date");
  assert.match(wholesale, /OR: \[\{ stockReserved: \{ gt: 0 \} \}, \{ preorder: true \}\]/, "declines, cancels and expiry give preorder places back once");
  assert.match(wholesale, /preorderTaken: \{ decrement: order\.quantity \}/);
  const actions = read("src/app/actions/supplier.ts");
  assert.match(actions, /preorderSaveData\(preorder\.value, \{ wasEnabled: product\.preorderEnabled \}\)/);
  const form = read("src/components/supplier/SupplierProductForm.tsx");
  for (const name of ["preorderEnabled", "preorderShipsAt", "preorderLimit", "preorderNote"]) assert.match(form, new RegExp(`name="${name}"`));
  assert.match(read("src/app/marketplace/_components/ProductDetail.tsx"), /t\("pd\.preorderFor"/);
});

test("dropship: a product follows its supplier's preorders, at checkout and for shoppers", async () => {
  const product = { id: "d", name: "Shea butter", currentStock: 0, fulfillmentType: "dropship", supplierProductId: "sp", supplierProduct: { id: "sp", stockQuantity: 0, status: "published", preorderEnabled: true, preorderLimit: 10, preorderTaken: 9 } };
  const built = holds.buildStockHolds([product], new Map([["d", 1]]));
  assert.deepEqual(built, [{ source: "supplier", productId: "d", supplierProductId: "sp", quantity: 1, name: "Shea butter", mode: "preorder" }], "no supplier stock is needed");
  assert.deepEqual(holds.parseStockHold(JSON.parse(JSON.stringify(built))), built);
  assert.deepEqual(holds.stockShortfallDetails([product], new Map([["d", 1]])), [], "the supplier's last place");
  assert.deepEqual(holds.stockShortfallDetails([product], new Map([["d", 2]])), [{ name: "Shea butter", available: 1, preorder: true }]);
  const plain = { ...product, supplierProduct: { ...product.supplierProduct, preorderEnabled: false } };
  assert.equal(holds.buildStockHolds([plain], new Map([["d", 1]]))[0].mode, undefined, "no preorder: supplier stock as before");

  const shaped = stock.forShoppers({ fulfillmentType: "dropship", trackStock: false, supplierProduct: { stockQuantity: 0, moq: 2, preorderEnabled: true, preorderShipsAt: "2026-12-20T12:00:00Z", preorderLimit: 10, preorderTaken: 4, preorderNote: "Arrives mid-December" } });
  assert.equal(shaped.preorder.left, 6);
  assert.equal(shaped.preorder.shipsOn, "2026-12-20");
  assert.deepEqual(shaped.supplierProduct, { stockQuantity: 0, moq: 2 }, "the supplier's raw preorder counts never reach shoppers");
  assert.equal(stock.listingSoldOut(shaped), false, "out of supplier stock but open for preorders");

  const server = read("src/lib/commerce/stock.server.ts");
  assert.match(server, /UPDATE "SupplierProduct" SET "preorderTaken" = "preorderTaken" \+ \$\{quantity\}/);
  assert.match(server, /if \(preorder\) await tx\.supplierProduct\.updateMany\(\{ where: \{ id: supplierProductId, preorderTaken: \{ gte: quantity \} \}/, "expiry and supplier expiry give the place back");
  const lines = (await import("../src/lib/supplier-orders/pure.ts")).groupDropshipLines([{ productId: "d", name: "Shea butter", quantity: 2, preorder: true, shipsOn: "2026-12-20" }], new Map([["d", { supplierId: "s", supplierProductId: "sp", unitCost: 1000 }]]));
  assert.equal(lines.groups[0].items[0].preorder, true, "the supplier's order says it's a preorder");
  assert.equal(lines.groups[0].items[0].shipsOn, "2026-12-20");
});

test("public marketplace API: products carry `preorder`, never the raw counts", async () => {
  const { withPublicPreorder } = await import("../src/lib/marketplace/public-preorder.ts");
  const row = withPublicPreorder({ id: "p", name: "Wax print", preorderEnabled: true, preorderShipsAt: new Date("2026-12-12T12:00:00Z"), preorderLimit: 20, preorderTaken: 5, preorderNote: "Container lands 10 Dec" });
  assert.deepEqual(row, { id: "p", name: "Wax print", preorder: { open: true, shipsOn: "2026-12-12", left: 15, note: "Container lands 10 Dec" } });
  assert.equal(withPublicPreorder({ id: "q", preorderEnabled: false, preorderShipsAt: null, preorderLimit: null, preorderTaken: 0, preorderNote: null }).preorder, null);
  for (const file of ["src/app/api/public/products/route.ts", "src/app/api/public/products/[slug]/route.ts", "src/app/api/public/products/trending/route.ts", "src/app/api/public/products/category/[categorySlug]/route.ts", "src/app/api/public/suppliers/[slug]/route.ts"]) {
    const source = read(file);
    assert.match(source, /\.\.\.PUBLIC_PREORDER_SELECT/, file);
    assert.match(source, /withPublicPreorder/, file);
  }
  assert.match(read("website/wp-content/plugins/shopinbos-core/includes/marketplace.php"), /'preorder'\s+=> \$pre \?/);
});
