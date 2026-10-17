import "server-only";
import { db } from "@/lib/db/client";
import { buildStorefrontUrl } from "@/lib/domains/storefront";
import { appBase } from "@/lib/email/compliance.server";
import { initializeKorapayCharge, queryKorapayCharge } from "@/lib/korapay";
import { PAYABLE_ORDER_STATUSES, retailChargeProblem } from "@/lib/commerce/paystack-charge";
import { recoverExpiredOrderPayment, restoreDiscountUse } from "@/lib/commerce/order-expiry.server";
import { releaseStock } from "@/lib/commerce/stock.server";
import { orderStockHolds, UNPAID_STATUSES } from "@/lib/commerce/stock-holds";
import { PAID_RETAIL_STATUSES } from "@/lib/supplier-orders/pure";
import { afterRetailOrderPaid } from "@/lib/commerce/order-paid.server";
import { HOSTED_CHECKOUT_NAMES, isHostedCheckoutMethod, type HostedCheckoutMethod } from "@shared/checkout-payments";

// Storefront orders paid through Korapay (paymentMethod "korapay"). The order id is the gateway's reference, so the status query, the webhook and the return
// page all name the order. Nothing the shopper's browser or a webhook body says marks an order paid: only the
// gateway's own status reply does, checked against the order's total and currency.

export interface HostedCheckoutOrder {
  id: string;
  orderNumber: string;
  total: number;
  currency: string;
  buyerName: string;
  buyerEmail: string;
  buyerPhone: string | null;
}

/**
 * Opens the gateway's hosted payment page for a just-placed order and returns its URL. Both send the shopper back
 * to the order page (?gateway=…). Throws when the gateway refuses or can't be reached.
 */
export async function startHostedCheckout(gateway: HostedCheckoutMethod, order: HostedCheckoutOrder, store: { name: string; slug: string; customDomain: string | null }, clientIp?: string) {
  const orderUrl = `${buildStorefrontUrl(store, `/order/${order.id}`)}?gateway=${gateway}`;
  const label = `Order ${order.orderNumber}`;
  const { checkoutUrl } = await initializeKorapayCharge({
      reference: order.id,
      amount: order.total,
      currency: order.currency,
      redirectUrl: orderUrl,
      notificationUrl: `${appBase()}/api/webhooks/korapay`,
      narration: `${label} from ${store.name}`,
      customer: { name: order.buyerName, email: order.buyerEmail },
      orderNumber: order.orderNumber,
    });
  return checkoutUrl;
}

/**
 * The gateway couldn't open its page for this order, so the shopper can never pay it: give back its stock and
 * discount use now (as if it expired) instead of holding them for the payment window. Never throws.
 */
export async function releaseUnstartedHostedOrder(orderId: string, gateway: HostedCheckoutMethod) {
  try {
    const order = await db.retailOrder.findUnique({
      where: { id: orderId },
      select: { id: true, storeId: true, status: true, discountCode: true, discountReleasedAt: true, stockHold: true, items: true, channel: true, logisticsDetails: true, paystackStatus: true },
    });
    if (!order) return;
    const now = new Date();
    await db.$transaction(async (tx) => {
      const moved = await tx.retailOrder.updateMany({
        where: { id: order.id, paymentMethod: gateway, status: { in: [...UNPAID_STATUSES] }, stockReleasedAt: null },
        data: { status: "cancelled", expiredAt: now, stockReleasedAt: now, paymentIssue: `${HOSTED_CHECKOUT_NAMES[gateway]} could not open the payment page, so the order was cancelled before payment.` },
      });
      if (moved.count !== 1) return;
      await releaseStock(tx, orderStockHolds(order));
      await restoreDiscountUse(tx, order, order.status, now);
    });
  } catch (error) {
    console.error(`[${gateway}] could not release unpaid order ${orderId}`, error);
  }
}

/** What the gateway says about an order's payment: amounts in kobo. Null when it has no such payment. */
interface GatewayPayment {
  state: "success" | "failed" | "waiting";
  reference: string | null;
  paidKobo: number | null;
  currency: string | null;
}

