// Store preorder deposits: shoppers pay part of a seller's preorder at a card checkout and the rest once the stock is
// ready (shared/preorder.ts "Store deposits"; server src/lib/commerce/store-balance.server.ts; checkout
// src/app/api/public/store/[slug]/checkout/route.ts; the Paystack webhook; docs/migrations/2026-12-03-store-preorder-deposits.sql).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const pre = await import("../shared/preorder.ts");
const charge = await import("../src/lib/commerce/paystack-charge.ts");
const rules = await import("../src/lib/wallet/rules.ts");
const pure = await import("../src/lib/supplier-orders/pure.ts");
const compute = await import("../src/lib/dashboard/compute.ts");
const phone = await import("../apps/mobile/src/lib/preorder-pure.ts");

const NOW = new Date("2026-10-27T10:00:00Z");

test("one preorder line at 30 %: deposit now, the rest later, deposit + balance = total", () => {
  const split = pre.storeOrderDeposit({ items: [{ price: 25_000, quantity: 1, preorder: true, depositPct: 30 }], total: 25_000, shippingFee: 0 });
  assert.deepEqual(split, { payNowKobo: 750_000, balanceKobo: 1_750_000, totalKobo: 2_500_000 });
  assert.deepEqual(pre.productDepositKobo(25_000, 30), { depositKobo: 750_000, balanceKobo: 1_750_000 });
});

test("0 % and 100 % (and no preorder) are one payment, as before deposits", () => {
  for (const depositPct of [0, 100, null, undefined, -10, 250]) {
    assert.equal(pre.storeOrderDeposit({ items: [{ price: 10_000, quantity: 2, preorder: true, depositPct }], total: 20_000 }), null, String(depositPct));
    assert.equal(pre.productDepositKobo(10_000, depositPct), null, String(depositPct));
  }
  assert.equal(pre.storeOrderDeposit({ items: [{ price: 10_000, quantity: 1, preorder: false, depositPct: 30 }], total: 10_000 }), null, "not a preorder line");
  assert.equal(pre.storeOrderDeposit({ items: [{ price: 10_000, quantity: 1, preorder: true, depositPct: 30 }], total: 0 }), null, "nothing to pay");
  assert.equal(pre.lineDepositPct({ preorder: true, depositPct: 50 }), 50);
  assert.equal(pre.lineDepositPct({ preorder: true, depositPct: 100 }), 0);
});

test("rounding: the part paid now is rounded up to whole naira, the balance takes the kobo", () => {
  // ₦3,333.33 at 30 %: deposit ₦1,000 (up from ₦999.999), balance ₦2,333.33.
  const odd = pre.storeOrderDeposit({ items: [{ price: 3_333.33, quantity: 1, preorder: true, depositPct: 30 }], total: 3_333.33 });
  assert.deepEqual(odd, { payNowKobo: 100_033, balanceKobo: 233_300, totalKobo: 333_333 });
  assert.equal(odd.balanceKobo % 100, 0, "balance in whole naira");
  for (const [price, qty, pct] of [[12_345.67, 3, 33], [999.99, 1, 50], [1, 1, 1], [250_000, 7, 7], [4_500, 2, 99]]) {
    const total = Math.round(price * qty * 100) / 100;
    const split = pre.storeOrderDeposit({ items: [{ price, quantity: qty, preorder: true, depositPct: pct }], total });
    if (!split) continue;
    assert.equal(split.payNowKobo + split.balanceKobo, split.totalKobo, `${price}×${qty} at ${pct}%`);
    assert.ok(split.payNowKobo >= Math.round((split.totalKobo * pct) / 100) - 100, "never less than the share");
    assert.ok(split.payNowKobo >= 100, "at least ₦1 now");
  }
});

