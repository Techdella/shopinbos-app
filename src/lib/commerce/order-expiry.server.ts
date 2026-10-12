import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { createNotification } from "@/lib/notifications/create";
import { InsufficientStockError, releaseStock, reserveStock } from "@/lib/commerce/stock.server";
import { EXPIRING_METHODS, UNPAID_STATUSES, expiryCutoff, isExpirableOrder, parseStockHold, unpaidOrderTtlMinutes } from "@/lib/commerce/stock-holds";
import { ensureSupplierOrdersSafely } from "@/lib/supplier-orders/service.server";

// Unpaid card/transfer orders stop holding stock: after UNPAID_ORDER_TTL_MINUTES (default 30) they are
// cancelled and what checkout took goes back (the store's stock, or the supplier's for dropship). Pay-on-delivery
// and paid orders are never touched. Runs from /api/cron/expire-orders and, cheaply, wherever stock is checked.
//
// Race-safe: the order only moves if it is still unpaid at that instant (a conditional update on status), and a
// payment marks it paid with the same condition, so whichever lands first wins and the other does nothing.

export function unpaidOrderTtl() {
  return unpaidOrderTtlMinutes(process.env.UNPAID_ORDER_TTL_MINUTES);
}

export interface ExpiryResult {
  checked: number;
  expired: number;
  orderIds: string[];
}

export async function expireUnpaidOrders(options: { now?: Date; storeId?: string; limit?: number } = {}): Promise<ExpiryResult> {
  const now = options.now ?? new Date();
  const ttl = unpaidOrderTtl();
  const candidates = await db.retailOrder.findMany({
    where: {
      ...(options.storeId ? { storeId: options.storeId } : {}),
      status: { in: [...UNPAID_STATUSES] },
      createdAt: { lte: expiryCutoff(now, ttl) },
      stockReleasedAt: null,
      stockHold: { not: Prisma.DbNull },
      OR: [{ paymentMethod: null }, { paymentMethod: { in: [...EXPIRING_METHODS] } }],
    },
    orderBy: { createdAt: "asc" },
    take: options.limit ?? 200,
    select: { id: true, status: true, paymentMethod: true, createdAt: true, stockHold: true, stockReleasedAt: true },
  });

  const orderIds: string[] = [];
  for (const order of candidates) {
    if (!isExpirableOrder(order, now, ttl)) continue;
    const holds = parseStockHold(order.stockHold);
    try {
      const expired = await db.$transaction(async (tx) => {
        const moved = await tx.retailOrder.updateMany({
          where: { id: order.id, status: { in: [...UNPAID_STATUSES] }, stockReleasedAt: null },
          data: { status: "cancelled", expiredAt: now, stockReleasedAt: now },
        });
        if (moved.count !== 1) return false; // paid (or moved) a moment ago: leave it
        await releaseStock(tx, holds);
        return true;
      });
      if (expired) orderIds.push(order.id);
    } catch (error) {
      console.error(`[order expiry] could not expire order ${order.id}`, error);
    }
  }
  if (orderIds.length) console.info(`[order expiry] expired ${orderIds.length} unpaid order(s) after ${ttl} min`, orderIds);
  return { checked: candidates.length, expired: orderIds.length, orderIds };
}

// Opportunistic runs, so expiry works before the cron is scheduled: at most once a minute per store and once
// every five minutes across all stores, per server instance. Never throws.
const STORE_INTERVAL_MS = 60_000;
const GLOBAL_INTERVAL_MS = 5 * 60_000;
const lastRun = new Map<string, number>();

