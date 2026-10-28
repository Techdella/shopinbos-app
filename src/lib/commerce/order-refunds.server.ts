import "server-only";
import { db } from "@/lib/db/client";
import { createNotification } from "@/lib/notifications/create";
import { notifyAdminsToReview } from "@/lib/notifications/events.server";
import { PAYSTACK_BANK_CODES, resolveBankAccount } from "@/lib/payout-bank";
import { checkRateLimitShared, rateLimitKey } from "@/lib/rate-limit";
import { supplierPartCollect } from "@shared/cod-split";
import {
  LATE_STRIKES_FOR_REVIEW,
  REFUND_CONFIRM_DAYS,
  REFUND_REASON_TEXT,
  STRIKE_WINDOW_DAYS,
  cleanAccountNumber,
  customerMayCancelLate,
  maskAccount,
  refundOpen,
  shipByDate,
  type RefundFault,
  type RefundReason,
} from "@shared/order-refunds";

// Who pays when things go wrong (rules and the table in shared/order-refunds.ts). Shopinbos never holds money, so a
// customer's refund is sent by the seller from their own bank to the account the customer gave on their order page;
// the seller taps "Refund sent" and the customer confirms or says it didn't arrive (then the team steps in). When a
// supplier caused it, the supplier owes the seller back through money owed (src/lib/money-owed): the "not sent" debt for
// out of stock and late, a claim with the packing photo for a wrong or damaged item. Every step is once (sourceKey,
// conditional updates) and nothing here throws into the caller's flow.

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

/** The customer's share of the order total for one supplier's lines (the whole total when that's all the order is). */
async function supplierPartKobo(supplierOrderId: string) {
  const row = await db.supplierOrder.findUnique({ where: { id: supplierOrderId }, select: { items: true, retailOrder: { select: { id: true, items: true, total: true } } } });
  if (!row) return 0;
  const lines = Array.isArray(row.retailOrder.items) ? row.retailOrder.items.length : 0;
  const parts = Array.isArray(row.items) ? row.items.length : 0;
  const naira = lines > 0 && parts >= lines ? Number(row.retailOrder.total) : supplierPartCollect(row.retailOrder.items, Number(row.retailOrder.total) || 0, row.items);
  return Math.round(Math.max(0, naira) * 100);
}

/**
 * A supplier's part of a paid order won't come (declined as out of stock, or the customer cancelled it for being late):
 * the customer is refunded that part, the supplier owes the seller back what they were paid at checkout (the "not sent"
 * debt, recorded now rather than at the next sweep), and a decline counts as a strike (missed order).
 */
