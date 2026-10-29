// Sellers see their pre-order products in the product list (Pre-orders filter: ship date, how many taken, open
// orders) and on the pre-orders page every product taking pre-orders is listed, even before its first order, with
// Edit (the product's Preorder section), its limit and deposit, and each buyer with the date they ordered.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("products list: a Pre-orders filter, and the Pre-orders button opens it", () => {
  const page = read("src/app/products/page.tsx");
  assert.match(page, /\{ key: "preorder", test: \(p\) => p\.status !== "archived" && p\.preorderEnabled \}/);
  assert.match(page, /<PillLink href=\{href\(\{ filter: "preorder" \}\)\} icon="clock"/);
  assert.match(page, /preorderEnabled: true,\n\s+preorderShipsAt: true,\n\s+preorderLimit: true,\n\s+preorderTaken: true,/);
  assert.match(page, /filterKey === "preorder" \? storePreorders\(storeId\)/, "open orders only looked up for the filter");
  assert.match(page, /href="\/home\/preorders\?view=shop"/, "orders and buyers");
  for (const lang of ["en", "pcm", "yo", "ha", "ig"]) {
    const words = read(`shared/i18n/messages/products/${lang}.ts`);
    for (const key of ["filter.preorder", "pre.bar", "pre.manage", "pre.start", "pre.taking", "pre.ships", "pre.noDate", "pre.takenOf", "pre.taken", "pre.open"]) assert.ok(words.includes(`"${key}":`), `${lang} ${key}`);
  }
});

test("pre-orders page: every product taking pre-orders, with Edit, limit, deposit and buyers' order dates", () => {
  const server = read("src/lib/supplier-orders/preorders.server.ts");
  assert.match(server, /OR: \[\{ preorderEnabled: true, status: \{ not: "archived" \} \}/);
  assert.match(server, /units: 0, waiting: 0, unpaid: 0, balanceDue: 0, orders: \[\]/, "a product with no orders yet still shows");
  const page = read("src/app/home/preorders/page.tsx");
  assert.match(page, /href=\{`\/products\/\$\{group\.productId\}#preorder`\}/);
  assert.match(page, /id=\{`p-\$\{group\.productId\}`\}/);
  assert.match(page, /t\("preorders\.noOrdersYet"\)/);
  assert.match(page, /t\("preorders\.orderedOn"/);
  assert.match(read("src/app/components/ProductForm.tsx"), /<Section id="preorder" title="Preorder"/);
  for (const lang of ["en", "pcm", "yo", "ha", "ig"]) {
    const words = read(`shared/i18n/messages/orders/${lang}.ts`);
    for (const key of ["preorders.takenOf", "preorders.noLimit", "preorders.depositPct", "preorders.payInFull", "preorders.edit", "preorders.noOrdersYet", "preorders.orderedOn"]) assert.ok(words.includes(`"${key}":`), `${lang} ${key}`);
  }
});

test("phone app: a Pre-orders filter in Products, the tag on each row, and Edit, deposit and order dates on Pre-orders", async () => {
  const filters = await import("../apps/mobile/src/lib/product-filters-pure.ts");
  assert.ok(filters.PRODUCT_SHOWS.includes("preorder"));
  assert.match(filters.productListPath({ show: "preorder", categoryId: "", sort: "newest" }), /preorder=true/);
  assert.match(filters.productListPath({ show: "preorder", categoryId: "", sort: "newest" }), /status=%21archived/);
  const route = read("src/app/api/store/products/route.ts");
  assert.match(route, /if \(preorder\) where\.preorderEnabled = preorder === "true";/);
  assert.match(route, /preorderEnabled: true,\n\s+preorderShipsAt: true,\n\s+preorderLimit: true,\n\s+preorderTaken: true,/);
  assert.match(read("apps/mobile/src/components/seller/StockRows.tsx"), /preorderPillText\(/);
  assert.match(read("apps/mobile/src/app/(tabs)/products.tsx"), /router\.push\("\/preorders"\)/);
  const screen = read("apps/mobile/src/app/preorders.tsx");
  assert.match(screen, /router\.push\(\{ pathname: "\/product\/\[id\]", params: \{ id: group\.productId, section: "preorder" \} \}\)/);
  assert.match(screen, /t\("preorders\.noOrdersYet"\)/);
  assert.match(screen, /t\("preorders\.orderedOn"/);
  for (const lang of ["en", "pcm", "yo", "ha", "ig"]) {
    const products = read(`shared/i18n/messages/m_products/${lang}.ts`);
    for (const key of ["filters.show.preorder", "list.preorderTakenOf", "list.preorderTaken", "list.preorderBar", "list.preorderManage"]) assert.ok(products.includes(`"${key}":`), `${lang} ${key}`);
    const ui = read(`shared/i18n/messages/m_ui/${lang}.ts`);
    for (const key of ["preorders.takenOf", "preorders.noLimit", "preorders.payInFull", "preorders.edit", "preorders.noOrdersYet", "preorders.orderedOn"]) assert.ok(ui.includes(`"${key}":`), `${lang} ${key}`);
    assert.equal((ui.match(/"preorders\.depositPct":/g) ?? []).length, 1, `${lang}: one deposit line`);
  }
});