export async function maybeExpireUnpaidOrders(storeId: string) {
  const now = Date.now();
  const globalDue = now - (lastRun.get("*") ?? 0) >= GLOBAL_INTERVAL_MS;
  const storeDue = now - (lastRun.get(storeId) ?? 0) >= STORE_INTERVAL_MS;
  if (!globalDue && !storeDue) return;
  lastRun.set(storeId, now);
  if (globalDue) lastRun.set("*", now);
  if (lastRun.size > 5000) lastRun.clear();
  try {
    await expireUnpaidOrders(globalDue ? { limit: 50 } : { storeId, limit: 20 });
  } catch (error) {
    console.error("[order expiry] opportunistic run failed", error);
  }
}

export type LatePaymentOutcome = "not_expired" | "reinstated" | "needs_refund";

/**
 * A payment arrived for an order that had already expired. Take the stock again if it's still there and mark the
 * order paid; otherwise keep it cancelled, flag it for a refund (paymentIssue), tell the seller and log it.
 */
export async function recoverExpiredOrderPayment(orderId: string, payment: { reference?: string | null; paymentMethod?: string | null } = {}): Promise<LatePaymentOutcome> {
  const order = await db.retailOrder.findUnique({
    where: { id: orderId },
    select: { id: true, storeId: true, orderNumber: true, status: true, expiredAt: true, stockHold: true, paymentIssue: true, store: { select: { userId: true } } },
  });
  if (!order || order.status !== "cancelled" || !order.expiredAt) return "not_expired";
  const holds = parseStockHold(order.stockHold);
  const paidData = {
    paystackStatus: "success",
    ...(payment.reference ? { paystackRef: payment.reference } : {}),
    ...(payment.paymentMethod ? { paymentMethod: payment.paymentMethod } : {}),
  };

  try {
    const reinstated = await db.$transaction(async (tx) => {
      const moved = await tx.retailOrder.updateMany({
        where: { id: order.id, status: "cancelled", expiredAt: { not: null } },
        data: { ...paidData, status: "paid", stockReleasedAt: null, paymentIssue: null },
      });
      if (moved.count !== 1) return false;
      await reserveStock(tx, order.storeId, holds);
      return true;
    });
    if (!reinstated) return "not_expired";
    console.warn(`[order expiry] order ${order.orderNumber} was paid after it expired; stock was still there, so it is paid again`);
    await ensureSupplierOrdersSafely(order.id);
    return "reinstated";
  } catch (error) {
    if (!(error instanceof InsufficientStockError)) throw error;
    const issue = `Paid after the order expired (unpaid for over ${unpaidOrderTtl()} minutes) and the stock had sold: ${error.message.replace(/^Insufficient stock for /, "")}. Refund the buyer.`;
    await db.retailOrder.updateMany({ where: { id: order.id, status: "cancelled" }, data: { ...paidData, paymentIssue: issue.slice(0, 500) } });
    if (order.paymentIssue) return "needs_refund"; // already flagged (a replayed event): don't tell the seller twice
    console.warn(`[order expiry] order ${order.orderNumber} paid after expiry with no stock left: needs a refund`);
    await createNotification({
      userId: order.store.userId,
      type: "order",
      priority: "critical",
      title: `Refund needed: order ${order.orderNumber}`,
      description: `This order expired unpaid and its stock sold to someone else, then the payment came in. Refund the buyer or offer a replacement.`,
      link: `/home/orders/${order.id}`,
      sendEmail: true,
    }).catch(() => null);
    return "needs_refund";
  }
}

/** The seller cancelled an order before it went out: give back the stock checkout took for it, once. */
export async function releaseOrderStock(orderId: string) {
  const order = await db.retailOrder.findUnique({ where: { id: orderId }, select: { id: true, stockHold: true, stockReleasedAt: true } });
  if (!order || order.stockReleasedAt) return false;
  const holds = parseStockHold(order.stockHold);
  if (!holds.length) return false;
  return db.$transaction(async (tx) => {
    const claimed = await tx.retailOrder.updateMany({ where: { id: order.id, stockReleasedAt: null }, data: { stockReleasedAt: new Date() } });
    if (claimed.count !== 1) return false;
    await releaseStock(tx, holds);
    return true;
  });
}
