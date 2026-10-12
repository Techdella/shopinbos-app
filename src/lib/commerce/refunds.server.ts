import "server-only";
import { db } from "@/lib/db/client";
import { createNotification } from "@/lib/notifications/create";
import { formatFromAddress, sendEmail } from "@/lib/notifications/resend";
import { paystackSecretReady } from "@shared/checkout-payments";
import { canStartRefund, paystackRefundBody, readPaystackRefund, refundIdempotencyKey, refundRoute, refundStatusFromEvent, refundStillOpen } from "./refunds";

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

function escapeHtml(value: unknown) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
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
      paymentMethod: true, paystackRef: true, paystackStatus: true, paymentIssue: true, refundStatus: true, refundId: true,
      store: { select: { userId: true, name: true } },
    },
  });
}

async function emailBuyer(order: RefundOrder, kind: "automatic" | "by_store") {
  if (!order.buyerEmail) return;
  const amount = money(Number(order.total), order.currency);
  const firstName = order.buyerName.split(" ")[0] || "there";
  const body = kind === "automatic"
    ? `We've refunded your payment of <strong>${escapeHtml(amount)}</strong>. It usually reaches your card or bank within 5 to 10 working days, depending on your bank.`
    : `${escapeHtml(order.store.name)} will refund your payment of <strong>${escapeHtml(amount)}</strong> and will contact you about it.`;
  await sendEmail({
    to: [order.buyerEmail],
    from: formatFromAddress(order.store.name),
    subject: `Refund for order ${order.orderNumber}`,
    html: `
      <div style="font-family:sans-serif;max-width:540px;margin:0 auto;padding:24px">
        <h2 style="font-size:20px;margin:0 0 8px">Your order couldn't be filled</h2>
        <p>Hi ${escapeHtml(firstName)}, order <strong>${escapeHtml(order.orderNumber)}</strong> from <strong>${escapeHtml(order.store.name)}</strong> expired before your payment arrived, and the items sold out in the meantime.</p>
        <p>${body}</p>
        <p style="color:#6e6e68;font-size:13px">Sorry about this. Reply to this email if you have questions.</p>
      </div>
    `,
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
  }).catch(() => null);
}

async function markFailed(order: RefundOrder, reason: string) {
  const issue = `${order.paymentIssue ?? "Paid after the order expired and the stock had sold."} Automatic refund failed (${reason}). Refund the buyer by hand.`.slice(0, 500);
  await db.retailOrder.updateMany({ where: { id: order.id, refundStatus: { in: ["pending", "processing"] } }, data: { refundStatus: "failed", paymentIssue: issue } });
  console.warn(`[refunds] refund for order ${order.orderNumber} failed: ${reason}`);
  await notifySeller(order, `Refund failed: order ${order.orderNumber}`, `The payment came in after this order expired and its stock sold. We tried to refund ${money(Number(order.total), order.currency)} through Paystack and it failed (${reason}). Refund the buyer from your Paystack dashboard or by transfer.`, "critical");
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
      await notifySeller(order, `Refund needed: order ${order.orderNumber}`, "This order expired unpaid and its stock sold to someone else, then the payment came in outside Paystack. Refund the buyer or offer a replacement.", "critical");
      await emailBuyer(order, "by_store");
      return "manual";
    }

    const claimed = await db.retailOrder.updateMany({ where: { id: order.id, refundStatus: null }, data: { refundStatus: "pending" } });
    if (claimed.count !== 1) return "skipped";

    const secret = process.env.PAYSTACK_SECRET_KEY;
    if (!paystackSecretReady(secret)) {
      await markFailed(order, "Paystack isn't set up on the server");
      await emailBuyer(order, "by_store");
      return "failed";
    }

    const body = paystackRefundBody(order, order.orderNumber);
    let result: ReturnType<typeof readPaystackRefund>;
    try {
      const response = await fetch(`${paystackBase()}/refund`, {
        method: "POST",
        headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        cache: "no-store",
        signal: AbortSignal.timeout(15_000),
      });
      result = readPaystackRefund(response.ok, await response.json().catch(() => null));
    } catch (error) {
      result = { ok: false, message: error instanceof Error ? error.message : "Paystack could not be reached" };
    }

    if (!result.ok) {
      await markFailed(order, result.message);
      await emailBuyer(order, "by_store");
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
    await emailBuyer(order, "automatic");
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
