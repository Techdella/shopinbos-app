// Suppliers receive orders (dropship + wholesale) and unpaid orders stop holding stock forever.
// Pure helpers are loaded directly (Node strips the types); the routes and wiring are checked by reading them.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const so = await import("../src/lib/supplier-orders/pure.ts");
const stock = await import("../src/lib/commerce/stock-holds.ts");
const rules = await import("../src/app/api/mobile/supplier/_rules.ts");

// ─── Grouping per supplier ────────────────────────────────────────────────────

test("dropship lines are grouped per supplier, with the wholesale cost owed; own products are left out", () => {
  const links = new Map([
    ["sp-bag", { supplierId: "sup-a", supplierProductId: "p-bag", unitCost: 8000, image: "bag.jpg" }],
    ["sp-belt", { supplierId: "sup-a", supplierProductId: "p-belt", unitCost: 2500 }],
    ["sp-fabric", { supplierId: "sup-b", supplierProductId: "p-fabric", unitCost: 3000 }],
  ]);
  const items = [
    { productId: "sp-bag", name: "Leather bag (Brown)", variant: "Brown", quantity: 2, price: 15000 },
    { productId: "own-candle", name: "Candle", quantity: 1, price: 4000 },
    { productId: "sp-fabric", name: "Ankara", quantity: 3, price: 6000, image: "ankara.jpg" },
    { productId: "sp-belt", name: "Belt", quantity: 1, price: 5000 },
  ];
  const { groups, sellerLines } = so.groupDropshipLines(items, links);
  assert.equal(sellerLines, 1);
  assert.deepEqual(groups.map((group) => group.supplierId), ["sup-a", "sup-b"]);
  assert.equal(groups[0].items.length, 2);
  assert.equal(groups[0].costTotal, 8000 * 2 + 2500);
  assert.equal(groups[0].items[0].variant, "Brown");
  assert.equal(groups[0].items[0].image, "bag.jpg", "falls back on the supplier's photo");
  assert.equal(groups[1].costTotal, 9000);
  assert.equal(groups[1].items[0].image, "ankara.jpg");
  // The shopper's retail price never reaches the supplier order.
  assert.ok(groups.every((group) => group.items.every((line) => !("price" in line))));
  assert.deepEqual(so.groupDropshipLines("nope", links), { groups: [], sellerLines: 0 });
  assert.equal(so.groupDropshipLines([{ productId: "sp-bag", quantity: "0" }], links).groups[0].items[0].quantity, 1);
});

test("supplier orders are made once paid, or once placed for pay on delivery", () => {
  assert.ok(so.readyForSuppliers({ status: "paid", paymentMethod: null }));
  assert.ok(so.readyForSuppliers({ status: "processing", paymentMethod: "transfer" }));
  assert.ok(so.readyForSuppliers({ status: "pending", paymentMethod: "pay_on_delivery" }));
  assert.ok(!so.readyForSuppliers({ status: "pending", paymentMethod: null }));
  assert.ok(!so.readyForSuppliers({ status: "awaiting_payment", paymentMethod: "transfer" }));
  assert.ok(!so.readyForSuppliers({ status: "cancelled", paymentMethod: "pay_on_delivery" }));
});

// ─── Idempotency ──────────────────────────────────────────────────────────────

test("one supplier order per store order and supplier: the key is stable, distinct per supplier", () => {
  assert.equal(so.supplierOrderKey("ord1", "supA"), "dropship:ord1:supA");
  assert.equal(so.supplierOrderKey("ord1", "supA"), so.supplierOrderKey("ord1", "supA"));
  assert.notEqual(so.supplierOrderKey("ord1", "supA"), so.supplierOrderKey("ord1", "supB"));
  assert.notEqual(so.supplierOrderKey("ord1", "supA"), so.supplierOrderKey("ord2", "supA"));
  const schema = read("prisma/schema.prisma");
  assert.match(schema, /idempotencyKey\s+String\s+@unique/);
  const sql = read("docs/migrations/2026-10-14-supplier-orders.sql");
  assert.match(sql, /CREATE UNIQUE INDEX IF NOT EXISTS "SupplierOrder_idempotencyKey_key"/);
  assert.match(sql, /ALTER TABLE "SupplierOrder" ENABLE ROW LEVEL SECURITY/);
  assert.doesNotMatch(sql, /CREATE POLICY/);
  assert.doesNotMatch(sql, /DROP (TABLE|COLUMN)/i);
  const service = read("src/lib/supplier-orders/service.server.ts");
  assert.match(service, /idempotencyKey: supplierOrderKey\(order\.id, group\.supplierId\)/);
  assert.match(service, /isUniqueViolation\(error\)\) continue/, "a replay skips the existing order (and doesn't notify again)");
});

