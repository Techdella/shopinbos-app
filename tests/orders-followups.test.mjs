// Orders follow-ups: the bank-transfer payment window, orders from before stock holds were saved, discount uses
// given back once, automatic refunds of late payments, wholesale stock reservations and supplier payouts.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const stock = await import("../src/lib/commerce/stock-holds.ts");
const refunds = await import("../src/lib/commerce/refunds.ts");
const so = await import("../src/lib/supplier-orders/pure.ts");
const payments = await import("../shared/checkout-payments.ts");

const windows = { cardMinutes: 30, transferMinutes: 24 * 60 };

// ─── 1. Payment windows ───────────────────────────────────────────────────────

test("card orders get 30 minutes, bank transfer 24 hours, pay on delivery never expires", () => {
  assert.equal(stock.paymentWindowMinutes(null, windows), 30, "null method is Paystack checkout");
  assert.equal(stock.paymentWindowMinutes("paystack", windows), 30);
  assert.equal(stock.paymentWindowMinutes("transfer", windows), 24 * 60);
  assert.equal(stock.paymentWindowMinutes("pay_on_delivery", windows), null);
  assert.equal(stock.paymentWindowMinutes("cash", windows), null);
  const placed = new Date("2026-10-15T10:00:00Z");
  assert.equal(stock.paymentDueAt(placed, null, windows).toISOString(), "2026-10-15T10:30:00.000Z");
  assert.equal(stock.paymentDueAt(placed, "transfer", windows).toISOString(), "2026-10-16T10:00:00.000Z");
  assert.equal(stock.paymentDueAt(placed, "pay_on_delivery", windows), null);
});

test("UNPAID_TRANSFER_TTL_HOURS: default 24, whole hours from 1 to a week", () => {
  assert.equal(stock.DEFAULT_UNPAID_TRANSFER_TTL_HOURS, 24);
  assert.equal(stock.unpaidTransferTtlHours(undefined), 24);
  assert.equal(stock.unpaidTransferTtlHours(""), 24);
  assert.equal(stock.unpaidTransferTtlHours("abc"), 24);
  assert.equal(stock.unpaidTransferTtlHours("-3"), 24);
  assert.equal(stock.unpaidTransferTtlHours("48"), 48);
  assert.equal(stock.unpaidTransferTtlHours("0.4"), 1);
  assert.equal(stock.unpaidTransferTtlHours("1000"), 168);
});

test("the seller's own transfer window comes from paymentConfig.transferWindowHours", () => {
  assert.equal(payments.readTransferWindowHours(null), null);
  assert.equal(payments.readTransferWindowHours({ paymentConfig: {} }), null);
  assert.equal(payments.readTransferWindowHours({ paymentConfig: { transferWindowHours: 48 } }), 48);
  assert.equal(payments.readTransferWindowHours({ paymentConfig: { transferWindowHours: "48" } }), null, "only numbers");
  assert.equal(payments.readTransferWindowHours({ paymentConfig: { transferWindowHours: 999 } }), 168);
  assert.ok(payments.TRANSFER_WINDOW_CHOICES.includes(24));
  const expiry = read("src/lib/commerce/order-expiry.server.ts");
  assert.match(expiry, /readTransferWindowHours\(brandSettings\)/);
  assert.match(read("src/app/home/payments/actions.ts"), /TRANSFER_WINDOW_CHOICES/);
});

