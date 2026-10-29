import "server-only";
import { randomBytes } from "node:crypto";
import { db } from "@/lib/db/client";
import { initializePaystackTransaction, verifyPaystackTransaction } from "@/lib/paystack";
import { paystackSecretReady } from "@shared/checkout-payments";
import { paystackOutcome } from "@shared/paystack-return";
import { buildStorefrontUrl } from "@/lib/domains/storefront";
import { SENDER_STORE_SELECT } from "@/lib/email/compliance.server";
import { sendPreorderPaymentEmail } from "@/lib/email/notices.server";
import { notify } from "@/lib/notifications/notify.server";
import { triggerAutomations } from "@/lib/automations/engine";
import { notifyOrderCustomerPreorderPayment } from "@/lib/notifications/customer-messages";
import { ensureSupplierOrdersSafely } from "@/lib/supplier-orders/service.server";
import { recordOrderShares } from "@/lib/wallet/wallet.server";
import { paystackSplitParams, readSplitPlan } from "@/lib/wallet/rules";
import {
  STORE_BALANCE_PREFIX,
  storeBalanceDue,
  storeBalanceDueAt,
  storeBalanceOverdue,
  storeHasDeposit,
  storeOrderMoney,
  type StoreOrderPayFacts,
} from "@shared/preorder";

// Store preorders paid in two parts (rules in shared/preorder.ts "Store deposits"). Checkout charges the deposit part
// under the order id as reference (the webhook and the return page record it like any card order); this file is the
// rest: the shopper's "Pay the rest" (its own reference, STORE_BALANCE_PREFIX, split by the balanceSplit checkout
// worked out), the seller's "paid another way", asking for the balance when the seller says the stock is ready, and
// cancelling when it isn't paid in time. Only Paystack's verified reply records a card payment, once per order.
//
// What happens when (every "order became paid" effect, decided per part):
//   deposit paid  → status "paid" (confirmed; the stock / preorder place checkout took stays held), seller told
//                   ("deposit paid"), shopper emailed "deposit received, the rest when it's ready", campaign and
//                   rewards credited, the deposit split's shares recorded on the wallets (Shopinbos's fee on that part);
//                   NOT: supplier dropship orders, delivery bookings or "processing" (ensureSupplierOrdersSafely and
//                   updateOrderStatus wait for the balance).
//   balance paid  → balancePaidAt; the balance split's share recorded (with the rest of the fee), seller told, shopper
//                   emailed "paid in full", the seller's "payment received" automations run, supplier orders and
//                   delivery start, and if the stock is already ready the order moves to processing (the usual
//                   status change and its customer message).

const money = (kobo: number, currency = "NGN") => {
  try {
    return new Intl.NumberFormat("en-NG", { style: "currency", currency, maximumFractionDigits: 0 }).format(kobo / 100);
  } catch {
    return `₦${Math.round(kobo / 100).toLocaleString("en-NG")}`;
  }
};

const dayText = (date: Date) => date.toLocaleDateString("en-NG", { weekday: "short", day: "numeric", month: "short", timeZone: "Africa/Lagos" });

const ORDER_SELECT = {
  id: true, storeId: true, orderNumber: true, status: true, total: true, currency: true, buyerEmail: true, buyerName: true, items: true,
  depositKobo: true, balanceKobo: true, depositPaidAt: true, balanceSplit: true, balanceRef: true, balancePaidAt: true, balancePaidVia: true,
  balanceRequestedAt: true, balanceDueAt: true, paymentMethod: true,
  store: { select: { ...SENDER_STORE_SELECT, userId: true } },
} as const;

type BalanceOrder = NonNullable<Awaited<ReturnType<typeof loadOrder>>>;

function loadOrder(orderId: string) {
  return db.retailOrder.findUnique({ where: { id: orderId }, select: ORDER_SELECT });
}

const factsOf = (order: Pick<BalanceOrder, "status" | "depositKobo" | "balanceKobo" | "balancePaidAt" | "balanceDueAt" | "total">) => ({ ...order, total: Number(order.total) }) satisfies StoreOrderPayFacts & { total: number };