async function lookupPayment(gateway: HostedCheckoutMethod, orderId: string): Promise<GatewayPayment | null> {
  const charge = await queryKorapayCharge(orderId);
  if (!charge) return null;
  // Asked by our reference; it must come back as one of the charge's references (Korapay also has its own).
  const reference = charge.references.includes(orderId) ? orderId : (charge.references[0] ?? null);
  return { state: charge.state, reference, paidKobo: charge.paidKobo, currency: charge.currency };
}

export type HostedConfirmOutcome = "paid" | "already_paid" | "waiting" | "failed" | "rejected" | "needs_refund" | "not_found";

/**
 * Asks the gateway about this order's payment and, when it succeeded for the full amount, marks the order paid
 * (once) and runs the paid follow-ups. Safe to call from webhooks, the return page and replays. Throws only when
 * the gateway or the database can't be reached, so a webhook can answer 500 and be retried.
 */
export async function confirmHostedOrderPayment(orderId: string, gateway: HostedCheckoutMethod): Promise<HostedConfirmOutcome> {
  const order = await db.retailOrder.findUnique({
    where: { id: orderId },
    select: { id: true, total: true, currency: true, status: true, expiredAt: true, paymentMethod: true },
  });
  if (!order) return "not_found";
  // A payment through one gateway never settles an order placed for another.
  if (order.paymentMethod !== gateway) return "rejected";
  if ((PAID_RETAIL_STATUSES as readonly string[]).includes(order.status)) {
    // A replay: the idempotent follow-ups (supplier orders, payment link) run again in case one failed half way.
    await afterRetailOrderPaid(order.id, false, gateway);
    return "already_paid";
  }
  const expired = order.status === "cancelled" && Boolean(order.expiredAt);
  if (!expired && !(PAYABLE_ORDER_STATUSES as readonly string[]).includes(order.status)) return "rejected";

  const payment = await lookupPayment(gateway, order.id);
  if (!payment || payment.state === "waiting") return "waiting";
  if (payment.state === "failed") return "failed";

  // The same checks as a Paystack charge: our reference, the full total (kobo) and the order's currency.
  const charge = { reference: payment.reference ?? order.id, amount: payment.paidKobo ?? undefined, currency: payment.currency ?? undefined, status: "success" };
  const problem = retailChargeProblem({ ...order, status: expired ? "pending" : order.status }, charge);
  if (problem) {
    console.warn(`[${gateway}] order ${order.id} not marked paid: ${problem}`);
    return "rejected";
  }

  if (expired) {
    // Paid after it expired: take the stock again if it's still there, else flag it and refund through the gateway.
    const late = await recoverExpiredOrderPayment(order.id, { paymentMethod: gateway });
    if (late === "reinstated") {
      await afterRetailOrderPaid(order.id, true, gateway);
      return "paid";
    }
    return late === "needs_refund" ? "needs_refund" : "rejected";
  }

  // paystackStatus records "the online payment succeeded" for every gateway (refunds and expiry read it).
  const moved = await db.retailOrder.updateMany({
    where: { id: order.id, status: { in: [...PAYABLE_ORDER_STATUSES] } },
    data: { status: "paid", paystackStatus: "success" },
  });
  if (moved.count !== 1) return "already_paid"; // the webhook and the return page raced: the other one follows up
  await afterRetailOrderPaid(order.id, true, gateway);
  return "paid";
}

/**
 * The order page (where Korapay sends the shopper back): if this is a hosted-checkout order still waiting
 * for its money, ask its gateway now rather than wait for the webhook. Never throws; the page shows whatever the
 * order says afterwards.
 */
export async function refreshHostedOrderPayment(orderId: string) {
  try {
    const order = await db.retailOrder.findUnique({ where: { id: orderId }, select: { paymentMethod: true, status: true, expiredAt: true } });
    if (!order || !isHostedCheckoutMethod(order.paymentMethod)) return;
    const waiting = (PAYABLE_ORDER_STATUSES as readonly string[]).includes(order.status) || (order.status === "cancelled" && Boolean(order.expiredAt));
    if (waiting) await confirmHostedOrderPayment(orderId, order.paymentMethod);
  } catch (error) {
    console.error(`[hosted checkout] could not check order ${orderId} on its page`, error);
  }
}