test("checkout saves the deadline and expiry uses it (older orders use the method's window)", () => {
  const checkout = read("src/app/api/public/store/[slug]/checkout/route.ts");
  assert.match(checkout, /paymentDueAt: checkoutPaymentDueAt\(/);
  assert.match(checkout, /payBy: order\.paymentDueAt/);
  const now = new Date("2026-10-15T12:00:00Z");
  const base = { status: "pending", paymentMethod: "transfer", stockHold: [{ source: "store", productId: "p", quantity: 1, name: "P" }], stockReleasedAt: null };
  // Saved deadline wins over the window.
  assert.ok(stock.isExpirableOrder({ ...base, createdAt: new Date("2026-10-15T11:00:00Z"), paymentDueAt: new Date("2026-10-15T11:59:00Z") }, now, windows));
  assert.ok(!stock.isExpirableOrder({ ...base, createdAt: new Date("2026-10-13T11:00:00Z"), paymentDueAt: new Date("2026-10-16T11:00:00Z") }, now, windows), "the seller gave 72 hours");
  // No saved deadline: transfer gets the 24-hour window from createdAt.
  assert.ok(!stock.isExpirableOrder({ ...base, createdAt: new Date("2026-10-15T00:00:00Z") }, now, windows));
  assert.ok(stock.isExpirableOrder({ ...base, createdAt: new Date("2026-10-14T11:59:00Z") }, now, windows));
  assert.equal(stock.windowInWords(30), "30 minutes");
  assert.equal(stock.windowInWords(24 * 60), "24 hours");
  assert.equal(stock.windowInWords(72 * 60), "3 days");
});

test("the buyer's transfer instructions state the real deadline, not 'about 30 minutes'", () => {
  const page = read("src/app/s/[slug]/order/[orderId]/OrderConfirmation.tsx");
  assert.doesNotMatch(page, /about 30 minutes/);
  assert.match(page, /payByText\(transfer\.payBy\)/);
  assert.match(read("src/app/s/[slug]/order/[orderId]/TransferInstructions.tsx"), /Pay by <strong[^>]*>\{payByText\(details\.payBy\)\}/);
  assert.match(read("src/app/s/[slug]/order/[orderId]/order-props.ts"), /payBy: orderPaymentDeadline\(order, paymentWindows\(\)\)/);
});

// ─── 4. Orders from before holds were saved ───────────────────────────────────

test("an older checkout order's hold is what checkout took then: the store's stock, per product", () => {
  const items = [
    { productId: "a", name: "Ankara", quantity: 2, price: 10 },
    { productId: "b", name: "Bag", quantity: 1, price: 5 },
    { productId: "a", name: "Ankara (Blue)", quantity: 3, price: 10 },
    { productId: "", name: "Custom", quantity: 1 },
    { name: "No id", quantity: 4 },
    { productId: "c", quantity: 0 },
  ];
  assert.deepEqual(stock.legacyStockHold(items), [
    { source: "store", productId: "a", quantity: 5, name: "Ankara" },
    { source: "store", productId: "b", quantity: 1, name: "Bag" },
  ]);
  assert.deepEqual(stock.legacyStockHold(null), []);
  // A saved hold always wins.
  const saved = [{ source: "supplier", productId: "a", supplierProductId: "sp", quantity: 1, name: "A" }];
  assert.deepEqual(stock.orderStockHolds({ stockHold: saved, items, paystackStatus: "pending" }), saved);
  assert.equal(stock.orderStockHolds({ stockHold: null, items, paystackStatus: "pending" }).length, 2);
  // What checkout did before the release (git history): currentStock down and soldStock up, per product.
  assert.match(read("src/lib/commerce/stock.server.ts"), /currentStock: \{ increment: quantity \}/);
});

test("recorded sales are never mistaken for older checkout orders", () => {
  const items = [{ productId: "a", quantity: 1 }];
  assert.ok(stock.isLegacyCheckoutOrder({ stockHold: null, items, paystackStatus: "pending", channel: "whatsapp", logisticsDetails: null }));
  assert.ok(!stock.isLegacyCheckoutOrder({ stockHold: null, items, paystackStatus: null }), "recorded sales save paystackStatus null");
  assert.ok(!stock.isLegacyCheckoutOrder({ stockHold: null, items, paystackStatus: "pending", channel: "in_person" }));
  assert.ok(!stock.isLegacyCheckoutOrder({ stockHold: null, items, paystackStatus: "pending", logisticsDetails: { type: "collected" } }));
  assert.ok(!stock.isLegacyCheckoutOrder({ stockHold: [], items, paystackStatus: "pending" }), "has a hold: not legacy");
  assert.match(read("src/lib/orders/record-sale.ts"), /paystackStatus: null/);

  const now = new Date("2026-10-15T12:00:00Z");
  const old = new Date("2026-10-15T11:00:00Z");
  const base = { status: "pending", paymentMethod: null, createdAt: old, stockHold: null, stockReleasedAt: null, items, paystackStatus: "pending", channel: "online_store" };
  assert.ok(stock.isExpirableOrder(base, now, windows), "older card order expires and gives its stock back");
  assert.ok(!stock.isExpirableOrder({ ...base, paystackStatus: null, logisticsDetails: { type: "collected" } }, now, windows), "unpaid recorded sale stays");
  assert.ok(!stock.isExpirableOrder({ ...base, stockReleasedAt: now }, now, windows), "never twice");
});

test("expiry and cancelling cover older orders, guarded by stockReleasedAt", () => {
  const expiry = read("src/lib/commerce/order-expiry.server.ts");
  assert.match(expiry, /const holds = orderStockHolds\(order\);/);
  assert.match(expiry, /stockHold: \{ equals: Prisma\.DbNull \}, paystackStatus: \{ not: null \}/);
  // Cancel: claim stockReleasedAt conditionally, then give back.
  assert.match(expiry, /where: \{ id: order\.id, stockReleasedAt: null \},\s*data: \{ stockReleasedAt: new Date\(\)/);
  // The derived hold is saved, so a late payment takes back exactly the same stock.
  assert.match(expiry, /legacy \? \{ stockHold: JSON\.parse\(JSON\.stringify\(holds\)\) \}/);
});

// ─── 3. Discount codes ────────────────────────────────────────────────────────

test("a discount use goes back once, and only for orders never paid", () => {
  assert.ok(stock.shouldRestoreDiscount({ discountCode: "SAVE10", discountReleasedAt: null }, "pending"));
  assert.ok(stock.shouldRestoreDiscount({ discountCode: "SAVE10" }, "awaiting_payment"));
  assert.ok(!stock.shouldRestoreDiscount({ discountCode: "SAVE10", discountReleasedAt: new Date() }, "pending"), "already given back");
  assert.ok(!stock.shouldRestoreDiscount({ discountCode: null }, "pending"), "no code");
  assert.ok(!stock.shouldRestoreDiscount({ discountCode: "SAVE10" }, "paid"), "cancelled after payment keeps the use");
  assert.ok(!stock.shouldRestoreDiscount({ discountCode: "SAVE10" }, "shipped"));

  const expiry = read("src/lib/commerce/order-expiry.server.ts");
  // Claimed with a conditional update, then decremented never below zero; store discount first, then coupon (as checkout).
  assert.match(expiry, /updateMany\(\{ where: \{ id: order\.id, discountReleasedAt: null \}, data: \{ discountReleasedAt: now \} \}\)/);
  assert.match(expiry, /usedCount: \{ gt: 0 \} \}, data: \{ usedCount: \{ decrement: 1 \} \}/);
  assert.match(expiry, /storeId_code: \{ storeId: order\.storeId, code \}/);
  assert.match(expiry, /await restoreDiscountUse\(tx, order, order\.status, now\);/);
  assert.match(read("src/lib/orders/update-status.ts"), /releaseOrderDiscount\(order, order\.status\)/);
  const checkout = read("src/app/api/public/store/[slug]/checkout/route.ts");
  assert.match(checkout, /usedCount: \{ increment: 1 \}/, "checkout still takes the use");
});

// ─── 2. Refunds ───────────────────────────────────────────────────────────────

test("late card payments are refunded through Paystack; anything else by hand", () => {
  assert.equal(refunds.refundRoute({ id: "o1", paymentMethod: null, paystackRef: "o1" }), "paystack");
  assert.equal(refunds.refundRoute({ id: "o1", paymentMethod: "paystack", paystackRef: "ref" }), "paystack");
  assert.equal(refunds.refundRoute({ id: "o1", paymentMethod: null, paystackRef: null }), "manual", "no Paystack reference");
  assert.equal(refunds.refundRoute({ id: "o1", paymentMethod: "transfer", paystackRef: "o1" }), "manual", "money went to the seller");
  assert.equal(refunds.refundRoute({ id: "o1", paymentMethod: "flutterwave", paystackRef: "x" }), "manual", "other gateways");
});

test("the refund idempotency key and claim: one refund per payment, whatever replays", () => {
  assert.equal(refunds.refundIdempotencyKey("ord_1", "ord_1"), "late-payment-refund:ord_1:ord_1");
  assert.equal(refunds.refundIdempotencyKey("ord_1", "ord_1"), refunds.refundIdempotencyKey("ord_1", "ord_1"), "stable");
  assert.notEqual(refunds.refundIdempotencyKey("ord_1", "a"), refunds.refundIdempotencyKey("ord_1", "b"));
  assert.ok(refunds.canStartRefund({ refundStatus: null }));
  for (const status of refunds.REFUND_STATUSES) assert.ok(!refunds.canStartRefund({ refundStatus: status }), status);
  const body = refunds.paystackRefundBody({ id: "ord_1", paystackRef: "ord_1" }, "SB-1");
  assert.equal(body.transaction, "ord_1");
  assert.equal(body.merchant_note, "late-payment-refund:ord_1:ord_1");
  assert.ok(!("amount" in body), "full refund");
  const server = read("src/lib/commerce/refunds.server.ts");
  assert.match(server, /updateMany\(\{ where: \{ id: order\.id, refundStatus: null \}, data: \{ refundStatus: "pending" \} \}\)/);
  assert.match(server, /if \(claimed\.count !== 1\) return "skipped";/);
  assert.match(server, /\$\{paystackBase\(\)\}\/refund/);
  assert.match(server, /process\.env\.PAYSTACK_SECRET_KEY/);
  // The late payment path refunds instead of only flagging; a replay with a refund under way does nothing.
  const expiry = read("src/lib/commerce/order-expiry.server.ts");
  assert.match(expiry, /await refundLatePayment\(order\.id\);/);
  assert.match(expiry, /if \(order\.refundStatus\) return "needs_refund";/);
  assert.match(read("src/app/api/webhooks/paystack/route.ts"), /applyRefundEvent\(eventType/);
});

test("Paystack refund replies and events map to our refund statuses", () => {
  assert.deepEqual(refunds.readPaystackRefund(true, { status: true, data: { id: 123, status: "pending" } }), { ok: true, id: "123", status: "processing" });
  assert.deepEqual(refunds.readPaystackRefund(true, { status: true, data: { id: 9, status: "processed" } }), { ok: true, id: "9", status: "processed" });
  assert.deepEqual(refunds.readPaystackRefund(false, { status: false, message: "Transaction has been fully reversed" }), { ok: true, id: null, status: "processed" });
  const failed = refunds.readPaystackRefund(false, { status: false, message: "Insufficient balance" });
  assert.equal(failed.ok, false);
  assert.equal(failed.message, "Insufficient balance");
  assert.equal(refunds.readPaystackRefund(true, null).ok, false);
  assert.equal(refunds.refundStatusFromEvent("refund.processed"), "processed");
  assert.equal(refunds.refundStatusFromEvent("refund.failed"), "failed");
  assert.equal(refunds.refundStatusFromEvent("refund.pending"), "processing");
  assert.equal(refunds.refundStatusFromEvent("charge.success"), null);
  assert.ok(refunds.refundStillOpen("pending") && refunds.refundStillOpen("processing"));
  assert.ok(!refunds.refundStillOpen("processed") && !refunds.refundStillOpen("failed") && !refunds.refundStillOpen("manual"));
});

test("a failed refund keeps the payment issue and tells the seller; the buyer hears either way", () => {
  const server = read("src/lib/commerce/refunds.server.ts");
  assert.match(server, /refundStatus: "failed", paymentIssue: issue/);
  assert.match(server, /Refund failed: order/);
  assert.match(server, /priority: "critical"|"critical"\);/);
  assert.match(server, /emailBuyer\(order, "automatic"\)/);
  assert.match(server, /emailBuyer\(order, "by_store"\)/);
});

// ─── 5. Wholesale stock ───────────────────────────────────────────────────────

test("wholesale orders reserve supplier stock when placed and give it back only when declined or cancelled", () => {
  assert.deepEqual(so.wholesaleReservation(100, 40), { reserve: 40 });
  assert.deepEqual(so.wholesaleReservation(40, 40), { reserve: 40 });
  assert.deepEqual(so.wholesaleReservation(39, 40), { short: true });
  assert.deepEqual(so.wholesaleReservation(0, 40), { reserve: 0 }, "no stock on record: made to order, nothing reserved");
  assert.ok(so.wholesaleReleasesStock("cancelled"));
  for (const status of ["confirmed", "processing", "shipped", "delivered"]) assert.ok(!so.wholesaleReleasesStock(status), status);
  assert.deepEqual([...so.SELLER_CANCELLABLE_WHOLESALE], ["pending", "confirmed"]);
  const wholesale = read("src/lib/supplier-orders/wholesale.server.ts");
  assert.match(wholesale, /stockQuantity: \{ gte: reservation\.reserve \} \},\s*data: \{ stockQuantity: \{ decrement: reservation\.reserve \} \}/, "conditional: never below zero");
  assert.match(wholesale, /where: \{ id: order\.id, stockReleasedAt: null, stockReserved: \{ gt: 0 \} \}, data: \{ stockReleasedAt: new Date\(\) \}/, "released once");
  assert.match(wholesale, /if \(result\.count === 1 && wholesaleReleasesStock\(next\)\) await releaseWholesaleStock\(tx, order\.id\);/);
});

