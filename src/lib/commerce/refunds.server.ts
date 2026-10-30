import "server-only";
import { db } from "@/lib/db/client";
import { voidResellSales } from "@/lib/resell/service.server";
import { createNotification } from "@/lib/notifications/create";
import { formatFromAddress, sendEmail } from "@/lib/notifications/resend";
import { appBase, loadStoreSender } from "@/lib/email/compliance.server";
import { faultRefundEmail, refundEmail } from "@/lib/email/store-emails";
import { paystackSecretReady } from "@shared/checkout-payments";
import { canStartRefund, faultRefundBody, faultRefundPlan, paystackRefundBody, readPaystackRefund, refundIdempotencyKey, refundRoute, refundStatusFromEvent, refundStillOpen } from "./refunds";

// Refunds a payment that arrived after its order expired and the stock had sold (see refunds.ts for the rules).
// Card payments go back through Paystack's Refund API with the platform key (the same PAYSTACK_SECRET_KEY that
// initialises and verifies store checkouts: there are no per-store keys). Anything else (a transfer the seller
// collected, another gateway) is flagged for the seller to refund by hand. Never throws.

export type RefundOutcome = "started" | "processed" | "manual" | "failed" | "skipped";

const PAYSTACK_DEFAULT_BASE = "https://api.paystack.co";

/** PAYSTACK_BASE_URL lets local tests point refunds at a stub; production leaves it unset. */
function paystackBase() {
  const base = process.env.PAYSTACK_BASE_URL?.trim();
  return (base && /^https?:\/\//.test(base) ? base : PAYSTACK_DEFAULT_BASE).replace(/\/+$/, "");
}

function money(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-NG", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
  } catch {
    return `${currency} ${Math.round(amount).toLocaleString("en-NG")}`;
  }
}

type RefundOrder = NonNullable<Awaited<ReturnType<typeof loadOrder>>>;

function loadOrder(orderId: string) {
  return db.retailOrder.findUnique({
    where: { id: orderId },
    select: {
      id: true, orderNumber: true, storeId: true, status: true, total: true, currency: true, buyerEmail: true, buyerName: true,
      paymentMethod: true, paystackRef: true, paystackStatus: true, paymentIssue: true, refundStatus: true, refundId: true, paymentSplit: true,
      store: { select: { userId: true, name: true } },
    },
  });
}

async function emailBuyerOf(order: RefundOrder, kind: "automatic" | "by_store") {
  if (!order.buyerEmail) return;
  const sender = await loadStoreSender(order.storeId).catch(() => null);
  if (!sender) return;
  const email = refundEmail({ appUrl: appBase(), store: sender, buyerName: order.buyerName, orderNumber: order.orderNumber, amount: money(Number(order.total), order.currency), kind });
  await sendEmail({
    to: [order.buyerEmail],
    from: formatFromAddress(order.store.name),
    subject: email.subject,
    html: email.html,
  }).catch((error) => console.error(`[refunds] buyer email for ${order.orderNumber} failed`, error));
}

async function notifySeller(order: RefundOrder, title: string, description: string, priority: "critical" | "info" | "success") {
  await createNotification({
    userId: order.store.userId,
    type: "order",
    priority,
    title,
    description,
    link: `/home/orders/${order.id}`,
    sendEmail: priority === "critical",
    event: "refund.update",
  }).catch(() => null);
}

async function markFailed(order: RefundOrder, reason: string) {
  const issue = `${order.paymentIssue ?? "Paid after the order expired and the stock had sold."} Automatic refund failed (${reason}). Refund the buyer by hand.`.slice(0, 500);
  await db.retailOrder.updateMany({ where: { id: order.id, refundStatus: { in: ["pending", "processing"] } }, data: { refundStatus: "failed", paymentIssue: issue } });
  console.warn(`[refunds] refund for order ${order.orderNumber} failed: ${reason}`);
  await notifySeller(order, `Refund failed: order ${order.orderNumber}`, `The payment came in after this order expired and its stock sold. We tried to refund ${money(Number(order.total), order.currency)} through Paystack and it failed (${reason}). Refund the buyer from your Paystack dashboard or by transfer.`, "critical");
}

