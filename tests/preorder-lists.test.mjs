// Preorder lists, "Stock is ready" and deposits (shared/preorder.ts; server src/lib/supplier-orders/preorders.server.ts).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const pre = await import("../shared/preorder.ts");
const phone = await import("../apps/mobile/src/lib/preorder-pure.ts");
const notifications = await import("../shared/notifications.ts");
const screens = await import("../shared/peggy-screens.ts");

const NOW = new Date("2026-10-27T10:00:00Z");
const naira = (amount) => `₦${Math.round(amount).toLocaleString("en-NG")}`;

test("deposit money in kobo: 0 % and 100 %, rounding up to whole naira, deposit + balance = total", () => {
  assert.deepEqual(pre.depositSplit(1_000_000, 0), { depositKobo: 0, balanceKobo: 1_000_000 }, "0 %: nothing up front");
  assert.deepEqual(pre.depositSplit(1_000_000, 100), { depositKobo: 1_000_000, balanceKobo: 0 }, "100 %: all of it now");
  assert.deepEqual(pre.depositSplit(1_000_000, 30), { depositKobo: 300_000, balanceKobo: 700_000 });
  // ₦3,333.33 at 30 % is ₦999.999: rounded up to ₦1,000, and the balance takes the kobo.
  assert.deepEqual(pre.depositSplit(333_333, 30), { depositKobo: 100_000, balanceKobo: 233_333 });
  // Rounding up never goes past the total.
  assert.deepEqual(pre.depositSplit(150, 99), { depositKobo: 150, balanceKobo: 0 });
  for (const [total, pct] of [[12_345_67, 33], [99_999, 50], [1, 1], [250_000_00, 7]]) {
    const split = pre.depositSplit(total, pct);
    assert.equal(split.depositKobo + split.balanceKobo, total, `${total} at ${pct}%`);
    assert.ok(split.depositKobo >= Math.round((total * pct) / 100) - 1, "never less than the share");
    assert.equal(split.depositKobo % 100 === 0 || split.depositKobo === total, true, "whole naira (or the whole total)");
  }
  assert.deepEqual(pre.depositSplit(0, 30), { depositKobo: 0, balanceKobo: 0 });
  assert.deepEqual(pre.depositSplit(1000, -5), { depositKobo: 0, balanceKobo: 1000 }, "out of range: clamped");
  assert.deepEqual(pre.depositSplit(1000, 250), { depositKobo: 1000, balanceKobo: 0 });
  assert.equal(pre.toKobo(1234.565), 123457);
  assert.equal(pre.toKobo(Number.NaN), 0);
});

test("deposit percent from a form: whole numbers 0 to 100, empty is none", () => {
  assert.deepEqual(pre.parseDepositPct(""), { ok: true, value: 0 });
  assert.deepEqual(pre.parseDepositPct(undefined), { ok: true, value: 0 });
  assert.deepEqual(pre.parseDepositPct("30"), { ok: true, value: 30 });
  assert.deepEqual(pre.parseDepositPct("50%"), { ok: true, value: 50 });
  assert.deepEqual(pre.parseDepositPct(100), { ok: true, value: 100 });
  for (const bad of ["abc", "12.5", -1, 101, "1000"]) assert.equal(pre.parseDepositPct(bad).ok, false, String(bad));
  assert.equal(pre.PREORDER_DEPOSIT_SUGGESTED, 30);
  assert.deepEqual([...pre.PREORDER_DEPOSIT_CHOICES], [0, 30, 50, 100]);
});