test("mixed bag: normal lines and delivery in full now, only the preorder line's balance later", () => {
  const items = [
    { price: 10_000, quantity: 2, preorder: true, depositPct: 50 }, // ₦20,000: ₦10,000 now, ₦10,000 later
    { price: 4_000, quantity: 1 }, // in full now
    { price: 6_000, quantity: 1, preorder: true }, // a preorder with no deposit: in full now
  ];
  const split = pre.storeOrderDeposit({ items, total: 30_000 + 2_500, shippingFee: 2_500 });
  assert.deepEqual(split, { payNowKobo: 2_250_000, balanceKobo: 1_000_000, totalKobo: 3_250_000 });
  // Free delivery (a delivery discount) leaves the goods as they are.
  const free = pre.storeOrderDeposit({ items, total: 30_000, shippingFee: 2_500, deliveryDiscount: 2_500 });
  assert.deepEqual(free, { payNowKobo: 2_000_000, balanceKobo: 1_000_000, totalKobo: 3_000_000 });
  // 10 % off the goods comes off both parts in proportion.
  const off = pre.storeOrderDeposit({ items, total: 27_000 + 2_500, shippingFee: 2_500 });
  assert.equal(off.balanceKobo, 900_000);
  assert.equal(off.payNowKobo + off.balanceKobo, 2_950_000);
  // A huge discount can never push the balance past what's left to pay.
  const huge = pre.storeOrderDeposit({ items, total: 500, shippingFee: 0 });
  assert.ok(huge.balanceKobo <= 50_000 - 100 && huge.payNowKobo >= 100);
});

test("balance = total − deposit, and what an order has paid / still owes", () => {
  const order = { status: "paid", total: 32_500, depositKobo: 2_250_000, balanceKobo: 1_000_000, balancePaidAt: null, balanceDueAt: null };
  assert.equal(pre.storeHasDeposit(order), true);
  assert.equal(pre.storeBalanceDue(order), true);
  assert.deepEqual(pre.storeOrderMoney(order), { totalKobo: 3_250_000, payNowKobo: 2_250_000, balanceKobo: 1_000_000, paidKobo: 2_250_000, dueKobo: 1_000_000 });
  assert.deepEqual(pre.storeOrderMoney({ ...order, status: "pending" }).paidKobo, 0, "unpaid: nothing paid yet");
  assert.deepEqual(pre.storeOrderMoney({ ...order, balancePaidAt: NOW }), { totalKobo: 3_250_000, payNowKobo: 2_250_000, balanceKobo: 1_000_000, paidKobo: 3_250_000, dueKobo: 0 });
  assert.equal(pre.storeOrderMoney({ ...order, status: "cancelled" }).dueKobo, 0, "a cancelled order owes nothing");
  assert.equal(pre.storeBalanceDue({ ...order, status: "processing" }), false);
  assert.equal(pre.storeBalanceDue({ ...order, balancePaidAt: NOW }), false);
  assert.equal(pre.storeBalanceDue({ status: "paid", depositKobo: 0, balanceKobo: 0 }), false, "no deposit");
  // Overdue only once asked and past the day.
  const asked = pre.storeBalanceDueAt(NOW);
  assert.equal(asked.toISOString(), "2026-11-03T10:00:00.000Z");
  assert.equal(pre.storeBalanceOverdue({ ...order, balanceDueAt: asked }, NOW), false);
  assert.equal(pre.storeBalanceOverdue({ ...order, balanceDueAt: asked }, new Date("2026-11-03T10:00:01Z")), true);
  assert.equal(pre.storeBalanceOverdue(order, new Date("2027-01-01")), false, "never asked: never overdue");
});

test("the first payment is checked against the deposit charged, not the total (webhook and return page)", () => {
  const order = { id: "ord_1", total: 32_500, currency: "NGN", status: "pending", depositKobo: 2_250_000, balanceKobo: 1_000_000 };
  const paid = { reference: "ord_1", amount: 2_250_000, currency: "NGN", status: "success" };
  assert.equal(charge.firstChargeKobo(order), pre.storeFirstChargeKobo(order), "the same rule as shared/preorder.ts");
  assert.equal(charge.retailChargeProblem(order, paid), null);
  assert.match(charge.retailChargeProblem(order, { ...paid, amount: 2_249_999 }), /less than the deposit/);
  // An order without a deposit still needs the whole total.
  assert.match(charge.retailChargeProblem({ ...order, depositKobo: 0, balanceKobo: 0 }, paid), /less than the order total/);
  assert.equal(charge.firstChargeKobo({ total: 100, depositKobo: 5_000, balanceKobo: 0 }), 10_000, "no balance: the whole total");
});