/** Kobo still owed on the order (0 when nothing). */
export function balanceDueKobo(order: Pick<BalanceOrder, "status" | "depositKobo" | "balanceKobo" | "balancePaidAt" | "balanceDueAt" | "total">) {
  return storeBalanceDue(order) ? storeOrderMoney(factsOf(order)).dueKobo : 0;
}

/** What the shopper's order page needs about a deposit: paid so far, still owed, by when, whether it can be paid by card. */
export function shopperBalanceView(order: Pick<BalanceOrder, "status" | "depositKobo" | "balanceKobo" | "balancePaidAt" | "balanceDueAt" | "balanceRequestedAt" | "total">) {
  if (!storeHasDeposit(order)) return null;
  const view = storeOrderMoney(factsOf(order));
  return {
    payNow: view.payNowKobo / 100,
    balance: view.balanceKobo / 100,
    paid: view.paidKobo / 100,
    due: view.dueKobo / 100,
    paidInFull: Boolean(order.balancePaidAt),
    /** The seller said the stock is ready and asked for the rest. */
    ready: Boolean(order.balanceRequestedAt),
    dueBy: order.balanceDueAt?.toISOString() ?? null,
    canPay: storeBalanceDue(order) && paystackSecretReady(process.env.PAYSTACK_SECRET_KEY),
  };
}

// ─── The deposit (first payment) ───────────────────────────────────────────────

/**
 * After a deposit order's first payment is confirmed (the webhook / return page moved it to "paid"): note when, and
 * tell the shopper "deposit received, the rest when it's ready". Once (depositPaidAt is the guard). Never throws.
 */
export async function afterStoreDepositPaid(orderId: string) {
  try {
    const order = await loadOrder(orderId);
    if (!order || !storeHasDeposit(order) || order.status !== "paid") return false;
    const moved = await db.retailOrder.updateMany({ where: { id: order.id, depositPaidAt: null }, data: { depositPaidAt: new Date() } });
    if (moved.count !== 1) return false;
    const view = storeOrderMoney(factsOf(order));
    const paid = money(view.payNowKobo, order.currency);
    const balance = money(view.balanceKobo, order.currency);
    await Promise.allSettled([
      order.buyerEmail
        ? sendPreorderPaymentEmail({ store: order.store, to: order.buyerEmail, buyerName: order.buyerName, orderNumber: order.orderNumber, kind: "deposit_received", paid, balance, orderUrl: buildStorefrontUrl(order.store, `/order/${order.id}`) })
        : null,
      notifyOrderCustomerPreorderPayment(order.id, "deposit", { paid, balance }),
    ]);
    return true;
  } catch (error) {
    console.error(`[store balance] deposit follow-up for ${orderId} failed`, error);
    return false;
  }
}

// ─── The balance by card ───────────────────────────────────────────────────────

export type StartBalanceResult = { ok: true; authorizationUrl: string; accessCode: string | null; reference: string } | { ok: false; error: string };

/**
 * The shopper's "Pay the rest": a Paystack payment of the balance under a new reference (STORE_BALANCE_PREFIX),
 * split by the balance plan checkout saved (the seller's own subaccount, refreshed if it changed since).
 */
export async function startStoreBalancePayment(orderId: string, options: { callbackUrl?: string } = {}): Promise<StartBalanceResult> {
  if (!paystackSecretReady(process.env.PAYSTACK_SECRET_KEY)) return { ok: false, error: "Card payments aren't available right now. Contact the store to pay the rest." };
  const order = await loadOrder(orderId);
  if (!order) return { ok: false, error: "We couldn't find this order." };
  if (order.balancePaidAt) return { ok: false, error: "This order is already paid in full." };
  if (!storeBalanceDue(order)) return { ok: false, error: order.status === "pending" || order.status === "awaiting_payment" ? "Pay the deposit first." : "There's nothing left to pay on this order." };
  const plan = readSplitPlan(order.balanceSplit);
  const kobo = balanceDueKobo(order);
  if (!plan || kobo <= 0 || plan.totalKobo !== kobo) return { ok: false, error: "This balance can't be paid by card. Contact the store to pay the rest." };
  const wallet = await db.wallet.findFirst({ where: { userId: order.store.userId, status: "active", subaccountStatus: "active" }, select: { subaccountCode: true } });
  if (!wallet?.subaccountCode) return { ok: false, error: "The store can't take card payments right now. Contact them to pay the rest." };
  const reference = `${STORE_BALANCE_PREFIX}${randomBytes(9).toString("hex")}`;
  try {
    const started = await initializePaystackTransaction({
      email: order.buyerEmail,
      amountKobo: kobo,
      reference,
      callbackUrl: options.callbackUrl ?? buildStorefrontUrl(order.store, `/order/${order.id}`),
      metadata: { kind: "store_balance", orderId: order.id, orderNumber: order.orderNumber, storeId: order.storeId },
      split: paystackSplitParams({ ...plan, sellerSubaccount: wallet.subaccountCode }),
    });
    if (!started.authorization_url) return { ok: false, error: "Paystack couldn't start this payment. Try again." };
    return { ok: true, authorizationUrl: started.authorization_url, accessCode: started.access_code ?? null, reference: started.reference ?? reference };
  } catch (error) {
    console.error(`[store balance] could not start the balance of order ${order.id}`, error);
    return { ok: false, error: "Paystack couldn't start this payment. Try again in a moment." };
  }
}