test("what a seller pays: deposit as soon as it's placed, the balance once the stock is ready, nothing twice", () => {
  const base = { totalPrice: 10_000, currency: "NGN", preorder: true, depositKobo: 300_000 };
  // Placed: the deposit is due even before the supplier accepts.
  assert.deepEqual(pre.wholesalePayStep({ ...base, status: "pending" }), { step: "deposit", kobo: 300_000 });
  assert.deepEqual(pre.wholesalePayStep({ ...base, status: "confirmed" }), { step: "deposit", kobo: 300_000 });
  // Deposit paid, still waiting for stock: nothing to pay.
  const deposited = { ...base, status: "confirmed", depositPaidAt: NOW };
  assert.equal(pre.wholesalePayStep(deposited), null);
  assert.equal(pre.wholesalePreorderStage(deposited), "waiting");
  // Stock ready: the balance.
  const ready = { ...deposited, preorderReadyAt: NOW };
  assert.deepEqual(pre.wholesalePayStep(ready), { step: "balance", kobo: 700_000 });
  assert.equal(pre.wholesalePreorderStage(ready), "pay_balance");
  assert.equal(pre.preorderBlocksShipping(ready), true, "not packed or sent before it's all paid");
  // Stock ready but the supplier hasn't accepted yet: the balance waits for the acceptance.
  assert.equal(pre.wholesalePayStep({ ...ready, status: "pending" }), null);
  // All paid.
  const paid = { ...ready, paidAt: NOW, paidOutAt: NOW };
  assert.equal(pre.wholesalePayStep(paid), null);
  assert.equal(pre.wholesalePreorderStage(paid), "ready");
  assert.equal(pre.preorderBlocksShipping(paid), false);
  assert.deepEqual(pre.wholesaleMoney(paid), { totalKobo: 1_000_000, depositKobo: 300_000, paidKobo: 1_000_000, dueKobo: 0 });
  assert.deepEqual(pre.wholesaleMoney(ready), { totalKobo: 1_000_000, depositKobo: 300_000, paidKobo: 300_000, dueKobo: 700_000 });
  // The supplier says they were paid another way: done, and it can ship.
  assert.equal(pre.preorderBlocksShipping({ ...ready, paidOutAt: NOW }), false);
  // A deposit never paid once the stock is ready: the deposit first (then the balance).
  assert.deepEqual(pre.wholesalePayStep({ ...base, status: "confirmed", preorderReadyAt: NOW }), { step: "deposit", kobo: 300_000 });
  // Cancelled or sent: nothing.
  assert.equal(pre.wholesalePayStep({ ...base, status: "cancelled" }), null);
  assert.equal(pre.wholesalePayStep({ ...base, status: "shipped" }), null);
  // 100 % deposit: everything up front, no balance step.
  const all = { ...base, depositKobo: 1_000_000, status: "confirmed", depositPaidAt: NOW, preorderReadyAt: NOW };
  assert.equal(pre.wholesalePayStep(all), null);
  assert.equal(pre.wholesalePreorderStage(all), "ready");
});

test("without a deposit nothing changes: the whole order once the supplier accepts it", () => {
  const order = { totalPrice: 5000, currency: "NGN", preorder: true, depositKobo: 0 };
  assert.equal(pre.wholesalePayStep({ ...order, status: "pending" }), null);
  assert.deepEqual(pre.wholesalePayStep({ ...order, status: "confirmed" }), { step: "full", kobo: 500_000 });
  assert.equal(pre.preorderBlocksShipping({ ...order, status: "confirmed" }), false, "no deposit: ships as before");
  assert.deepEqual(pre.wholesalePayStep({ totalPrice: 5000, currency: "NGN", status: "processing" }), { step: "full", kobo: 500_000 }, "an ordinary bulk order");
  assert.equal(pre.wholesalePayStep({ totalPrice: 5000, currency: "USD", status: "confirmed" }), null, "naira only");
  assert.equal(pre.wholesalePreorderStage({ ...order, status: "confirmed", preorderReadyAt: NOW }), "ready");
});

test("supplier preorders by product: units, shops, paid and due; Stock is ready picks the open, unmarked ones", () => {
  const product = { id: "p1", name: "Ankara fabric", image: null, preorderEnabled: true, preorderShipsAt: "2026-12-12T12:00:00Z", preorderLimit: 100, preorderTaken: 30, preorderDepositPct: 30 };
  const other = { ...product, id: "p2", name: "Shea butter", preorderShipsAt: "2026-11-20T12:00:00Z", preorderDepositPct: 0 };
  const row = (id, extra) => ({ id, status: "confirmed", quantity: 10, sellerId: "s1", shop: "Ada's", createdAt: "2026-10-20T10:00:00Z", totalPrice: 10_000, currency: "NGN", preorder: true, depositKobo: 300_000, product, ...extra });
  const rows = [
    row("o1", { depositPaidAt: NOW }),
    row("o2", { sellerId: "s2", shop: "Bola's", createdAt: "2026-10-19T10:00:00Z" }),
    row("o3", { sellerId: "s1", preorderReadyAt: NOW, depositPaidAt: NOW, paidAt: NOW, status: "processing" }),
    row("o4", { status: "cancelled" }),
    row("o5", { product: other, depositKobo: 0, quantity: 5 }),
  ];
  const groups = pre.groupSupplierPreorders(rows);
  assert.deepEqual(groups.map((group) => group.product.id), ["p2", "p1"], "soonest ship date first");
  const fabric = groups[1];
  assert.equal(fabric.units, 30, "cancelled orders left out");
  assert.equal(fabric.shops, 2);
  assert.equal(fabric.waiting, 2);
  assert.equal(fabric.product.depositPct, 30);
  assert.equal(fabric.product.shipsOn, "2026-12-12");
  assert.deepEqual(fabric.orders.map((order) => order.id), ["o2", "o1", "o3"], "oldest first");
  assert.equal(fabric.paidKobo, 300_000 + 1_000_000);
  assert.equal(fabric.dueKobo, 1_000_000 + 700_000);
  assert.deepEqual(fabric.orders.map((order) => order.stage), ["waiting", "waiting", "ready"]);
  assert.deepEqual(pre.stockReadyTargets(rows).map((order) => order.id), ["o1", "o2", "o5"], "open and not marked ready yet");
});