test("Shopinbos's fee is taken once across the two payments: part at checkout, the rest with the balance", () => {
  const fee = { rate: 5, minFee: 0, maxFee: 0 };
  const goods = 3_000_000;
  const full = rules.platformFeeKobo(goods, fee);
  const parts = pre.splitFeeForBalance(full, goods, 1_000_000);
  assert.equal(parts.nowKobo + parts.laterKobo, full);
  assert.equal(parts.laterKobo, Math.round(full / 3));
  assert.deepEqual(pre.splitFeeForBalance(full, goods, 0), { nowKobo: full, laterKobo: 0 });
  assert.deepEqual(pre.splitFeeForBalance(0, goods, 500), { nowKobo: 0, laterKobo: 0 });
  // The two split plans checkout saves (src/lib/wallet/wallet.server.ts splitPlanForOrder with balanceKobo).
  const now = rules.buildSplitPlan({ totalKobo: 2_250_000 + 250_000, sellerSubaccount: "ACCT_seller", suppliers: [], platformKobo: parts.nowKobo });
  const later = rules.buildSplitPlan({ totalKobo: 1_000_000, sellerSubaccount: "ACCT_seller", suppliers: [], platformKobo: parts.laterKobo });
  assert.equal(now.platformKobo + later.platformKobo, full, "no double counting, nothing missing");
  assert.equal(now.sellerKobo + later.sellerKobo + full, 3_500_000);
  assert.equal(later.sellerKobo, 1_000_000 - parts.laterKobo, "the balance is all the seller's less its part of the fee");
});

test("suppliers and delivery wait for the balance; the seller lists say Balance due", () => {
  const order = { status: "paid", paymentMethod: null, depositKobo: 2_250_000, balanceKobo: 1_000_000, balancePaidAt: null };
  assert.equal(pure.readyForSuppliers(order), false);
  assert.equal(pure.readyForSuppliers({ ...order, balancePaidAt: NOW }), true);
  assert.equal(pure.readyForSuppliers({ status: "paid", paymentMethod: null }), true, "no deposit: as before");
  const row = { id: "o", orderNumber: "SB-1", buyerName: "Ada", buyerEmail: "a@x.ng", items: [], total: 32_500, createdAt: NOW, channel: null, deliveryAddress: {}, logisticsDetails: null };
  assert.equal(compute.paymentState({ ...row, ...order }).label, "Balance due");
  assert.equal(compute.paymentState({ ...row, ...order, balancePaidAt: NOW }).label, "Paid");
});

test("My shop preorders: balance due stage, Stock is ready asks for the rest and only moves orders paid in full", () => {
  const line = { productId: "p1", name: "Ankara gown", quantity: 1, preorder: true, shipsOn: "2026-12-12", depositPct: 30 };
  const orders = [
    { id: "a", orderNumber: "SB-A", status: "paid", buyerName: "Ada", items: [line], createdAt: "2026-10-01T00:00:00Z" },
    { id: "b", orderNumber: "SB-B", status: "paid", buyerName: "Bola", items: [line], createdAt: "2026-10-02T00:00:00Z", depositKobo: 750_000, balanceKobo: 1_750_000 },
    { id: "c", orderNumber: "SB-C", status: "paid", buyerName: "Chi", items: [line], createdAt: "2026-10-03T00:00:00Z", depositKobo: 750_000, balanceKobo: 1_750_000, balanceDueAt: "2026-10-20T00:00:00Z" },
    { id: "d", orderNumber: "SB-D", status: "paid", buyerName: "Dayo", items: [line], createdAt: "2026-10-04T00:00:00Z", depositKobo: 750_000, balanceKobo: 1_750_000, balancePaidAt: "2026-10-05T00:00:00Z" },
  ];
  const [group] = pre.groupStorePreorders(orders, NOW);
  assert.equal(group.waiting, 2, "a (paid in full) and d (balance paid)");
  assert.equal(group.balanceDue, 2);
  const byId = Object.fromEntries(group.orders.map((order) => [order.id, order]));
  assert.equal(byId.b.stage, "balance_due");
  assert.equal(byId.b.dueKobo, 1_750_000);
  assert.equal(byId.b.balanceDueOn, null);
  assert.equal(byId.b.overdue, false);
  assert.equal(byId.c.overdue, true);
  assert.equal(byId.c.balanceDueOn, "2026-10-20");
  assert.equal(byId.a.dueKobo, 0);
  assert.deepEqual(pre.storeStockReadyTargets(orders, "p1").map((order) => order.id), ["a", "d"]);
  assert.deepEqual(pre.storeBalanceRequestTargets(orders, "p1").map((order) => order.id), ["b", "c"]);
  // The phone's words for it.
  const money = (naira) => `₦${naira.toLocaleString("en-NG")}`;
  assert.equal(phone.balanceDueText(byId.b, money, NOW), "Deposit paid · ₦17,500 to pay when the stock is ready");
  assert.equal(phone.balanceDueText(byId.c, money, NOW), "₦17,500 overdue since 20 Oct");
  assert.equal(phone.storeStageText("balance_due"), "Balance due");
});