test("payment paths create supplier orders, and a replayed webhook stays safe", () => {
  const webhook = read("src/app/api/webhooks/paystack/route.ts");
  assert.match(webhook, /afterRetailOrderPaid\(ref/);
  assert.match(read("src/lib/commerce/order-paid.server.ts"), /ensureSupplierOrdersSafely\(orderId\)/);
  assert.match(webhook, /recoverExpiredOrderPayment\(ref/);
  assert.match(read("src/app/actions/payments.ts"), /ensureSupplierOrdersSafely\(orderId\)/);
  assert.match(read("src/lib/orders/update-status.ts"), /ensureSupplierOrdersSafely\(order\.id\)/);
  assert.match(read("src/app/api/public/store/[slug]/checkout/route.ts"), /paymentMethod === "pay_on_delivery"\) await ensureSupplierOrdersSafely/);
});

// ─── Moving orders ────────────────────────────────────────────────────────────

test("dropship: accept → ship → deliver, or decline; nothing after the end", () => {
  assert.deepEqual(so.supplierOrderActions("pending"), ["accept", "ship", "reject"]);
  assert.equal(so.supplierOrderStatusAfter("pending", "accept"), "accepted");
  assert.equal(so.supplierOrderStatusAfter("accepted", "ship"), "shipped");
  assert.equal(so.supplierOrderStatusAfter("pending", "ship"), "shipped");
  assert.equal(so.supplierOrderStatusAfter("shipped", "deliver"), "delivered");
  assert.equal(so.supplierOrderStatusAfter("accepted", "reject"), "rejected");
  assert.equal(so.supplierOrderStatusAfter("shipped", "reject"), null);
  assert.equal(so.supplierOrderStatusAfter("delivered", "ship"), null);
  assert.equal(so.supplierOrderStatusAfter("cancelled", "accept"), null);
  assert.equal(so.supplierOrderStatusAfter("pending", "deliver"), null);
});

test("wholesale: pending → confirmed → shipped → delivered, or declined (cancelled)", () => {
  assert.equal(so.wholesaleStatusAfter("pending", "accept"), "confirmed");
  assert.equal(so.wholesaleStatusAfter("confirmed", "ship"), "shipped");
  assert.equal(so.wholesaleStatusAfter("processing", "ship"), "shipped");
  assert.equal(so.wholesaleStatusAfter("shipped", "deliver"), "delivered");
  assert.equal(so.wholesaleStatusAfter("pending", "reject"), "cancelled");
  assert.equal(so.wholesaleStatusAfter("delivered", "reject"), null);
});

test("the seller's store order follows its suppliers, only forward", () => {
  const after = (retailStatus, supplierStatuses, sellerLines = 0) => so.retailStatusAfterSupplierUpdate({ retailStatus, supplierStatuses, sellerLines });
  assert.equal(after("paid", ["accepted"]), "processing");
  assert.equal(after("paid", ["shipped"]), "shipped");
  assert.equal(after("paid", ["shipped", "accepted"]), "processing");
  assert.equal(after("processing", ["shipped", "shipped"]), "shipped");
  assert.equal(after("shipped", ["delivered"]), "delivered");
  assert.equal(after("paid", ["shipped"], 1), "processing", "the seller still sends their own items");
  assert.equal(after("paid", ["shipped", "rejected"]), "processing", "a declined line is the seller's to sort out");
  assert.equal(after("shipped", ["shipped"]), null);
  assert.equal(after("delivered", ["shipped"]), null, "never moves backwards");
  assert.equal(after("cancelled", ["shipped"]), null);
  assert.equal(after("pending", ["accepted"]), "processing", "pay on delivery");
  assert.equal(after("paid", ["pending"]), null);
  assert.equal(after("paid", []), null);
});

test("mobile app actions map onto the same rules", () => {
  assert.deepEqual(rules.nextActions("dropship", "pending"), ["accept", "decline"]);
  assert.deepEqual(rules.nextActions("dropship", "accepted"), ["handed_over"]);
  assert.equal(rules.portalAction("decline"), "reject");
  assert.equal(rules.portalAction("handed_over"), "ship");
  assert.equal(rules.portalAction("packed"), null);
  for (const [status, action] of [["pending", "accept"], ["pending", "decline"], ["accepted", "handed_over"], ["shipped", "delivered"]]) {
    assert.equal(rules.statusAfter("dropship", status, action), so.supplierOrderStatusAfter(status, rules.portalAction(action)), `${status} ${action}`);
  }
});

test("suppliers and sellers only reach their own orders", () => {
  const service = read("src/lib/supplier-orders/service.server.ts");
  assert.match(service, /where: \{ id: input\.orderId, supplierId: input\.supplierId \}/);
  assert.match(service, /where: \{ id: order\.id, supplierId: input\.supplierId, status: order\.status \}/, "conditional on status");
  const wholesale = read("src/lib/supplier-orders/wholesale.server.ts");
  assert.match(wholesale, /where: \{ id: input\.orderId, supplierId: input\.supplierId \}/);
  assert.match(read("src/lib/supplier-orders/views.server.ts"), /supplierId,\n/);
  for (const file of ["src/app/api/supplier/orders/route.ts", "src/app/api/supplier/orders/[id]/route.ts"]) assert.match(read(file), /withSupplier\(/, file);
  assert.match(read("src/app/api/app/wholesale/request/route.ts"), /withSeller\(/);
  assert.match(read("src/app/home/orders/[id]/page.tsx"), /retailOrderId: order\.id, storeId: store\.id/);
});

test("wholesale never fakes a payment", () => {
  const detail = read("src/app/marketplace/_components/ProductDetail.tsx");
  assert.match(detail, /\/api\/app\/wholesale\/request/);
  assert.match(detail, /t\("pd\.noPay"\)/);
  assert.match(read("shared/i18n/messages/marketplace/en.ts"), /"pd\.noPay": "You don't pay on Shopinbos\."/);
  const service = read("src/lib/supplier-orders/wholesale.server.ts");
  assert.match(service, /tierPrice\(parsePricingTiers\(product\.pricingTiers\), input\.quantity, product\.wholesalePrice\)/);
  assert.match(service, /input\.quantity < moq/);
});

// ─── Stock: dropship sells the supplier's stock ───────────────────────────────

const own = { id: "own", name: "Candle", currentStock: 3, fulfillmentType: "merchant_fulfilled", supplierProductId: null, supplierProduct: null };
const drop = { id: "drop", name: "Bag", currentStock: 0, fulfillmentType: "dropship", supplierProductId: "sp1", supplierProduct: { id: "sp1", stockQuantity: 10, status: "published" } };

test("dropship products are checked against the supplier's stock, not the store's", () => {
  const quantities = new Map([["own", 2], ["drop", 4]]);
  assert.deepEqual(stock.stockShortfalls([own, drop], quantities), []);
  assert.deepEqual(stock.buildStockHolds([own, drop], quantities), [
    { source: "store", productId: "own", quantity: 2, name: "Candle" },
    { source: "supplier", productId: "drop", supplierProductId: "sp1", quantity: 4, name: "Bag" },
  ]);
  assert.deepEqual(stock.stockShortfalls([own, drop], new Map([["own", 4], ["drop", 11]])), ["Candle", "Bag"]);
  const hidden = { ...drop, supplierProduct: { ...drop.supplierProduct, status: "unpublished" } };
  assert.deepEqual(stock.stockShortfalls([hidden], new Map([["drop", 1]])), ["Bag"], "an unpublished supplier product can't be sold");
  const notDropship = { ...drop, fulfillmentType: "merchant_fulfilled" };
  assert.deepEqual(stock.stockShortfalls([notDropship], new Map([["drop", 1]])), ["Bag"], "wholesale-stocked items use the store's stock");
});

test("two store products on one supplier product share its stock", () => {
  const other = { ...drop, id: "drop2", name: "Bag (gift)" };
  const totals = stock.holdTotals(stock.buildStockHolds([drop, other], new Map([["drop", 6], ["drop2", 5]])));
  assert.equal(totals.supplier.get("sp1").quantity, 11);
  assert.deepEqual(stock.stockShortfalls([drop, other], new Map([["drop", 6], ["drop2", 5]])), ["Bag", "Bag (gift)"]);
});

test("saved stock holds round-trip and junk is ignored", () => {
  const holds = stock.buildStockHolds([own, drop], new Map([["own", 1], ["drop", 2]]));
  assert.deepEqual(stock.parseStockHold(JSON.parse(JSON.stringify(holds))), holds);
  assert.deepEqual(stock.parseStockHold(null), []);
  assert.deepEqual(stock.parseStockHold([{ source: "supplier", productId: "x", quantity: 2 }, { source: "store", productId: "y", quantity: 0 }, "z"]), []);
  const shopper = stock.shopperOrder({ id: "o1", total: 5, stockHold: holds, stockReleasedAt: null, paymentIssue: "x" });
  assert.deepEqual(shopper, { id: "o1", total: 5 }, "the buyer's page never sees supplier stock bookkeeping");
});

test("checkout reserves through the holds and saves them on the order", () => {
  const checkout = read("src/app/api/public/store/[slug]/checkout/route.ts");
  assert.match(checkout, /await reserveStock\(tx, store\.id, priced\.stockHolds\)/);
  assert.match(checkout, /const stockHolds = await reserveStock/);
  assert.match(checkout, /stockHold: JSON\.parse\(JSON\.stringify\(stockHolds\)\)/, "the holds as really taken are saved");
  assert.doesNotMatch(checkout, /currentStock: \{ decrement/);
  const reserve = read("src/lib/commerce/stock.server.ts");
  assert.match(reserve, /stockQuantity: \{ gte: quantity \}/);
  assert.match(reserve, /"currentStock" - GREATEST\("reservedStock", 0\) >= \$\{quantity\}/);
  const pricing = read("src/lib/commerce/pricing.server.ts");
  assert.match(pricing, /stockShortfallDetails\(products, quantities\)/);
  assert.match(pricing, /maybeExpireUnpaidOrders\(input\.store\.id\)/);
});

// ─── Expiry ───────────────────────────────────────────────────────────────────

test("the unpaid-order TTL is 30 minutes unless UNPAID_ORDER_TTL_MINUTES says otherwise", () => {
  assert.equal(stock.DEFAULT_UNPAID_ORDER_TTL_MINUTES, 30);
  assert.equal(stock.unpaidOrderTtlMinutes(undefined), 30);
  assert.equal(stock.unpaidOrderTtlMinutes(""), 30);
  assert.equal(stock.unpaidOrderTtlMinutes("abc"), 30);
  assert.equal(stock.unpaidOrderTtlMinutes("-4"), 30);
  assert.equal(stock.unpaidOrderTtlMinutes("45"), 45);
  assert.equal(stock.unpaidOrderTtlMinutes("1"), 5, "never shorter than 5 minutes");
});

test("expiry selects only unpaid card/transfer orders past their time that still hold stock", () => {
  const now = new Date("2026-10-14T12:00:00Z");
  const old = new Date("2026-10-14T11:20:00Z");
  const fresh = new Date("2026-10-14T11:45:00Z");
  const hold = [{ source: "store", productId: "p", quantity: 1, name: "P" }];
  const base = { status: "pending", paymentMethod: null, createdAt: old, stockHold: hold, stockReleasedAt: null };
  const expirable = (order) => stock.isExpirableOrder({ ...base, ...order }, now, 30);
  assert.ok(expirable({}), "Paystack (null method)");
  assert.ok(!expirable({ paymentMethod: "transfer" }), "bank transfer has its own, longer window (tests/orders-followups.test.mjs)");
  assert.ok(expirable({ paymentMethod: "transfer", createdAt: new Date("2026-10-13T11:00:00Z") }), "transfer after 24 hours");
  assert.ok(expirable({ paymentMethod: "paystack", status: "awaiting_payment" }));
  assert.ok(expirable({ createdAt: new Date("2026-10-14T11:30:00Z") }), "exactly at the cutoff");
  assert.ok(!expirable({ createdAt: fresh }), "still within 30 minutes");
  assert.ok(!expirable({ paymentMethod: "pay_on_delivery" }), "pay on delivery never expires");
  assert.ok(!expirable({ paymentMethod: "cash" }));
  assert.ok(!expirable({ status: "paid" }), "paid orders never expire");
  assert.ok(!expirable({ status: "cancelled" }));
  assert.ok(!expirable({ stockReleasedAt: now }), "stock already given back");
  assert.ok(!expirable({ stockHold: null }), "an older order with no hold and no lines has nothing to give back");
  assert.equal(stock.expiryCutoff(now, 30).toISOString(), "2026-10-14T11:30:00.000Z");
});

test("expiry is race-safe and protected like the other cron jobs", () => {
  const expiry = read("src/lib/commerce/order-expiry.server.ts");
  assert.match(expiry, /where: \{ id: order\.id, status: \{ in: \[\.\.\.UNPAID_STATUSES\] \}, stockReleasedAt: null \}/, "only a still-unpaid order moves");
  assert.match(expiry, /if \(moved\.count !== 1\) return false;/);
  assert.match(expiry, /releaseStock\(tx, holds\)/);
  assert.match(expiry, /paymentIssue: issue/, "a late payment with no stock is flagged for a refund");
  const route = read("src/app/api/cron/expire-orders/route.ts");
  assert.match(route, /const denied = await cronDenied\(req\);\n  if \(denied\) return denied;/, "the cron secret or a signed QStash call");
  const cron = read("docs/migrations/2026-10-14-expire-orders-cron.sql");
  assert.match(cron, /-- select cron\.schedule\(/, "kept as a comment");
  assert.match(cron, /\*\/5 \* \* \* \*/);
  assert.match(cron, /https:\/\/app\.shopinbos\.com\/api\/cron\/expire-orders/);
  assert.match(read("scripts/qstash-schedules.mjs"), /\{ id: "expire-orders", path: "\/api\/cron\/expire-orders", cron: "\*\/5 \* \* \* \*" \}/);
  assert.match(cron, /name = 'cron_secret'/);
  // Marking an order paid is conditional on it still being unpaid, everywhere.
  assert.match(read("src/lib/orders/update-status.ts"), /status: \{ in: \["pending", "awaiting_payment"\] \} \}, data: updateData/);
});