async function callPaystackRefund(secret: string, body: ReturnType<typeof paystackRefundBody> | ReturnType<typeof faultRefundBody>): Promise<ReturnType<typeof readPaystackRefund>> {
  try {
    const response = await fetch(`${paystackBase()}/refund`, {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    return readPaystackRefund(response.ok, await response.json().catch(() => null));
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Paystack could not be reached" };
  }
}

/**
 * Refunds the late payment on an expired order whose stock is gone, once. Call it after the order was flagged
 * (paymentIssue set). The first caller claims the refund (refundStatus null → "pending"); everyone else gets
 * "skipped", so replayed webhooks never refund twice.
 */
export async function refundLatePayment(orderId: string): Promise<RefundOutcome> {
  try {
    const order = await loadOrder(orderId);
    if (!order || !canStartRefund(order)) return "skipped";

    if (refundRoute(order) === "manual") {
      const claimed = await db.retailOrder.updateMany({ where: { id: order.id, refundStatus: null }, data: { refundStatus: "manual" } });
      if (claimed.count !== 1) return "skipped";
      // The payment went to the seller's own bank: they send it back from there, guided (shared/order-refunds.ts).
      const { openRefund } = await import("@/lib/commerce/order-refunds.server");
      await openRefund({ sourceKey: `late-payment:${order.id}`, orderId: order.id, reason: "late_payment", fault: "none", amountKobo: Math.round(Number(order.total) * 100), note: "The payment came in after the order expired and its stock sold." });
      await emailBuyerOf(order, "by_store");
      return "manual";
    }

    const claimed = await db.retailOrder.updateMany({ where: { id: order.id, refundStatus: null }, data: { refundStatus: "pending" } });
    if (claimed.count !== 1) return "skipped";

    const secret = process.env.PAYSTACK_SECRET_KEY;
    if (!paystackSecretReady(secret)) {
      await markFailed(order, "Paystack isn't set up on the server");
      await emailBuyerOf(order, "by_store");
      return "failed";
    }

    const body = paystackRefundBody(order, order.orderNumber);
    const result = await callPaystackRefund(secret!, body);

    if (!result.ok) {
      await markFailed(order, result.message);
      await emailBuyerOf(order, "by_store");
      return "failed";
    }

    const processed = result.status === "processed";
    await db.retailOrder.updateMany({
      where: { id: order.id, refundStatus: "pending" },
      data: {
        refundStatus: result.status,
        refundId: result.id,
        paymentIssue: null,
        ...(processed ? { refundedAt: new Date(), status: "refunded" } : {}),
      },
    });
    console.info(`[refunds] ${refundIdempotencyKey(order.id, body.transaction)}: Paystack refund ${result.id ?? "(already reversed)"} ${result.status}`);
    await notifySeller(order, `Refunded: order ${order.orderNumber}`, `The payment came in after this order expired and its stock sold, so ${money(Number(order.total), order.currency)} went back to the buyer through Paystack automatically.`, "info");
    await emailBuyerOf(order, "automatic");
    return processed ? "processed" : "started";
  } catch (error) {
    console.error(`[refunds] could not refund order ${orderId}`, error);
    return "failed";
  }
}

/**
 * Paystack refund.* webhook events for refunds we started: processed marks the order refunded; failed puts the
 * payment issue back and tells the seller to refund by hand. Only moves a refund that is still open.
 */
export async function applyRefundEvent(event: string, data: Record<string, unknown>) {
  const status = refundStatusFromEvent(event);
  if (!status) return false;
  const refundId = data.id === undefined || data.id === null ? null : String(data.id);
  const transaction = data.transaction && typeof data.transaction === "object" ? (data.transaction as Record<string, unknown>) : {};
  const reference = typeof data.transaction_reference === "string" ? data.transaction_reference : typeof transaction.reference === "string" ? transaction.reference : null;
  const or = [...(refundId ? [{ refundId }] : []), ...(reference ? [{ paystackRef: reference }] : [])];
  if (!or.length) return false;
  const found = await db.retailOrder.findFirst({ where: { OR: or, refundStatus: { not: null } }, select: { id: true, refundStatus: true } });
  if (!found || !refundStillOpen(found.refundStatus)) return false;
  if (status === "failed") {
    const order = await loadOrder(found.id);
    if (order) await markFailed(order, typeof data.status === "string" ? `Paystack: ${data.status}` : "Paystack reported it failed");
    return true;
  }
  const moved = await db.retailOrder.updateMany({
    where: { id: found.id, refundStatus: { in: ["pending", "processing"] } },
    data: { refundStatus: status, ...(refundId ? { refundId } : {}), ...(status === "processed" ? { refundedAt: new Date(), status: "refunded" } : {}) },
  });
  return moved.count === 1;
}

/**
 * The seller cancelled a paid order and chose to refund the customer (for example, its supplier didn't accept it
 * in time). Same claim and Paystack call as a late payment: card payments go back through Paystack, anything else
 * is flagged for the seller to refund by hand. Unpaid orders (pay when it arrives) have nothing to refund.
 */
export async function refundCancelledOrder(orderId: string, why: string, options: { amountNaira?: number; emailBuyer?: boolean } = {}): Promise<RefundOutcome> {
  // A cancelled order earns no reseller commission (unless the shop already paid it). Never throws.
  await voidResellSales(orderId);
  try {
    const order = await loadOrder(orderId);
    if (!order || !canStartRefund(order)) return "skipped";
    const paid = order.paystackStatus === "success" || (order.paymentMethod !== null && order.paymentMethod !== "paystack" && order.paymentMethod !== "pay_on_delivery");
    // `amountNaira`: only part was paid (a preorder deposit); the caller then sends its own email to the buyer.
    const paidNaira = options.amountNaira ?? Number(order.total);
    if (!paid || paidNaira <= 0) return "skipped";
    const amount = money(paidNaira, order.currency);
    const emailBuyer = options.emailBuyer === false ? async () => undefined : (row: RefundOrder, kind: "automatic" | "by_store") => emailBuyerOf(row, kind);

    if (refundRoute(order) === "manual") {
      const claimed = await db.retailOrder.updateMany({ where: { id: order.id, refundStatus: null }, data: { refundStatus: "manual", paymentIssue: `${why} Refund the customer ${amount} by hand.`.slice(0, 500) } });
      if (claimed.count !== 1) return "skipped";
      // The money went to the businesses' own banks: the seller sends it back from theirs, guided step by step
      // (the customer's account on their order page, "Refund sent", the customer confirms). shared/order-refunds.ts.
      const { onPaidOrderCancelled } = await import("@/lib/commerce/order-refunds.server");
      await onPaidOrderCancelled(order.id, why, Math.round(paidNaira * 100));
      await emailBuyer(order, "by_store");
      return "manual";
    }

    const claimed = await db.retailOrder.updateMany({ where: { id: order.id, refundStatus: null }, data: { refundStatus: "pending" } });
    if (claimed.count !== 1) return "skipped";
    const secret = process.env.PAYSTACK_SECRET_KEY;
    if (!paystackSecretReady(secret)) {
      await db.retailOrder.updateMany({ where: { id: order.id, refundStatus: "pending" }, data: { refundStatus: "failed", paymentIssue: `${why} Automatic refund failed (Paystack isn't set up). Refund the customer by hand.`.slice(0, 500) } });
      await notifySeller(order, `Refund failed: order ${order.orderNumber}`, `We couldn't send ${amount} back automatically. Refund the customer from your Paystack dashboard or by transfer.`, "critical");
      await emailBuyer(order, "by_store");
      return "failed";
    }
    const result = await callPaystackRefund(secret!, paystackRefundBody(order, order.orderNumber));
    if (!result.ok) {
      await db.retailOrder.updateMany({ where: { id: order.id, refundStatus: "pending" }, data: { refundStatus: "failed", paymentIssue: `${why} Automatic refund failed (${result.message}). Refund the customer by hand.`.slice(0, 500) } });
      await notifySeller(order, `Refund failed: order ${order.orderNumber}`, `We tried to send ${amount} back through Paystack and it failed (${result.message}). Refund the customer from your Paystack dashboard or by transfer.`, "critical");
      await emailBuyer(order, "by_store");
      return "failed";
    }
    const processed = result.status === "processed";
    await db.retailOrder.updateMany({
      where: { id: order.id, refundStatus: "pending" },
      data: { refundStatus: result.status, refundId: result.id, ...(processed ? { refundedAt: new Date(), status: "refunded" } : {}) },
    });
    await notifySeller(order, `Refund started: order ${order.orderNumber}`, `${amount} is going back to your customer through Paystack.`, "info");
    await emailBuyer(order, "automatic");
    return processed ? "processed" : "started";
  } catch (error) {
    console.error(`[refunds] could not refund cancelled order ${orderId}`, error);
    return "failed";
  }
}

/**
 * A refund decided by "who pays when things go wrong" (src/lib/faults/resolve.server.ts), once per case: the part the
 * refund route sends through Paystack (a card payment not split at checkout, or Shopinbos's own take on a split one)
 * goes back with a partial Paystack refund; the rest the seller sends (their bank has it), and they're told exactly
 * how much, and guided through sending it (shared/order-refunds.ts: the customer's account, "Refund sent", the
 * customer confirms). The order's own refund columns record the first one. Never throws.
 */
export async function refundFault(input: { orderId: string; caseKey: string; event?: string; refundKobo: number; fromShopinbosKobo: number; why: string; customerLine: string }): Promise<{ status: "processed" | "processing" | "manual" | "failed" | "skipped"; paystackKobo: number; sellerKobo: number }> {
  const none = { status: "skipped" as const, paystackKobo: 0, sellerKobo: 0 };
  try {
    const order = await loadOrder(input.orderId);
    if (!order || input.refundKobo <= 0) return none;
    const plan = faultRefundPlan(order, input.refundKobo, input.fromShopinbosKobo);
    // The whole order refunded: no reseller commission on it (src/lib/resell). Never throws.
    if (input.refundKobo >= Math.round(Number(order.total) * 100)) await voidResellSales(order.id);
    const naira = (kobo: number) => money(kobo / 100, order.currency);
    let status: "processed" | "processing" | "manual" | "failed" = plan.sellerKobo > 0 ? "manual" : "processing";
    let paystackFailed: string | null = null;
    if (plan.paystackKobo > 0) {
      const secret = process.env.PAYSTACK_SECRET_KEY;
      if (!paystackSecretReady(secret) || !order.paystackRef) paystackFailed = "Paystack isn't set up";
      else {
        const result = await callPaystackRefund(secret!, faultRefundBody({ transaction: order.paystackRef, caseKey: input.caseKey, amountKobo: plan.paystackKobo, orderNumber: order.orderNumber }));
        if (!result.ok) paystackFailed = result.message;
        else if (plan.sellerKobo === 0) status = result.status === "processed" ? "processed" : "processing";
        if (result.ok && order.refundStatus === null) {
          await db.retailOrder.updateMany({ where: { id: order.id, refundStatus: null }, data: { refundStatus: plan.sellerKobo > 0 ? "manual" : result.status, refundId: result.id, ...(result.status === "processed" && plan.sellerKobo === 0 ? { refundedAt: new Date() } : {}) } });
        }
      }
    }
    // Paystack couldn't send its part: the seller sends that too (the team sees it on the case).
    const sellerKobo = plan.sellerKobo + (paystackFailed ? plan.paystackKobo : 0);
    const paystackKobo = paystackFailed ? 0 : plan.paystackKobo;
    if (paystackFailed && sellerKobo > 0) status = plan.sellerKobo > 0 ? "manual" : "failed";
    if (sellerKobo > 0) {
      await db.retailOrder.updateMany({ where: { id: order.id, refundStatus: null }, data: { refundStatus: "manual" } });
      await db.retailOrder.update({ where: { id: order.id }, data: { paymentIssue: `${input.why} Send the customer ${naira(sellerKobo)}.`.slice(0, 500) } }).catch(() => null);
      // The customer gives their account on their order page; the seller sends it and taps "Refund sent" (this tells
      // the seller too, once per case).
      const { openRefund } = await import("@/lib/commerce/order-refunds.server");
      const { refundFaultFor, refundReasonForFault } = await import("@shared/order-refunds");
      await openRefund({
        sourceKey: `fault:${input.caseKey}`,
        orderId: order.id,
        reason: refundReasonForFault(input.event),
        fault: refundFaultFor(input.event),
        amountKobo: sellerKobo,
        note: `${input.why}${paystackKobo > 0 ? ` Shopinbos is refunding its own ${naira(paystackKobo)} through Paystack.` : ""}`,
      });
    } else {
      await notifySeller(order, `Refund started: order ${order.orderNumber}`, `${input.why} ${naira(paystackKobo)} is going back to your customer through Paystack.`, "info");
    }
    if (order.buyerEmail) {
      const sender = await loadStoreSender(order.storeId).catch(() => null);
      if (sender) {
        const email = faultRefundEmail({ appUrl: appBase(), store: sender, buyerName: order.buyerName, orderNumber: order.orderNumber, what: input.customerLine, paystack: paystackKobo > 0 ? naira(paystackKobo) : null, byStore: sellerKobo > 0 ? naira(sellerKobo) : null });
        await sendEmail({ to: [order.buyerEmail], from: formatFromAddress(order.store.name), subject: email.subject, html: email.html }).catch((error) => console.error(`[refunds] fault refund email for ${order.orderNumber} failed`, error));
      }
    }
    return { status, paystackKobo, sellerKobo };
  } catch (error) {
    console.error(`[refunds] could not refund case ${input.caseKey}`, error);
    return { status: "failed", paystackKobo: 0, sellerKobo: 0 };
  }
}