test("store preorders by product: ship-by date, units, paid ones move, unpaid ones stay", () => {
  const line = (productId, extra = {}) => ({ productId, name: productId === "a" ? "Bag" : "Shoe", quantity: 1, preorder: true, shipsOn: "2026-12-01", ...extra });
  const orders = [
    { id: "r1", orderNumber: "SIB-1", status: "paid", buyerName: "Ada", createdAt: "2026-10-20T10:00:00Z", items: [line("a", { quantity: 2 }), line("b", { shipsOn: "2026-11-15" })] },
    { id: "r2", orderNumber: "SIB-2", status: "pending", buyerName: "Bola", createdAt: "2026-10-21T10:00:00Z", items: [line("a")] },
    { id: "r3", orderNumber: "SIB-3", status: "processing", buyerName: "Chi", createdAt: "2026-10-18T10:00:00Z", items: [line("a"), { productId: "c", quantity: 1, name: "Not preordered" }] },
    { id: "r4", orderNumber: "SIB-4", status: "shipped", buyerName: "Dayo", createdAt: "2026-10-18T10:00:00Z", items: [line("a")] },
    { id: "r5", orderNumber: "SIB-5", status: "paid", buyerName: "Efe", createdAt: "2026-10-22T10:00:00Z", items: [{ productId: "a", quantity: 1 }] },
  ];
  const groups = pre.groupStorePreorders(orders);
  assert.deepEqual(groups.map((group) => group.productId), ["b", "a"], "soonest ship-by first; lines that aren't preorders left out");
  const bag = groups[1];
  assert.equal(bag.units, 4);
  assert.deepEqual(bag.orders.map((order) => [order.id, order.stage, order.quantity]), [["r3", "preparing", 1], ["r1", "waiting", 2], ["r2", "unpaid", 1]], "sent orders left out");
  assert.equal(bag.waiting, 1);
  assert.equal(bag.unpaid, 1);
  assert.deepEqual(pre.storeStockReadyTargets(orders, "a").map((order) => order.id), ["r1"], "only paid orders holding a preorder line of it");
  assert.deepEqual(pre.storeStockReadyTargets(orders, "b").map((order) => order.id), ["r1"]);
  assert.equal(pre.storePreorderStage("awaiting_payment"), "unpaid");
  assert.equal(pre.storePreorderStage("delivered"), null);
});

test("phone words: deposit line, paid line, stages and pay buttons; the form sends the deposit only for suppliers", () => {
  assert.equal(phone.depositLineText(30, 240_000, naira), "Pay 30% now (₦72,000). The rest when the stock is ready.");
  assert.equal(phone.depositLineText(100, 1000, naira), "You pay it all now (₦1,000).");
  assert.equal(phone.depositLineText(0, 1000, naira), null);
  assert.equal(phone.paidText({ depositKobo: 300_000, paidKobo: 300_000, dueKobo: 700_000 }, naira), "Deposit ₦3,000 paid · ₦7,000 due");
  assert.equal(phone.paidText({ depositKobo: 300_000, paidKobo: 0, dueKobo: 1_000_000 }, naira), "Deposit ₦3,000 not paid yet");
  assert.equal(phone.paidText({ depositKobo: 0, paidKobo: 1_000_000, dueKobo: 0 }, naira), "Paid in full");
  assert.equal(phone.stageText("pay_balance"), "Stock ready: pay the rest");
  assert.equal(phone.storeStageText("preparing"), "Being prepared");
  assert.equal(phone.payButtonText({ step: "balance", kobo: 700_000 }, naira), "Pay balance ₦7,000");
  assert.equal(phone.payButtonText({ step: "deposit", kobo: 300_000 }, naira), "Pay deposit ₦3,000");

  const saved = phone.savedFromColumns({ preorderEnabled: true, preorderShipsAt: "2026-12-12T12:00:00Z", preorderLimit: 50, preorderTaken: 3, preorderNote: "Soon", preorderDepositPct: 30 });
  assert.equal(saved.depositPct, 30);
  const form = phone.preorderFormFrom(saved);
  assert.equal(form.depositPct, 30);
  assert.deepEqual(phone.preorderPatch(form, saved, NOW), { ok: true, patch: null }, "nothing changed");
  assert.equal(phone.preorderPatch({ ...form, depositPct: 50 }, saved, NOW).patch?.depositPct, 50);
  // A seller's product form has no deposit: nothing extra is sent.
  const seller = phone.preorderPatch({ enabled: true, shipsOn: "2026-12-12", limit: "", note: "" }, null, NOW);
  assert.equal("depositPct" in (seller.patch ?? {}), false);
});