test("the webhook handles balance references on their own path, idempotently", () => {
  const webhook = read("src/app/api/webhooks/paystack/route.ts");
  const balanceBranch = webhook.indexOf("startsWith(STORE_BALANCE_PREFIX)");
  const retailBranch = webhook.indexOf("// ── Retail order payment (storefront checkout)");
  assert.ok(balanceBranch > 0 && balanceBranch < retailBranch, "balance refs never reach the order-id branch");
  assert.match(webhook.slice(balanceBranch, balanceBranch + 700), /confirmStoreBalancePayment\(event\.data\.reference\)/);
  assert.match(webhook.slice(balanceBranch, balanceBranch + 700), /Retry later", \{ status: 500 \}/, "a failed check asks Paystack to retry");
  assert.match(webhook, /select: \{ id: true, total: true, currency: true, status: true, expiredAt: true, depositKobo: true, balanceKobo: true \}/, "the deposit is compared, not the total");

  const service = read("src/lib/commerce/store-balance.server.ts");
  const confirm = service.slice(service.indexOf("export async function confirmStoreBalancePayment"), service.indexOf("async function afterStoreBalancePaid"));
  assert.match(confirm, /findUnique\(\{ where: \{ balanceRef: reference \}/, "a replay that was already recorded returns at once");
  assert.match(confirm, /verifyPaystackTransaction\(reference\)/, "only Paystack's reply counts");
  assert.match(confirm, /meta\.kind !== "store_balance"/);
  assert.match(confirm, /< owed/, "the amount must cover the balance");
  assert.match(confirm, /updateMany\(\{ where: \{ id: order\.id, status: "paid", balancePaidAt: null, balanceKobo: \{ gt: 0 \} \}/, "recorded once, while it's still due");
  assert.match(confirm, /P2002/, "the unique reference settles a race");
  assert.match(confirm, /fresh: false/);
  assert.match(confirm, /afterStoreBalancePaid\(order\.id, "paystack"\)/);
  assert.equal((confirm.match(/afterStoreBalancePaid\(/g) ?? []).length, 1, "follow-ups run only for the call that recorded it");

  const schema = read("prisma/schema.prisma");
  assert.match(schema, /balanceRef\s+String\?\s+@unique/);
  const sql = read("docs/migrations/2026-12-03-store-preorder-deposits.sql");
  assert.match(sql, /CREATE UNIQUE INDEX IF NOT EXISTS "RetailOrder_balanceRef_key"/);
  for (const column of ["depositKobo", "balanceKobo", "depositPaidAt", "balanceSplit", "balanceRef", "balancePaidAt", "balancePaidVia", "balanceRequestedAt", "balanceDueAt"]) {
    assert.match(sql, new RegExp(`ADD COLUMN IF NOT EXISTS "${column}"`), column);
  }
  assert.match(sql, /"StoreProduct" ADD COLUMN IF NOT EXISTS "preorderDepositPct"/);
  assert.doesNotMatch(sql, /DROP |ALTER COLUMN/, "additive only");

  // The return page takes balance references through the same confirmation, for its own order only.
  const payments = read("src/app/actions/payments.ts");
  assert.match(payments, /reference\.startsWith\(STORE_BALANCE_PREFIX\)[\s\S]{0,200}confirmStoreBalancePayment\(reference\)[\s\S]{0,200}result\.orderId !== orderId/);
  assert.match(payments, /firstChargeKobo\(order\)/);
});

test("each 'order became paid' effect waits or runs as decided for a deposit", () => {
  const afterPaid = read("src/lib/commerce/order-paid.server.ts");
  assert.match(afterPaid, /if \(deposit\) await afterStoreDepositPaid\(orderId\)/, "deposit received email + SMS (once)");
  assert.match(afterPaid, /if \(!deposit\) await notifyOrderCustomer/, "no 'payment received' text for a deposit");
  assert.match(afterPaid, /if \(!newlyPaid \|\| deposit\) return;/, "the paid-in-full email and automations wait for the balance");
  const suppliers = read("src/lib/supplier-orders/service.server.ts");
  assert.match(suppliers.slice(suppliers.indexOf("export async function ensureSupplierOrdersSafely")), /if \(waiting\) return \{ created: 0 \};[\s\S]*dispatchOrderDeliveriesSafely/, "dropship orders and delivery bookings wait");
  const status = read("src/lib/orders/update-status.ts");
  assert.match(status, /storeBalanceDue\(order\) && \["processing", "packed", "shipped", "delivered"\]\.includes\(input\.status\)/);
  const wallet = read("src/lib/wallet/wallet.server.ts");
  // The later part's entries add "-balance" to the references the checkout part uses (sale-balance:<order id>…).
  assert.match(wallet, /reference: `sale\$\{tag\}:\$\{order\.id\}`/, "the balance's wallet entry has its own reference");
  assert.match(wallet, /addShares\(balance, "-balance", order\.balanceRef/);
  assert.match(wallet, /key: `\$\{order\.id\}:balance`/);
  const fees = read("src/lib/wallet/platform-fees.server.ts");
  assert.match(fees, /\(plan\.platformKobo \?\? 0\) \+ \(balance\?\.platformKobo \?\? 0\)/, "the fee report counts the balance's part once it's paid");
  const checkout = read("src/app/api/public/store/[slug]/checkout/route.ts");
  assert.match(checkout, /const deposit = paymentMethod === "paystack" && !link \? priced\.deposit : null;/, "card checkouts only, never payment links");
  assert.match(checkout, /amountKobo: plan\.totalKobo/);
  assert.match(checkout, /balanceSplit: JSON\.parse\(JSON\.stringify\(balancePlan\)\)/);
});

test("words: the new keys are in all five languages (web orders + phone m_ui)", async () => {
  for (const lang of ["en", "pcm", "yo", "ha", "ig"]) {
    const orders = (await import(`../shared/i18n/messages/orders/${lang}.ts`)).default;
    const ui = (await import(`../shared/i18n/messages/m_ui/${lang}.ts`)).default;
    for (const key of ["preorders.storeStage.balance_due", "preorders.balanceOwed", "preorders.balanceBy", "preorders.balanceOverdue", "preorders.balanceAskConfirm", "preorders.askedDone", "preorders.markPaid", "preorders.cancelUnpaid", "preorders.cancelUnpaidConfirm", "preorders.cancelUnpaidYes", "pay.Balance due"]) {
      assert.ok(orders[key], `orders/${lang} ${key}`);
    }
    for (const key of ["preorders.storeStage.balance_due", "preorders.balanceOwed", "preorders.markPaid", "preorders.cancelUnpaid", "preorders.depositCustomers", "preorders.depositHintCustomers", "preorders.noDepositHintCustomers", "preorders.markedPaid", "preorders.cancelledUnpaid"]) {
      assert.ok(ui[key], `m_ui/${lang} ${key}`);
    }
  }
});
