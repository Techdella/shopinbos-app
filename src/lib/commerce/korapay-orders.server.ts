import "server-only";
import { db } from "@/lib/db/client";
import { appBase } from "@/lib/email/compliance.server";
import { initializeKorapayCharge, queryKorapayCharge } from "@/lib/korapay";
import { PAYABLE_ORDER_STATUSES, retailChargeProblem } from "@/lib/commerce/paystack-charge";
import { recoverExpiredOrderPayment } from "@/lib/commerce/order-expiry.server";
import { PAID_RETAIL_STATUSES } from "@/lib/supplier-orders/pure";
import { afterRetailOrderPaid } from "@/lib/commerce/order-paid.server";
import { korapaySplitParams, type PaymentSplitPlan } from "@/lib/wallet/rules";

// Storefront orders paid through Korapay (paymentMethod "korapay"), split with Korapay Split Payments so every
// naira goes to the businesses' own banks (src/lib/wallet). The order id is Korapay's reference, so the charge
// query, the webhook and the order page all name the order. Nothing the shopper's browser or a webhook body says
// marks an order paid: only Korapay's own charge reply does, checked against the order's total and currency.

/** Starts the Korapay checkout for a just-placed order with its split. Returns Korapay's payment page. Throws if refused. */
export async function startKorapayCheckout(
  order: { id: string; orderNumber: string; total: number; currency: string; buyerName: string; buyerEmail: string },
  store: { name: string },
  orderUrl: string,
  plan: PaymentSplitPlan,
) {
  return initializeKorapayCharge({
    reference: order.id,
    amountNaira: plan.totalKobo / 100,
    currency: order.currency,
    redirectUrl: `${orderUrl}?gateway=korapay`,
    notificationUrl: `${appBase()}/api/webhooks/korapay`,
    narration: `Order ${order.orderNumber} from ${store.name}`,
    customer: { name: order.buyerName, email: order.buyerEmail },
    orderNumber: order.orderNumber,
    split: korapaySplitParams(plan),
  });
}

export type KorapayConfirmOutcome = "paid" | "already_paid" | "waiting" | "failed" | "rejected" | "needs_refund" | "not_found";

/**
 * Asks Korapay about this order's payment and, when it succeeded for the full amount, marks the order paid (once)
 * and runs the paid follow-ups. Safe to call from the webhook, the checkout page, the order page and replays.
 * Throws only when Korapay or the database can't be reached, so the webhook can answer 500 and be retried.
 */
export async function confirmKorapayOrderPayment(orderId: string): Promise<KorapayConfirmOutcome> {
  const order = await db.retailOrder.findUnique({
    where: { id: orderId },
    select: { id: true, total: true, currency: true, status: true, expiredAt: true, paymentMethod: true },
  });
  if (!order) return "not_found";
  // A Korapay payment never settles an order placed for another way to pay.
  if (order.paymentMethod !== "korapay") return "rejected";
  if ((PAID_RETAIL_STATUSES as readonly string[]).includes(order.status)) {
    // A replay: the idempotent follow-ups (supplier orders, payment link, statement) run again in case one failed.
    await afterRetailOrderPaid(order.id, false, "korapay");
    return "already_paid";
  }
  const expired = order.status === "cancelled" && Boolean(order.expiredAt);
  if (!expired && !(PAYABLE_ORDER_STATUSES as readonly string[]).includes(order.status)) return "rejected";

  const charge = await queryKorapayCharge(order.id);
  if (!charge || charge.state === "waiting") return "waiting";
  if (charge.state === "failed") return "failed";

  // The same checks as a Paystack charge: our reference (Korapay also carries its own), the full total, the currency.
  const reference = charge.references.includes(order.id) ? order.id : (charge.references[0] ?? null);
  const problem = retailChargeProblem({ ...order, status: expired ? "pending" : order.status }, { reference, amount: charge.paidKobo ?? undefined, currency: charge.currency ?? undefined, status: "success" });
  if (problem) {
    console.warn(`[korapay] order ${order.id} not marked paid: ${problem}`);
    return "rejected";
  }

  if (expired) {
    // Paid after it expired: take the stock again if it's still there, else flag it for the seller to refund.
    const late = await recoverExpiredOrderPayment(order.id, { paymentMethod: "korapay" });
    if (late === "reinstated") {
      await afterRetailOrderPaid(order.id, true, "korapay");
      return "paid";
    }
    return late === "needs_refund" ? "needs_refund" : "rejected";
  }

  // paystackStatus records "the online payment succeeded" for every gateway (refunds and expiry read it).
  const moved = await db.retailOrder.updateMany({
    where: { id: order.id, status: { in: [...PAYABLE_ORDER_STATUSES] } },
    data: { status: "paid", paystackStatus: "success" },
  });
  if (moved.count !== 1) return "already_paid"; // the webhook and the shopper's page raced: the other follows up
  await afterRetailOrderPaid(order.id, true, "korapay");
  return "paid";
}

/**
 * The order page, or the checkout page while Korapay's frame is open: if this Korapay order is still waiting for its
 * money, ask Korapay now rather than wait for the webhook. Never throws.
 */
export async function refreshKorapayOrderPayment(orderId: string): Promise<KorapayConfirmOutcome | null> {
  try {
    const order = await db.retailOrder.findUnique({ where: { id: orderId }, select: { paymentMethod: true, status: true, expiredAt: true } });
    if (order?.paymentMethod !== "korapay") return null;
    if ((PAID_RETAIL_STATUSES as readonly string[]).includes(order.status)) return "already_paid";
    const waiting = (PAYABLE_ORDER_STATUSES as readonly string[]).includes(order.status) || (order.status === "cancelled" && Boolean(order.expiredAt));
    return waiting ? await confirmKorapayOrderPayment(orderId) : null;
  } catch (error) {
    console.error(`[korapay] could not check order ${orderId}`, error);
    return null;
  }
}
