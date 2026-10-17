import "server-only";
import { db } from "@/lib/db/client";
import { buildStorefrontUrl } from "@/lib/domains/storefront";
import { appBase } from "@/lib/email/compliance.server";
import { createOpayCashier, queryOpayPayment } from "@/lib/opay";
import { PAYABLE_ORDER_STATUSES, retailChargeProblem } from "@/lib/commerce/paystack-charge";
import { recoverExpiredOrderPayment, restoreDiscountUse } from "@/lib/commerce/order-expiry.server";
import { releaseStock } from "@/lib/commerce/stock.server";
import { orderStockHolds, UNPAID_STATUSES } from "@/lib/commerce/stock-holds";
import { PAID_RETAIL_STATUSES } from "@/lib/supplier-orders/pure";
import { afterRetailOrderPaid } from "@/lib/commerce/order-paid.server";

// Storefront orders paid with OPay Checkout (paymentMethod "opay"). The order id is OPay's reference, so the status
// query, the callback and the return page all name the order. Nothing the shopper's browser or a callback body
// says marks an order paid: only OPay's signed status reply does, checked against the order's total and currency.

/** Minutes OPay's cashier stays open; the order's own window (CARD_METHODS, 30 min) lets its stock go after that. */
const CASHIER_MINUTES = 30;

export interface OpayCheckoutOrder {
  id: string;
  orderNumber: string;
  total: number;
  currency: string;
  buyerName: string;
  buyerEmail: string;
  buyerPhone: string | null;
}

/** Opens OPay's hosted cashier for a just-placed order. Throws when OPay refuses or can't be reached. */
export async function startOpayCheckout(order: OpayCheckoutOrder, store: { name: string; slug: string; customDomain: string | null }, clientIp?: string) {
  const orderUrl = buildStorefrontUrl(store, `/order/${order.id}`);
  const itemsWord = `Order ${order.orderNumber}`;
  return createOpayCashier({
    reference: order.id,
    amountKobo: Math.round(order.total * 100),
    currency: order.currency,
    returnUrl: `${orderUrl}?gateway=opay`,
    cancelUrl: `${orderUrl}?gateway=opay`,
    callbackUrl: `${appBase()}/api/webhooks/opay`,
    displayName: store.name,
    productName: itemsWord,
    productDescription: `${itemsWord} from ${store.name}`,
    expireAt: CASHIER_MINUTES,
    user: { name: order.buyerName, email: order.buyerEmail || undefined, phone: order.buyerPhone ?? undefined },
    clientIp,
  });
}

/**
 * OPay couldn't open a cashier for this order, so the shopper can never pay it: give back its stock and discount
 * use now (as if it expired) instead of holding them for the payment window. Never throws.
 */
export async function releaseUnstartedOpayOrder(orderId: string) {
  try {
    const order = await db.retailOrder.findUnique({
      where: { id: orderId },
      select: { id: true, storeId: true, status: true, discountCode: true, discountReleasedAt: true, stockHold: true, items: true, channel: true, logisticsDetails: true, paystackStatus: true },
    });
    if (!order) return;
    const now = new Date();
    await db.$transaction(async (tx) => {
      const moved = await tx.retailOrder.updateMany({
        where: { id: order.id, paymentMethod: "opay", status: { in: [...UNPAID_STATUSES] }, stockReleasedAt: null },
        data: { status: "cancelled", expiredAt: now, stockReleasedAt: now, paymentIssue: "OPay could not open the payment page, so the order was cancelled before payment." },
      });
      if (moved.count !== 1) return;
      await releaseStock(tx, orderStockHolds(order));
      await restoreDiscountUse(tx, order, order.status, now);
    });
  } catch (error) {
    console.error(`[opay] could not release unpaid order ${orderId}`, error);
  }
}

export type OpayConfirmOutcome = "paid" | "already_paid" | "waiting" | "failed" | "rejected" | "needs_refund" | "not_found";

/**
 * Asks OPay about this order's payment and, when it succeeded for the full amount, marks the order paid (once) and
 * runs the paid follow-ups. Safe to call from the callback, the return page and replays. Throws only when OPay or
 * the database can't be reached, so a webhook can answer 500 and be retried.
 */
export async function confirmOpayOrderPayment(orderId: string): Promise<OpayConfirmOutcome> {
  const order = await db.retailOrder.findUnique({
    where: { id: orderId },
    select: { id: true, total: true, currency: true, status: true, expiredAt: true, paymentMethod: true },
  });
  if (!order) return "not_found";
  if (order.paymentMethod !== "opay") return "rejected";
  if ((PAID_RETAIL_STATUSES as readonly string[]).includes(order.status)) {
    // A replay: the idempotent follow-ups (supplier orders, payment link) run again in case one failed half way.
    await afterRetailOrderPaid(order.id, false, "opay");
    return "already_paid";
  }
  const expired = order.status === "cancelled" && Boolean(order.expiredAt);
  if (!expired && !(PAYABLE_ORDER_STATUSES as readonly string[]).includes(order.status)) return "rejected";

  const payment = await queryOpayPayment(order.id);
  if (!payment) return "waiting";
  if (payment.status === "FAIL" || payment.status === "CLOSE") return "failed";
  if (payment.status !== "SUCCESS") return "waiting";

  // The same checks as a Paystack charge: our reference, the full total (kobo) and the order's currency.
  const charge = { reference: payment.reference ?? order.id, amount: payment.amount ?? undefined, currency: payment.currency ?? undefined, status: "success" };
  const problem = retailChargeProblem({ ...order, status: expired ? "pending" : order.status }, charge);
  if (problem) {
    console.warn(`[opay] order ${order.id} not marked paid: ${problem}`);
    return "rejected";
  }

  if (expired) {
    // Paid after it expired: take the stock again if it's still there, else flag it and refund through OPay.
    const late = await recoverExpiredOrderPayment(order.id, { paymentMethod: "opay" });
    if (late === "reinstated") {
      await afterRetailOrderPaid(order.id, true, "opay");
      return "paid";
    }
    return late === "needs_refund" ? "needs_refund" : "rejected";
  }

  // paystackStatus records "the online payment succeeded" for every gateway (refunds and expiry read it).
  const moved = await db.retailOrder.updateMany({
    where: { id: order.id, status: { in: [...PAYABLE_ORDER_STATUSES] } },
    data: { status: "paid", paystackStatus: "success" },
  });
  if (moved.count !== 1) return "already_paid"; // the callback and the return page raced: the other one follows up
  await afterRetailOrderPaid(order.id, true, "opay");
  return "paid";
}

/**
 * The order page (where OPay sends the shopper back): if this is an OPay order still waiting for its money, ask
 * OPay now rather than wait for the callback. Never throws; the page shows whatever the order says afterwards.
 */
export async function refreshOpayOrderPayment(orderId: string) {
  try {
    const order = await db.retailOrder.findUnique({ where: { id: orderId }, select: { paymentMethod: true, status: true, expiredAt: true } });
    if (order?.paymentMethod !== "opay") return;
    const waiting = (PAYABLE_ORDER_STATUSES as readonly string[]).includes(order.status) || (order.status === "cancelled" && Boolean(order.expiredAt));
    if (waiting) await confirmOpayOrderPayment(orderId);
  } catch (error) {
    console.error(`[opay] could not check order ${orderId} on its page`, error);
  }
}
