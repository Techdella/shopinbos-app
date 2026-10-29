import "server-only";
import { db } from "@/lib/db/client";
import { createNotification } from "@/lib/notifications/create";
import { PAYSTACK_BANK_CODES, resolveBankAccount } from "@/lib/payout-bank";
import { checkRateLimitShared, rateLimitKey } from "@/lib/rate-limit";
import {
  REFUND_CONFIRM_DAYS,
  REFUND_REASON_TEXT,
  cleanAccountNumber,
  maskAccount,
  refundOpen,
  type RefundFault,
  type RefundReason,
} from "@shared/order-refunds";

// Guided refunds (shared/order-refunds.ts). Shopinbos never holds money, so the part of a refund the seller owes
// (who pays is decided in src/lib/faults, shared/fault-matrix.ts; a cancelled paid order; a late payment) is sent by
// the seller from their own bank to the account the customer gave on their order page; the seller taps "Refund sent"
// and the customer confirms or says it didn't arrive (then the team steps in, Admin › Refunds). What others owe the
// seller for it is money owed (src/lib/money-owed). Every step is once (sourceKey, conditional updates) and nothing
// here throws into the caller's flow.

const PAID_STATUSES = ["paid", "processing", "packed", "shipped", "delivered"];

const naira = (kobo: number, currency = "NGN") => {
  try {
    return new Intl.NumberFormat("en-NG", { style: "currency", currency, maximumFractionDigits: 0 }).format(kobo / 100);
  } catch {
    return `₦${Math.round(kobo / 100).toLocaleString("en-NG")}`;
  }
};

/** Banks a customer can be refunded to (the names Paystack checks account numbers against). */
export const REFUND_BANKS = Object.keys(PAYSTACK_BANK_CODES).sort((a, b) => a.localeCompare(b));

/** The customer paid for this order (online, or the seller marked it paid). */
function customerPaid(order: { status: string; paystackStatus: string | null; paymentMethod: string | null }) {
  return order.paystackStatus === "success" || order.paystackStatus === "offline" || PAID_STATUSES.includes(order.status);
}

// ─── Opening a refund ──────────────────────────────────────────────────────────

export interface OpenRefundInput {
  sourceKey: string;
  orderId: string;
  reason: RefundReason;
  fault: RefundFault;
  amountKobo: number;
  supplierOrderId?: string | null;
  note?: string | null;
  debtId?: string | null;
}

/**
 * Opens a refund the seller owes the customer, once per sourceKey. The customer is asked for their bank account (SMS,
 * and on their order page); the seller is told. Returns the refund, or null when there's nothing to refund.
 */
export async function openRefund(input: OpenRefundInput) {
  try {
    if (!(input.amountKobo > 0)) return null;
    const order = await db.retailOrder.findUnique({ where: { id: input.orderId }, select: { id: true, storeId: true, orderNumber: true, currency: true, status: true, paystackStatus: true, paymentMethod: true, store: { select: { userId: true } } } });
    if (!order || !customerPaid(order)) return null;
    let refund;
    try {
      refund = await db.orderRefund.create({
        data: {
          sourceKey: input.sourceKey,
          retailOrderId: order.id,
          storeId: order.storeId,
          sellerId: order.store.userId,
          reason: input.reason,
          fault: input.fault,
          supplierOrderId: input.supplierOrderId ?? null,
          amountKobo: Math.round(input.amountKobo),
          currency: order.currency,
          note: input.note?.slice(0, 500) ?? null,
          debtId: input.debtId ?? null,
        },
      });
    } catch (error) {
      if ((error as { code?: string }).code === "P2002") return db.orderRefund.findUnique({ where: { sourceKey: input.sourceKey } });
      throw error;
    }
    const amount = naira(refund.amountKobo, refund.currency);
    await db.retailOrder.updateMany({ where: { id: order.id, refundStatus: null }, data: { refundStatus: "manual" } }).catch(() => null);
    await createNotification({
      userId: order.store.userId,
      type: "order",
      priority: "critical",
      title: `Refund ${amount} to your customer: order ${order.orderNumber}`,
      description: `${REFUND_REASON_TEXT[input.reason]}. We've asked your customer for their bank account. You'll send it from your bank, then tap Refund sent.${input.fault === "supplier" ? " Your supplier pays you back (see Money owed in your wallet)." : ""}`,
      link: `/home/orders/${order.id}#refunds`,
      event: "order.refund",
      dedupeKey: `order.refund:${refund.id}`,
    }).catch(() => null);
    const { textOrderRefund } = await import("@/lib/notifications/customer-messages");
    await textOrderRefund(order.id, refund.id, "account", amount).catch(() => null);
    return refund;
  } catch (error) {
    console.error(`[order refunds] could not open ${input.sourceKey}`, error);
    return null;
  }
}