// ─── 6. Supplier money ────────────────────────────────────────────────────────

test("supplier earned, owed and paid count wholesale and dropship alike", () => {
  const money = so.supplierMoney([
    { status: "delivered", amount: 7000, paidOutAt: null },
    { status: "shipped", amount: 3000, paidOutAt: new Date() },
    { status: "pending", amount: 999 },
    { status: "rejected", amount: 500 },
    { status: "cancelled", amount: 500 },
  ]);
  assert.deepEqual(money, { earned: 10000, paid: 3000, owed: 7000, earnedCount: 2, paidCount: 1, owedCount: 1 });
  const server = read("src/lib/supplier-orders/money.server.ts");
  assert.match(server, /db\.supplierOrder\.aggregate\(\{ where: dropshipWhere, _sum: \{ costTotal: true \}/);
  assert.match(server, /db\.supplierOrder\.count\(\{ where: \{ supplierId, status: \{ in: \[\.\.\.DROPSHIP_TO_SHIP\] \} \} \}\)/);
  const dashboard = read("src/app/supplier/dashboard/page.tsx");
  assert.match(dashboard, /<VerificationChecklist/, "the verification checklist stays at the top");
  assert.match(dashboard, /supplierOrdersToShip\(supplier\.id\)/);
  assert.match(dashboard, /listDropshipOrders\(supplier\.id/);
  assert.match(read("src/app/supplier/payouts/page.tsx"), /supplierEarnings\(supplier\.id\)/);
  assert.match(read("src/app/api/mobile/supplier/overview/route.ts"), /owed: earnings\.owed/);
});

test("the migration is additive and idempotent", () => {
  const sql = read("docs/migrations/2026-10-15-orders-followups.sql");
  for (const column of ["paymentDueAt", "discountReleasedAt", "refundStatus", "refundId", "refundedAt", "stockReserved", "stockReleasedAt", "paidOutAt"]) {
    assert.match(sql, new RegExp(`ADD COLUMN IF NOT EXISTS "${column}"`), column);
  }
  assert.doesNotMatch(sql, /DROP |ALTER COLUMN/);
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
});