export type ConfirmBalanceResult = { ok: true; fresh: boolean; orderId: string } | { ok: false; error: string; retry?: boolean; pending?: boolean };

function readMetadata(value: unknown): Record<string, unknown> {
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

/**
 * Records a balance payment, once: asks Paystack (never the browser or the webhook body), checks it succeeded, was
 * for this order's balance in naira and covered it, then marks the balance paid (conditional on it still being due,
 * and the reference is unique). Safe from the webhook and the return page at the same time, and on replays.
 */
export async function confirmStoreBalancePayment(reference: string): Promise<ConfirmBalanceResult> {
  if (!reference.startsWith(STORE_BALANCE_PREFIX)) return { ok: false, error: "Not a store balance payment." };
  // Already recorded (a replayed webhook, or the return page after the webhook): nothing more to do.
  const known = await db.retailOrder.findUnique({ where: { balanceRef: reference }, select: { id: true } });
  if (known) return { ok: true, fresh: false, orderId: known.id };
  let payment;
  try {
    payment = await verifyPaystackTransaction(reference);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Paystack could not check this payment.", retry: true };
  }
  if (payment.status !== "success") return { ok: false, error: "The payment didn't go through.", pending: paystackOutcome(payment.status) === "pending" };
  if (payment.currency && payment.currency !== "NGN") return { ok: false, error: "This payment wasn't in naira." };
  const meta = readMetadata(payment.metadata);
  const orderId = typeof meta.orderId === "string" ? meta.orderId : "";
  if (meta.kind !== "store_balance" || !orderId) return { ok: false, error: "This payment isn't for a store order's balance." };
  const order = await loadOrder(orderId);
  if (!order) return { ok: false, error: "We couldn't find this order." };
  if (order.balanceRef === reference) return { ok: true, fresh: false, orderId: order.id };
  const owed = Math.max(0, order.balanceKobo);
  if (owed <= 0 || Math.round(Number(payment.amount)) < owed) {
    console.warn(`[store balance] ${reference} paid ${payment.amount} kobo, less than the balance of order ${order.id}`);
    return { ok: false, error: "The amount paid is less than the balance." };
  }
  const now = new Date();
  let moved = { count: 0 };
  try {
    moved = await db.retailOrder.updateMany({ where: { id: order.id, status: "paid", balancePaidAt: null, balanceKobo: { gt: 0 } }, data: { balancePaidAt: now, balanceRef: reference, balancePaidVia: "paystack" } });
  } catch (error) {
    if ((error as { code?: string }).code !== "P2002") throw error;
  }
  if (moved.count !== 1) {
    const current = await db.retailOrder.findUnique({ where: { id: order.id }, select: { balanceRef: true, status: true, balancePaidVia: true } });
    if (current?.balanceRef === reference) return { ok: true, fresh: false, orderId: order.id };
    // Paid twice, paid another way first, or cancelled meanwhile: the seller sends this payment back.
    const why = current?.status !== "paid" ? "after the order was cancelled" : current?.balancePaidVia === "offline" ? "after you marked it paid another way" : "twice";
    const issue = `The customer paid the rest (${money(Number(payment.amount))}) by card ${why} (Paystack ${reference}). Send it back to them.`;
    await db.retailOrder.updateMany({ where: { id: order.id, paymentIssue: null }, data: { paymentIssue: issue.slice(0, 500) } });
    await notify({ userId: order.store.userId, event: "order.update", type: "order", priority: "critical", title: `Send a payment back: order ${order.orderNumber}`, description: issue, link: `/home/orders/${order.id}`, dedupeKey: `store-balance.extra:${reference}` }).catch(() => null);
    console.warn(`[store balance] order ${order.id}: balance ${reference} arrived ${why}`);
    return { ok: false, error: "This order's balance was already settled. The store will send this payment back." };
  }
  await afterStoreBalancePaid(order.id, "paystack");
  return { ok: true, fresh: true, orderId: order.id };
}

/**
 * Once the balance is in (by card or the seller says another way): the wallet entry for it, the seller and shopper
 * told, supplier dropship orders and delivery start, and if the stock is already ready the order moves to
 * processing. Called once by whoever recorded it. Never throws.
 */
async function afterStoreBalancePaid(orderId: string, via: "paystack" | "offline") {
  try {
    const order = await loadOrder(orderId);
    if (!order) return;
    const total = money(Math.round(Number(order.total) * 100), order.currency);
    const balance = money(order.balanceKobo, order.currency);
    if (via === "paystack") await recordOrderShares(order.id);
    await ensureSupplierOrdersSafely(order.id);
    let moved = false;
    if (order.balanceRequestedAt && order.status === "paid") {
      const { updateOrderStatus } = await import("@/lib/orders/update-status");
      const full = await db.retailOrder.findUnique({ where: { id: order.id } });
      if (full) moved = (await updateOrderStatus({ id: order.store.id, name: order.store.name }, full, { status: "processing" }).catch(() => null))?.ok === true;
    }
    await Promise.allSettled([
      via === "paystack"
        ? notify({
            userId: order.store.userId,
            event: "order.paid",
            type: "payout",
            priority: "success",
            title: `Paid in full: ${order.orderNumber}`,
            description: `${order.buyerName || "Your customer"} paid the rest of their pre-order (${balance}) by card. ${moved ? "It's now processing: pack it and send it." : "Pack it once the stock is ready."}`,
            link: `/home/orders/${order.id}`,
            actionLabel: "Open the order",
            metadata: { orderId: order.id },
            dedupeKey: `order.balance_paid:${order.id}`,
            email: "transactional",
          })
        : null,
      // The seller's "payment received" automations run once the order is paid in full (not on the deposit).
      triggerAutomations("payment_received", { storeId: order.storeId, storeName: order.store.name, buyerEmail: order.buyerEmail, buyerName: order.buyerName, orderNumber: order.orderNumber, orderTotal: Number(order.total), currency: order.currency }),
      order.buyerEmail
        ? sendPreorderPaymentEmail({ store: order.store, to: order.buyerEmail, buyerName: order.buyerName, orderNumber: order.orderNumber, kind: "paid_in_full", paid: total, balance, orderUrl: buildStorefrontUrl(order.store, `/order/${order.id}`) })
        : null,
    ]);
  } catch (error) {
    console.error(`[store balance] follow-up for paid balance of ${orderId} failed`, error);
  }
}

// ─── Seller: paid another way, ask for the balance, cancel ─────────────────────

export type SellerBalanceResult = { ok: true; message: string } | { ok: false; code: "NOT_FOUND" | "CONFLICT"; message: string };

/** The seller says the shopper paid the rest another way (cash, transfer): recorded once; nothing moves through Shopinbos. */
export async function markStoreBalancePaidOffline(store: { id: string }, orderId: string): Promise<SellerBalanceResult> {
  const order = await db.retailOrder.findFirst({ where: { id: orderId, storeId: store.id }, select: { id: true, status: true, depositKobo: true, balanceKobo: true, balancePaidAt: true } });
  if (!order) return { ok: false, code: "NOT_FOUND", message: "Order not found" };
  if (!storeBalanceDue(order)) return { ok: false, code: "CONFLICT", message: order.balancePaidAt ? "The rest is already paid." : "This order has no balance to pay." };
  const moved = await db.retailOrder.updateMany({ where: { id: order.id, status: "paid", balancePaidAt: null }, data: { balancePaidAt: new Date(), balancePaidVia: "offline" } });
  if (moved.count !== 1) return { ok: false, code: "CONFLICT", message: "The rest is already paid." };
  await afterStoreBalancePaid(order.id, "offline");
  return { ok: true, message: "Marked as paid in full." };
}

/**
 * "Stock is ready" for the seller's product: each order of it whose shopper still owes the balance is asked for it
 * once (balanceRequestedAt; due STORE_BALANCE_DAYS later) by email with the pay-the-rest link, and by SMS when the
 * seller sends order texts. These orders stay "paid" (not processing) until the balance is in.
 */
export async function askForStoreBalances(orderIds: string[]): Promise<number> {
  if (!orderIds.length) return 0;
  const now = new Date();
  const dueAt = storeBalanceDueAt(now);
  let asked = 0;
  for (const orderId of orderIds) {
    const claimed = await db.retailOrder.updateMany({ where: { id: orderId, status: "paid", balancePaidAt: null, balanceKobo: { gt: 0 }, balanceRequestedAt: null }, data: { balanceRequestedAt: now, balanceDueAt: dueAt } });
    if (claimed.count !== 1) continue;
    asked += 1;
    const order = await loadOrder(orderId);
    if (!order) continue;
    const view = storeOrderMoney(factsOf(order));
    const paid = money(view.paidKobo, order.currency);
    const balance = money(view.dueKobo, order.currency);
    await Promise.allSettled([
      order.buyerEmail
        ? sendPreorderPaymentEmail({ store: order.store, to: order.buyerEmail, buyerName: order.buyerName, orderNumber: order.orderNumber, kind: "balance_due", paid, balance, dueBy: dayText(dueAt), orderUrl: buildStorefrontUrl(order.store, `/order/${order.id}`) })
        : null,
      notifyOrderCustomerPreorderPayment(order.id, "balance_due", { paid, balance }),
    ]);
  }
  return asked;
}

/**
 * The balance wasn't paid in time (STORE_BALANCE_DAYS after "Stock is ready"): the seller cancels the order. The stock
 * or preorder place goes back (the usual cancel), and the deposit is recorded as owed back to the shopper (the
 * order's refund: by hand for a split card payment, as for any cancelled card order) and the shopper is emailed.
 */
export async function cancelStoreOrderForUnpaidBalance(store: { id: string; name: string }, orderId: string, now = new Date()): Promise<SellerBalanceResult> {
  const order = await db.retailOrder.findFirst({ where: { id: orderId, storeId: store.id } });
  if (!order) return { ok: false, code: "NOT_FOUND", message: "Order not found" };
  if (!storeBalanceDue(order)) return { ok: false, code: "CONFLICT", message: "This order has no balance waiting." };
  if (!storeBalanceOverdue(order, now)) return { ok: false, code: "CONFLICT", message: order.balanceDueAt ? "The customer still has time to pay the rest." : "Say the stock is ready first: the customer then has 7 days to pay the rest." };
  const { updateOrderStatus } = await import("@/lib/orders/update-status");
  const result = await updateOrderStatus(store, order, { status: "cancelled", notes: order.notes ?? undefined });
  if (!result.ok) return { ok: false, code: "CONFLICT", message: result.error };
  const depositKobo = storeOrderMoney(factsOf({ ...order, status: "paid" })).paidKobo;
  const { refundCancelledOrder } = await import("@/lib/commerce/refunds.server");
  const refund = await refundCancelledOrder(order.id, "Cancelled because the rest of the pre-order wasn't paid in time.", { amountNaira: depositKobo / 100, emailBuyer: false });
  const full = await loadOrder(order.id);
  if (full?.buyerEmail) {
    await sendPreorderPaymentEmail({ store: full.store, to: full.buyerEmail, buyerName: full.buyerName, orderNumber: full.orderNumber, kind: "deposit_back", paid: money(depositKobo, full.currency), balance: money(full.balanceKobo, full.currency), orderUrl: buildStorefrontUrl(full.store, `/order/${full.id}`) }).catch(() => null);
  }
  const amount = money(depositKobo, order.currency);
  return {
    ok: true,
    message: refund === "processed" || refund === "started" ? `Cancelled. The ${amount} deposit is on its way back to the customer.` : `Cancelled. Send the ${amount} deposit back to the customer: it's noted on the order.`,
  };
}