/**
 * The seller cancelled a paid order: the customer gets back what isn't already being refunded. Out of stock with the
 * supplier when one of its suppliers declined or ran out of time, else the seller's own call.
 */
export async function onPaidOrderCancelled(orderId: string, why?: string, amountKobo?: number) {
  try {
    const order = await db.retailOrder.findUnique({ where: { id: orderId }, select: { id: true, total: true } });
    if (!order) return null;
    const [refunds, failedSupplier] = await Promise.all([
      db.orderRefund.findMany({ where: { retailOrderId: order.id, status: { not: "cancelled" } }, select: { amountKobo: true } }),
      db.supplierOrder.findFirst({ where: { retailOrderId: order.id, status: { in: ["rejected", "expired"] } }, select: { id: true } }),
    ]);
    // What was paid (all of it, or a preorder's deposit), less what's already being refunded.
    const left = Math.round(amountKobo ?? Number(order.total) * 100) - refunds.reduce((sum, row) => sum + row.amountKobo, 0);
    return await openRefund({ sourceKey: `order:${order.id}`, orderId: order.id, reason: failedSupplier ? "out_of_stock" : "cancelled", fault: failedSupplier ? "supplier" : "seller", amountKobo: left, note: why ?? null });
  } catch (error) {
    console.error(`[order refunds] cancelled order ${orderId}`, error);
    return null;
  }
}

// ─── The customer ──────────────────────────────────────────────────────────────

export type RefundView = {
  id: string;
  reason: string;
  reasonText: string;
  fault: string;
  amount: number;
  currency: string;
  status: string;
  bankName: string | null;
  account: string;
  accountName: string | null;
  sentAt: string | null;
  sentReference: string | null;
  note: string | null;
};

/** The order's refunds. `seller` shows the whole account number (they send the money); the customer sees the last 4. */
export async function refundsForOrder(orderId: string, audience: "customer" | "seller"): Promise<RefundView[]> {
  const rows = await db.orderRefund.findMany({ where: { retailOrderId: orderId, status: { not: "cancelled" } }, orderBy: { createdAt: "asc" } }).catch(() => []);
  return rows.map((row) => ({
    id: row.id,
    reason: row.reason,
    reasonText: REFUND_REASON_TEXT[row.reason as RefundReason] ?? REFUND_REASON_TEXT.other,
    fault: row.fault,
    amount: row.amountKobo / 100,
    currency: row.currency,
    status: row.status,
    bankName: row.bankName,
    account: audience === "seller" ? row.accountNumber ?? "" : maskAccount(row.accountNumber),
    accountName: row.accountName,
    sentAt: row.sentAt?.toISOString() ?? null,
    sentReference: audience === "seller" ? row.sentReference : null,
    note: audience === "seller" ? row.note : null,
  }));
}

/** The customer's order page: their refunds and the banks to pick from. */
export async function customerRefundPanel(orderId: string) {
  const refunds = await refundsForOrder(orderId, "customer");
  return { refunds: refunds.map(({ id, reasonText, amount, status, bankName, account, accountName }) => ({ id, reasonText, amount, status, bankName, account, accountName })), refundBanks: REFUND_BANKS };
}

export type RefundActionResult = { ok: true; message: string; accountName?: string } | { ok: false; error: string };

/**
 * The customer gives the account for their refund (from their order page, whose unguessable link is the access, as
 * for the order page itself). Checked with the bank so the name shows; the seller is then asked to send it.
 */