export async function onSupplierPartFailed(supplierOrderId: string, reason: "out_of_stock" | "supplier_late") {
  try {
    const row = await db.supplierOrder.findUnique({ where: { id: supplierOrderId }, select: { id: true, status: true, sellerId: true, supplierId: true, retailOrderId: true, replacesId: true, rejectReason: true } });
    if (!row || !["rejected", "cancelled", "expired"].includes(row.status)) return null;
    if (reason === "out_of_stock") await db.supplier.update({ where: { id: row.supplierId }, data: { missedOrders: { increment: 1 } } }).catch(() => null);
    const { syncNotSentDebts } = await import("@/lib/money-owed/money-owed.server");
    await syncNotSentDebts({ sellerId: row.sellerId, since: new Date(Date.now() - 60 * 60_000) });
    const debt = await db.businessDebt.findUnique({ where: { sourceKey: `notsent:${row.id}` }, select: { id: true } }).catch(() => null);
    return await openRefund({
      sourceKey: `supplier:${row.id}`,
      orderId: row.retailOrderId,
      reason,
      fault: "supplier",
      amountKobo: await supplierPartKobo(row.id),
      supplierOrderId: row.id,
      note: reason === "out_of_stock" && row.rejectReason ? `Supplier: ${row.rejectReason}` : null,
      debtId: debt?.id ?? null,
    });
  } catch (error) {
    console.error(`[order refunds] supplier part ${supplierOrderId} failed`, error);
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

/** The customer's order page: their refunds, the late supplier parts they may cancel, and the banks to pick from. */
export async function customerRefundPanel(orderId: string) {
  const [refunds, late] = await Promise.all([
    refundsForOrder(orderId, "customer"),
    db.supplierOrder.findMany({ where: { retailOrderId: orderId, status: "accepted", lateAt: { not: null } }, select: { id: true, items: true } }).catch(() => []),
  ]);
  const lateParts = late.map((row) => {
    const names = (Array.isArray(row.items) ? row.items : []).map((item) => (item && typeof item === "object" && "name" in item ? String((item as { name?: unknown }).name ?? "") : "")).filter(Boolean);
    return { id: row.id, items: names.length ? names.join(", ") : "Part of your order" };
  });
  return { refunds: refunds.map(({ id, reasonText, amount, status, bankName, account, accountName }) => ({ id, reasonText, amount, status, bankName, account, accountName })), lateParts, refundBanks: REFUND_BANKS };
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
  await createNotification({ userId: refund.sellerId, type: "order", priority: "critical", title: `Customer says the refund didn't arrive: order ${order?.orderNumber ?? ""}`, description: "Check your bank transfer. Shopinbos will be in touch.", link: `/home/orders/${orderId}#refunds`, event: "order.refund", dedupeKey: `order.refund.disputed:${refund.id}` }).catch(() => null);
  await notifyAdminsToReview({ title: `Refund not received: order ${order?.orderNumber ?? ""}`, description: `The customer says the ${naira(refund.amountKobo, refund.currency)} refund the seller marked sent didn't arrive.${note ? ` "${note.slice(0, 200)}"` : ""}`, link: "/admin/refunds", dedupeKey: `admin.refund.disputed:${refund.id}` }).catch(() => null);
  return { ok: true, message: "We've told the store and Shopinbos. We'll be in touch." };
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

/**
 * The customer cancels a late supplier's part of their order (it's past its handling time and hasn't left): the
 * supplier order is cancelled, the customer refunded for it, and the supplier owes the seller back.
 */
export async function customerCancelsLatePart(orderId: string, supplierOrderId: string): Promise<RefundActionResult> {
  const row = await db.supplierOrder.findFirst({ where: { id: supplierOrderId, retailOrderId: orderId }, select: { id: true, status: true, lateAt: true, supplierId: true, sellerId: true, supplier: { select: { userId: true } }, retailOrder: { select: { orderNumber: true } } } });
  if (!row) return { ok: false, error: "We couldn't find this part of your order." };
  if (!customerMayCancelLate(row)) return { ok: false, error: row.status === "shipped" || row.status === "delivered" ? "It's already on its way, so it can't be cancelled now." : "This part of your order isn't late." };
  const moved = await db.supplierOrder.updateMany({ where: { id: row.id, status: "accepted" }, data: { status: "cancelled" } });
  if (moved.count !== 1) return { ok: false, error: "It has just moved on. Refresh to see where it is." };
  const refund = await onSupplierPartFailed(row.id, "supplier_late");
  const ref = row.retailOrder.orderNumber;
  await Promise.allSettled([
    createNotification({ userId: row.supplier.userId, type: "dropshipping", priority: "critical", title: `Order ${ref} was cancelled: it was late`, description: "The customer cancelled because it wasn't sent in its handling time. Don't send it. What you were paid for it is owed back to the shop.", link: "/supplier/orders", event: "supplier.update", dedupeKey: `supplier.late.cancelled:${row.id}` }),
    createNotification({ userId: row.sellerId, type: "dropshipping", priority: "warning", title: `Customer cancelled the late part of order ${ref}`, description: "Your supplier didn't send it in time. Refund your customer; your supplier pays you back.", link: `/home/orders/${orderId}#refunds`, event: "supplier.update", dedupeKey: `seller.late.cancelled:${row.id}` }),
  ]);
  return refund ? { ok: true, message: "Cancelled. Add your bank account below for your refund." } : { ok: true, message: "Cancelled." };
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

// ─── Wrong or damaged item: who caused it ──────────────────────────────────────

export type IssueFault = "supplier" | "partner" | "seller";

/**
 * The seller decides who caused a wrong or damaged item the customer reported: the customer is refunded (the supplier's
 * part for a supplier fault, else the whole order), and a supplier or the delivery partner owes the seller back through
 * a claim they can accept or dispute (the packing photo and the delivery photo go with it as evidence).
 */
export async function resolveIssueWithRefund(seller: { id: string }, issueId: string, fault: IssueFault, supplierOrderId?: string | null): Promise<RefundActionResult> {
  const store = await db.store.findUnique({ where: { userId: seller.id }, select: { id: true } });
  const issue = store ? await db.deliveryIssue.findFirst({ where: { id: issueId, storeId: store.id }, select: { id: true, kind: true, message: true, retailOrderId: true, bookingId: true, status: true } }) : null;
  if (!issue?.retailOrderId) return { ok: false, error: "We couldn't find this report." };
  const reason: RefundReason = fault === "partner" ? "damaged_in_transit" : issue.kind === "wrong_item" ? "wrong_item" : "damaged";
  const order = await db.retailOrder.findUnique({ where: { id: issue.retailOrderId }, select: { id: true, total: true, shippingFee: true, orderNumber: true } });
  if (!order) return { ok: false, error: "We couldn't find this order." };
  const { raiseClaim } = await import("@/lib/money-owed/money-owed.server");
  let amountKobo = Math.round(Number(order.total) * 100);
  let debtNote: string | null = null;
  if (fault === "supplier") {
    const part = await db.supplierOrder.findFirst({ where: { id: supplierOrderId ?? "", retailOrderId: order.id, sellerId: seller.id }, select: { id: true, costTotal: true, deliveryFee: true, packPhotoUrl: true } });
    if (!part) return { ok: false, error: "Pick the supplier who sent it." };
    amountKobo = await supplierPartKobo(part.id);
    const claim = await raiseClaim(seller, {
      target: "supplier_order",
      targetId: part.id,
      reason: issue.kind === "wrong_item" ? "wrong_item" : "damaged",
      amountKobo: Math.round((part.costTotal + part.deliveryFee) * 100),
      details: `The customer reported ${issue.kind === "wrong_item" ? "the wrong item" : "a damaged item"}${issue.message ? `: "${issue.message.slice(0, 400)}"` : ""}.${part.packPhotoUrl ? ` Packing photo: ${part.packPhotoUrl}` : ""}`,
    });
    debtNote = claim.ok ? "Claim sent to the supplier." : claim.error;
  } else if (fault === "partner" && issue.bookingId) {
    const job = await db.deliveryBooking.findUnique({ where: { id: issue.bookingId }, select: { proofUrl: true } });
    const goods = Math.round(Math.max(0, Number(order.total) - Number(order.shippingFee ?? 0)) * 100);
    const claim = await raiseClaim(seller, {
      target: "booking",
      targetId: issue.bookingId,
      reason: "damaged_in_transit",
      amountKobo: goods,
      details: `The customer reported a damaged parcel${issue.message ? `: "${issue.message.slice(0, 400)}"` : ""}.${job?.proofUrl ? ` Delivery photo: ${job.proofUrl}` : ""}`,
    });
    debtNote = claim.ok ? "Claim sent to the delivery partner." : claim.error;
  }
  const refund = await openRefund({ sourceKey: `issue:${issue.id}`, orderId: order.id, reason, fault, amountKobo, supplierOrderId: fault === "supplier" ? supplierOrderId : null, note: debtNote });
  await db.deliveryIssue.updateMany({ where: { id: issue.id, status: "open" }, data: { status: "resolved" } }).catch(() => null);
  if (!refund) return { ok: false, error: "This order wasn't paid, so there's nothing to refund." };
  return { ok: true, message: `Refund opened.${debtNote ? ` ${debtNote}` : ""}` };
}

// ─── Late handling (the supplier cron) ─────────────────────────────────────────

/** When a supplier accepts: their ship-by deadline from the products' handling days. */
export async function setShipBy(supplierOrderId: string, acceptedAt: Date) {
  const row = await db.supplierOrder.findUnique({ where: { id: supplierOrderId }, select: { items: true } });
  const ids = (Array.isArray(row?.items) ? (row!.items as Array<{ supplierProductId?: unknown }>) : []).map((item) => item.supplierProductId).filter((id): id is string => typeof id === "string");
  const products = ids.length ? await db.supplierProduct.findMany({ where: { id: { in: ids } }, select: { handlingDays: true } }) : [];
  await db.supplierOrder.updateMany({ where: { id: supplierOrderId, shipBy: null }, data: { shipBy: shipByDate(acceptedAt, products.map((product) => product.handlingDays)) } });
}

/**
 * Accepted orders past their ship-by without shipping: a strike on the supplier (missedReadyDates), the seller and the
 * customer told (the customer may cancel that part for a full refund), and at LATE_STRIKES_FOR_REVIEW late orders in
 * STRIKE_WINDOW_DAYS the team reviews the supplier's tier. Once per order (lateAt).
 */
export async function markLateSuppliers(now = new Date(), limit = 200) {
  const rows = await db.supplierOrder.findMany({
    where: { status: "accepted", lateAt: null, shipBy: { lte: now } },
    take: limit,
    select: { id: true, supplierId: true, sellerId: true, retailOrderId: true, supplier: { select: { userId: true, displayName: true } }, retailOrder: { select: { orderNumber: true } } },
  });
  let marked = 0;
  for (const row of rows) {
    const moved = await db.supplierOrder.updateMany({ where: { id: row.id, status: "accepted", lateAt: null }, data: { lateAt: now } });
    if (moved.count !== 1) continue;
    marked += 1;
    await db.supplier.update({ where: { id: row.supplierId }, data: { missedReadyDates: { increment: 1 } } }).catch(() => null);
    const ref = row.retailOrder.orderNumber;
    await Promise.allSettled([
      createNotification({ userId: row.supplier.userId, type: "dropshipping", priority: "critical", title: `Order ${ref} is late`, description: "It's past its handling time. Send it today: the customer can now cancel it, and late orders count against your level.", link: "/supplier/orders", event: "supplier.update", dedupeKey: `supplier.late:${row.id}` }),
      createNotification({ userId: row.sellerId, type: "dropshipping", priority: "warning", title: `${row.supplier.displayName} is late with order ${ref}`, description: "Your customer can wait or cancel that part for a full refund; your supplier pays you back if they do.", link: `/home/orders/${row.retailOrderId}`, event: "supplier.update", dedupeKey: `seller.late:${row.id}` }),
      import("@/lib/notifications/customer-messages").then((messages) => messages.textOrderLate(row.retailOrderId, row.id)),
    ]);
    const since = new Date(now.getTime() - STRIKE_WINDOW_DAYS * 86_400_000);
    const strikes = await db.supplierOrder.count({ where: { supplierId: row.supplierId, lateAt: { gte: since } } });
    if (strikes >= LATE_STRIKES_FOR_REVIEW) {
      await notifyAdminsToReview({
        title: `${row.supplier.displayName}: ${strikes} late orders in ${STRIKE_WINDOW_DAYS} days`,
        description: `Review their tier. Latest: order ${ref}.`,
        link: `/admin/suppliers/${row.supplierId}`,
        dedupeKey: `admin.supplier.late:${row.supplierId}:${Math.floor(now.getTime() / (7 * 86_400_000))}`,
      }).catch(() => null);
    }
  }
  return marked;
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

// ─── The team (Admin › Refunds) ────────────────────────────────────────────────

export type RefundDecision = "received" | "resend" | "cancel";

/**
 * The team's decision on a refund the customer says didn't arrive (or one stuck with the seller): it did arrive (the
 * seller showed the transfer), the seller sends it again (back to "to send"), or it's cancelled (settled outside the
 * app). Both the seller and the customer's order page show the outcome.
 */
export async function adminDecideRefund(refundId: string, decision: RefundDecision, note?: string): Promise<RefundActionResult> {
  const refund = await db.orderRefund.findUnique({ where: { id: refundId } });
  if (!refund || !refundOpen(refund.status)) return { ok: false, error: "This refund is already closed." };
  const now = new Date();
  const decided = note?.trim().slice(0, 500) || null;
  const data =
    decision === "received" ? { status: "confirmed", confirmedAt: now }
    : decision === "resend" ? { status: refund.accountNumber ? "to_send" : "awaiting_account", sentAt: null, sentReference: null, remindedAt: null }
    : { status: "cancelled" };
  const moved = await db.orderRefund.updateMany({ where: { id: refund.id, status: refund.status }, data: { ...data, ...(decided ? { note: [refund.note, `Shopinbos: ${decided}`].filter(Boolean).join(" ") } : {}) } });
  if (moved.count !== 1) return { ok: false, error: "It just changed. Refresh and try again." };
  if (decision !== "resend") await finishOrderRefund(refund.retailOrderId);
  const order = await db.retailOrder.findUnique({ where: { id: refund.retailOrderId }, select: { orderNumber: true } });
  const ref = order?.orderNumber ?? "";
  await createNotification({
    userId: refund.sellerId,
    type: "order",
    priority: decision === "resend" ? "critical" : "info",
    title: decision === "resend" ? `Send the refund for order ${ref} again` : decision === "received" ? `Refund for order ${ref} settled` : `Refund for order ${ref} closed`,
    description: decided ?? (decision === "resend" ? "Shopinbos checked: it didn't reach your customer. Send it again, then tap Refund sent." : "Shopinbos closed it."),
    link: `/home/orders/${refund.retailOrderId}#refunds`,
    event: "order.refund",
    dedupeKey: `order.refund.decided:${refund.id}:${decision}:${now.getTime()}`,
  }).catch(() => null);
  return { ok: true, message: decision === "resend" ? "Sent back to the seller." : "Closed." };
}