test("deep links and Peggy: the preorder lists open on the phone", () => {
  assert.deepEqual(notifications.appRouteFor("/home/preorders?view=suppliers"), { pathname: "/preorders", params: { view: "suppliers" } });
  assert.deepEqual(notifications.appRouteFor("https://app.shopinbos.com/home/preorders"), { pathname: "/preorders" });
  assert.deepEqual(notifications.appRouteFor("/supplier/preorders"), { pathname: "/supplier/preorders" });
  assert.equal(screens.findScreen("supplier", "preorders")?.app, "/supplier/preorders");
  assert.equal(screens.findScreen("seller", "preorders")?.app, "/preorders");
  assert.equal(screens.findScreen("seller", "stock is ready")?.web, "/home/preorders");
});

test("server: Stock is ready, deposits paid by card in two parts, packing waits for the balance, refunds recorded as owed", () => {
  const service = read("src/lib/supplier-orders/preorders.server.ts");
  assert.match(service, /data: \{ preorderReadyAt: now \}/, "Stock is ready marks the orders once");
  assert.match(service, /dedupeKey: `preorder\.ready:wholesale:\$\{order\.id\}`/, "each shop is told once");
  assert.match(service, /updateOrderStatus\(store, order, \{ status: "processing" \}\)/, "store preorders use the usual status change");
  assert.match(service, /sourceKey: `wholesale-refund:\$\{order\.id\}`/, "what's owed back is recorded once, as money owed");
  assert.doesNotMatch(service, /initializePaystack|createRefund|transfer/i, "nothing moves money here");

  const payments = read("src/lib/supplier-orders/wholesale-payments.server.ts");
  assert.match(payments, /const due = wholesalePayStep\(order\)/);
  assert.match(payments, /metadata: \{ kind: "wholesale", part: due\.step,/);
  assert.match(payments, /data: \{ depositPaidAt: now, depositRef: reference \}/);
  assert.match(payments, /paidKobo \+ 0\.5 < expectedKobo/, "the amount Paystack verified must cover the part");

  const wholesale = read("src/lib/supplier-orders/wholesale.server.ts");
  assert.match(wholesale, /depositSplit\(toKobo\(totalPrice\), product\.preorderDepositPct \?\? 0\)/);
  assert.match(wholesale, /next === "shipped" && preorderBlocksShipping\(order\)/);
  assert.match(wholesale, /if \(next === "cancelled"\) await recordWholesaleRefundOwed\(order\.id\)/);
  assert.match(read("src/lib/supplier-orders/pickup.server.ts"), /preorderBlocksShipping\(facts\)/, "packing waits too");
  assert.match(read("src/lib/supplier-orders/acceptance.server.ts"), /if \(row\.depositPaidAt\) await recordWholesaleRefundOwed\(row\.id\)/);

  const sql = read("docs/migrations/2026-12-02-preorder-deposits.sql");
  for (const column of ["preorderDepositPct", "preorderReadyAt", "depositKobo", "depositPaidAt", "depositRef"]) assert.match(sql, new RegExp(`ADD COLUMN IF NOT EXISTS "${column}"`));
  assert.doesNotMatch(sql, /DROP|ALTER COLUMN|RENAME/i, "additive only");
});

test("screens: Find turns the button into Preorder placed and links to the preorders; entries on Orders and Wholesale", () => {
  const find = read("apps/mobile/src/app/find/[slug].tsx");
  assert.match(find, /preorderCta && preordered \?/);
  assert.match(find, /tp\("preorders\.placed"\)/);
  assert.match(find, /pathname: "\/preorders", params: \{ view: "suppliers" \}/);
  assert.match(find, /payWholesaleOrder\(order\.id\)/, "the deposit is paid right after placing");
  assert.match(read("src/app/marketplace/_components/ProductDetail.tsx"), /preorder && preorderPlaced \?/);
  assert.match(read("apps/mobile/src/app/supplier/(tabs)/orders.tsx"), /router\.push\("\/supplier\/preorders"\)/);
  assert.match(read("apps/mobile/src/app/(tabs)/orders.tsx"), /router\.push\("\/preorders"\)/);
  assert.match(read("apps/mobile/src/app/wholesale.tsx"), /pathname: "\/preorders", params: \{ view: "suppliers" \}/);
  for (const file of ["apps/mobile/src/app/preorders.tsx", "apps/mobile/src/app/supplier/preorders.tsx"]) {
    const source = read(file);
    assert.doesNotMatch(source, /<PillButton[^>]*title=/, `${file}: buttons use one-line labels`);
    assert.match(source, /<OneLine /);
  }
});