export async function giveRefundAccount(orderId: string, refundId: string, input: { bankName: string; accountNumber: string }): Promise<RefundActionResult> {
  if (!(await checkRateLimitShared(rateLimitKey("refund-account", refundId), { maxRequests: 8, windowMs: 60 * 60_000 })).allowed) {
    return { ok: false, error: "Too many tries. Wait a little, then try again." };
  }
  const refund = await db.orderRefund.findFirst({ where: { id: refundId, retailOrderId: orderId } });
  if (!refund) return { ok: false, error: "We couldn't find this refund." };
  if (refund.status !== "awaiting_account" && refund.status !== "to_send") return { ok: false, error: "This refund has already been sent." };
  const bankName = REFUND_BANKS.find((name) => name === input.bankName);
  const accountNumber = cleanAccountNumber(input.accountNumber);
  if (!bankName) return { ok: false, error: "Pick your bank." };
  if (!accountNumber) return { ok: false, error: "Type your 10-digit account number." };
  const resolved = await resolveBankAccount(bankName, accountNumber);
  if (resolved.status === "not_found") return { ok: false, error: "That account number doesn't match the bank. Check both and try again." };
  const accountName = resolved.status === "resolved" ? resolved.accountName : null;
  const moved = await db.orderRefund.updateMany({
    where: { id: refund.id, status: { in: ["awaiting_account", "to_send"] } },
    data: { bankName, accountNumber, accountName, accountGivenAt: new Date(), status: "to_send" },
  });
  if (moved.count !== 1) return { ok: false, error: "This refund has already been sent." };
  const order = await db.retailOrder.findUnique({ where: { id: orderId }, select: { orderNumber: true } });
  await createNotification({
    userId: refund.sellerId,
    type: "order",
    priority: "critical",
    title: `Send the refund now: order ${order?.orderNumber ?? ""}`,
    description: `Your customer gave their account: ${bankName}, ${accountNumber}${accountName ? ` (${accountName})` : ""}. Send ${naira(refund.amountKobo, refund.currency)} from your bank, then tap Refund sent.`,
    link: `/home/orders/${orderId}#refunds`,
    event: "order.refund",
    dedupeKey: `order.refund.account:${refund.id}:${accountNumber}`,
  }).catch(() => null);
  return { ok: true, message: accountName ? `Thanks. The store sends your refund to ${accountName}.` : "Thanks. The store sends your refund to this account.", ...(accountName ? { accountName } : {}) };
}

/** The customer says the refund arrived, or that it didn't (the team checks with the seller). */
export async function customerAnswersRefund(orderId: string, refundId: string, received: boolean, note?: string): Promise<RefundActionResult> {
  const refund = await db.orderRefund.findFirst({ where: { id: refundId, retailOrderId: orderId, status: "sent" } });
  if (!refund) return { ok: false, error: "This refund isn't waiting for your answer." };
  const now = new Date();
  const moved = await db.orderRefund.updateMany({
    where: { id: refund.id, status: "sent" },
    data: received ? { status: "confirmed", confirmedAt: now } : { status: "disputed", disputedAt: now, disputeNote: note?.trim().slice(0, 500) || null },
  });
  if (moved.count !== 1) return { ok: false, error: "This refund isn't waiting for your answer." };
  const order = await db.retailOrder.findUnique({ where: { id: orderId }, select: { orderNumber: true } });
  if (received) {
    await finishOrderRefund(orderId);
    await createNotification({ userId: refund.sellerId, type: "order", priority: "success", title: `Refund received: order ${order?.orderNumber ?? ""}`, description: "Your customer confirmed the refund arrived.", link: `/home/orders/${orderId}#refunds`, event: "order.refund", dedupeKey: `order.refund.ok:${refund.id}` }).catch(() => null);
    return { ok: true, message: "Thanks for letting us know." };
  }
  await createNotification({ userId: refund.sellerId, type: "order", priority: "critical", title: `Customer says the refund didn't arrive: order ${order?.orderNumber ?? ""}`, description: `Check your bank transfer, then send it again or talk to your customer.${note ? ` They said: "${note.slice(0, 200)}"` : ""}`, link: `/home/orders/${orderId}#refunds`, event: "order.refund", dedupeKey: `order.refund.disputed:${refund.id}` }).catch(() => null);
  return { ok: true, message: "We've told the store. They'll check and get back to you." };
}

/** Every refund on the order is through: the order shows refunded (fully when it covered the whole total). */
async function finishOrderRefund(orderId: string) {
  const [order, refunds] = await Promise.all([
    db.retailOrder.findUnique({ where: { id: orderId }, select: { total: true, status: true } }),
    db.orderRefund.findMany({ where: { retailOrderId: orderId, status: { not: "cancelled" } }, select: { status: true, amountKobo: true } }),
  ]);
  if (!order || refunds.some((row) => refundOpen(row.status))) return;
  // The money went from the seller's bank, so the order's own refund flag only says it's done.
  await db.retailOrder.update({ where: { id: orderId }, data: { refundStatus: "processed", refundedAt: new Date(), paymentIssue: null } }).catch(() => null);
}

// ─── The seller ────────────────────────────────────────────────────────────────

/** The seller sent the refund from their bank. The customer is asked whether it arrived. */
export async function sellerSentRefund(sellerId: string, refundId: string, reference?: string): Promise<RefundActionResult> {
  const refund = await db.orderRefund.findFirst({ where: { id: refundId, sellerId } });
  if (!refund) return { ok: false, error: "We couldn't find this refund." };
  if (refund.status !== "to_send") return { ok: false, error: refund.status === "awaiting_account" ? "Wait for your customer's bank account first." : "This refund was already marked sent." };
  const moved = await db.orderRefund.updateMany({ where: { id: refund.id, status: "to_send" }, data: { status: "sent", sentAt: new Date(), sentReference: reference?.trim().slice(0, 120) || null } });
  if (moved.count !== 1) return { ok: false, error: "This refund was already marked sent." };
  const { textOrderRefund } = await import("@/lib/notifications/customer-messages");
  await textOrderRefund(refund.retailOrderId, refund.id, "sent", naira(refund.amountKobo, refund.currency)).catch(() => null);
  return { ok: true, message: "Marked sent. We've asked your customer to confirm it arrived." };
}

/** Reminds sellers of refunds the customer gave an account for 2+ days ago, once. */
export async function remindRefundsToSend(now = new Date()) {
  const due = await db.orderRefund.findMany({ where: { status: "to_send", remindedAt: null, accountGivenAt: { lte: new Date(now.getTime() - 2 * 86_400_000) } }, take: 200, select: { id: true, sellerId: true, retailOrderId: true, amountKobo: true, currency: true } });
  for (const refund of due) {
    const moved = await db.orderRefund.updateMany({ where: { id: refund.id, remindedAt: null }, data: { remindedAt: now } });
    if (moved.count !== 1) continue;
    await createNotification({ userId: refund.sellerId, type: "order", priority: "critical", title: `Your customer is still waiting for ${naira(refund.amountKobo, refund.currency)}`, description: "Send the refund from your bank, then tap Refund sent.", link: `/home/orders/${refund.retailOrderId}#refunds`, event: "order.refund", dedupeKey: `order.refund.remind:${refund.id}` }).catch(() => null);
  }
  return due.length;
}

/** "Refund sent" a week ago and the customer said nothing: it counts as received. */
export async function autoConfirmSentRefunds(now = new Date()) {
  const due = await db.orderRefund.findMany({ where: { status: "sent", sentAt: { lte: new Date(now.getTime() - REFUND_CONFIRM_DAYS * 86_400_000) } }, take: 200, select: { id: true, retailOrderId: true } });
  for (const refund of due) {
    const moved = await db.orderRefund.updateMany({ where: { id: refund.id, status: "sent" }, data: { status: "confirmed", confirmedAt: now } });
    if (moved.count === 1) await finishOrderRefund(refund.retailOrderId);
  }
  return due.length;
}

// ─── Sending it again ──────────────────────────────────────────────────────────

/**
 * The customer says the refund didn't arrive: the seller checks their bank and sends it again (back to "to send", the
 * customer is asked again once it's marked sent). Between the shop and its customer: Shopinbos doesn't decide.
 */
export async function sellerResendRefund(sellerId: string, refundId: string): Promise<RefundActionResult> {
  const refund = await db.orderRefund.findFirst({ where: { id: refundId, sellerId } });
  if (!refund) return { ok: false, error: "We couldn't find this refund." };
  if (refund.status !== "disputed") return { ok: false, error: "This refund isn't waiting on you." };
  const moved = await db.orderRefund.updateMany({ where: { id: refund.id, status: "disputed" }, data: { status: refund.accountNumber ? "to_send" : "awaiting_account", sentAt: null, sentReference: null, remindedAt: null } });
  return moved.count === 1 ? { ok: true, message: "Send it again from your bank, then tap Refund sent." } : { ok: false, error: "It just changed. Refresh and try again." };
}
