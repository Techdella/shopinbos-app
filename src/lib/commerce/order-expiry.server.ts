import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { confirmOrderSplit } from "./payment-split.server";
import { InsufficientStockError, releaseStock, reserveStock } from "@/lib/commerce/stock.server";
import {
  CARD_METHODS,
  EXPIRING_METHODS,
  OFFLINE_EXPIRING_METHODS,
  UNPAID_STATUSES,
  expiryCutoff,
  isExpirableOrder,
  isLegacyCheckoutOrder,
  orderStockHolds,
  parseStockHold,
  paymentDueAt,
  shouldRestoreDiscount,
  unpaidOrderTtlMinutes,
  unpaidTransferTtlHours,
  windowInWords,
  type PaymentWindows,
} from "@/lib/commerce/stock-holds";
import { readTransferWindowHours } from "@shared/checkout-payments";
import { refundLatePayment } from "@/lib/commerce/refunds.server";
import { ensureSupplierOrdersSafely } from "@/lib/supplier-orders/service.server";

// Unpaid orders stop holding stock: card orders after UNPAID_ORDER_TTL_MINUTES (default 30), bank-transfer orders
// after UNPAID_TRANSFER_TTL_HOURS (default 24) or the seller's own choice (Money page). Checkout saves the deadline
// on the order (paymentDueAt); older orders work it out from when they were placed. Expired orders are cancelled,
// what checkout took goes back (the store's stock, or the supplier's for dropship) and so does the discount use.
// Orders placed before holds were saved give back what checkout took then (legacyStockHold). Pay-on-delivery and
// paid orders are never touched. Runs from /api/cron/expire-orders and, cheaply, wherever stock is checked.
//
// Race-safe: the order only moves if it is still unpaid at that instant (a conditional update on status), and a
// payment marks it paid with the same condition, so whichever lands first wins and the other does nothing.

/** Card window in minutes (kept for callers that report it). */
export function unpaidOrderTtl() {
  return unpaidOrderTtlMinutes(process.env.UNPAID_ORDER_TTL_MINUTES);
}

/** The platform windows from the environment. */
export function paymentWindows(): PaymentWindows {
  return { cardMinutes: unpaidOrderTtl(), transferMinutes: unpaidTransferTtlHours(process.env.UNPAID_TRANSFER_TTL_HOURS) * 60 };
}

/** The windows for one store: its own bank-transfer time when the seller set one. */
export function storePaymentWindows(brandSettings: unknown): PaymentWindows {
  const windows = paymentWindows();
  const hours = readTransferWindowHours(brandSettings);
  return hours ? { ...windows, transferMinutes: hours * 60 } : windows;
}

/** The deadline checkout saves on a new order (null for pay on delivery). */
export function checkoutPaymentDueAt(createdAt: Date, paymentMethod: string | null, brandSettings: unknown) {
  return paymentDueAt(createdAt, paymentMethod, storePaymentWindows(brandSettings));
}

export interface ExpiryResult {
  checked: number;
  expired: number;
  orderIds: string[];
}

/**
 * Gives back the discount (or coupon) use this order took at checkout, once: claims discountReleasedAt with a
 * conditional update, then lowers usedCount (never below zero). Checkout saved the code, not the row, and looked
 * the code up as a store discount first, then a coupon; this does the same.
 */
export async function restoreDiscountUse(tx: Prisma.TransactionClient, order: { id: string; storeId: string; discountCode: string | null; discountReleasedAt?: Date | null }, statusBefore: string, now = new Date()) {
  if (!shouldRestoreDiscount(order, statusBefore)) return false;
  const claimed = await tx.retailOrder.updateMany({ where: { id: order.id, discountReleasedAt: null }, data: { discountReleasedAt: now } });
  if (claimed.count !== 1) return false;
  const code = order.discountCode!;
  const discount = await tx.discount.findUnique({ where: { storeId_code: { storeId: order.storeId, code } }, select: { id: true } });
  if (discount) {
    await tx.discount.updateMany({ where: { id: discount.id, usedCount: { gt: 0 } }, data: { usedCount: { decrement: 1 } } });
    return true;
  }
  await tx.coupon.updateMany({ where: { code, storeId: order.storeId, usedCount: { gt: 0 } }, data: { usedCount: { decrement: 1 } } });
  return true;
}

/** A late payment brought the order back: it uses its discount again (only if expiry gave it back). */
async function retakeDiscountUse(tx: Prisma.TransactionClient, order: { id: string; storeId: string; discountCode: string | null }) {
  if (!order.discountCode) return;
  const claimed = await tx.retailOrder.updateMany({ where: { id: order.id, discountReleasedAt: { not: null } }, data: { discountReleasedAt: null } });
  if (claimed.count !== 1) return;
  const discount = await tx.discount.findUnique({ where: { storeId_code: { storeId: order.storeId, code: order.discountCode } }, select: { id: true } });
  if (discount) await tx.discount.update({ where: { id: discount.id }, data: { usedCount: { increment: 1 } } });
  else await tx.coupon.updateMany({ where: { code: order.discountCode, storeId: order.storeId }, data: { usedCount: { increment: 1 } } });
}

const EXPIRY_SELECT = {
  id: true, storeId: true, status: true, paymentMethod: true, createdAt: true, paymentDueAt: true, stockHold: true, stockReleasedAt: true,
  items: true, channel: true, logisticsDetails: true, paystackStatus: true, discountCode: true, discountReleasedAt: true,
} as const satisfies Prisma.RetailOrderSelect;

export async function expireUnpaidOrders(options: { now?: Date; storeId?: string; limit?: number } = {}): Promise<ExpiryResult> {
  const now = options.now ?? new Date();
  const windows = paymentWindows();
  const candidates = await db.retailOrder.findMany({
    where: {
      ...(options.storeId ? { storeId: options.storeId } : {}),
      status: { in: [...UNPAID_STATUSES] },
      stockReleasedAt: null,
      AND: [
        { OR: [{ paymentMethod: null }, { paymentMethod: { in: [...EXPIRING_METHODS] } }] },
        // Past the deadline checkout saved, or (older orders) past the method's window from when it was placed.
        {
          OR: [
            { paymentDueAt: { lte: now } },
            { paymentDueAt: null, OR: [{ paymentMethod: null }, { paymentMethod: { in: [...CARD_METHODS] } }], createdAt: { lte: expiryCutoff(now, windows.cardMinutes) } },
            { paymentDueAt: null, paymentMethod: { in: [...OFFLINE_EXPIRING_METHODS] }, createdAt: { lte: expiryCutoff(now, windows.transferMinutes) } },
          ],
        },
        // Holds stock: a saved hold, or a checkout order from before holds were saved (recorded sales save
        // paystackStatus null and are left alone; isLegacyCheckoutOrder checks the rest).
        { OR: [{ stockHold: { not: Prisma.DbNull } }, { stockHold: { equals: Prisma.DbNull }, paystackStatus: { not: null } }] },
      ],
    },
    orderBy: { createdAt: "asc" },
    take: options.limit ?? 200,
    select: EXPIRY_SELECT,
  });

  const orderIds: string[] = [];
  for (const order of candidates) {
    if (!isExpirableOrder(order, now, windows)) continue;
    const holds = orderStockHolds(order);
    const legacy = isLegacyCheckoutOrder(order);
    try {
      const expired = await db.$transaction(async (tx) => {
        const moved = await tx.retailOrder.updateMany({
          where: { id: order.id, status: { in: [...UNPAID_STATUSES] }, stockReleasedAt: null },
          // An older order keeps the hold it gave back, so a late payment can take the same stock again.
          data: { status: "cancelled", expiredAt: now, stockReleasedAt: now, ...(legacy ? { stockHold: JSON.parse(JSON.stringify(holds)) } : {}) },
        });
        if (moved.count !== 1) return false; // paid (or moved) a moment ago: leave it
        await releaseStock(tx, holds);
        await restoreDiscountUse(tx, order, order.status, now);
        return true;
      });
      if (expired) orderIds.push(order.id);
    } catch (error) {
      console.error(`[order expiry] could not expire order ${order.id}`, error);
    }
  }
  if (orderIds.length) console.info(`[order expiry] expired ${orderIds.length} unpaid order(s)`, orderIds);
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
 * order paid; otherwise keep it cancelled, flag it (paymentIssue) and refund it: automatically through Paystack for
 * card payments, else the seller is told to refund by hand (refunds.server.ts, once per order).
 */
export async function recoverExpiredOrderPayment(orderId: string, payment: { reference?: string | null; paymentMethod?: string | null } = {}): Promise<LatePaymentOutcome> {
  const order = await db.retailOrder.findUnique({
    where: { id: orderId },
    select: {
      id: true, storeId: true, orderNumber: true, status: true, expiredAt: true, paymentMethod: true, createdAt: true, paymentDueAt: true,
      stockHold: true, items: true, channel: true, logisticsDetails: true, paystackStatus: true, discountCode: true, refundStatus: true,
    },
  });
  if (!order || order.status !== "cancelled" || !order.expiredAt) return "not_expired";
  // A refund already started (a replayed event): nothing more to do.
  if (order.refundStatus) return "needs_refund";
  const holds = orderStockHolds(order);
  const paidData = {
    paystackStatus: "success",
    ...(payment.reference ? { paystackRef: payment.reference } : {}),
    ...(payment.paymentMethod ? { paymentMethod: payment.paymentMethod } : {}),
  };

  try {
    const reinstated = await db.$transaction(async (tx) => {
      const moved = await tx.retailOrder.updateMany({
        where: { id: order.id, status: "cancelled", expiredAt: { not: null }, refundStatus: null },
        data: { ...paidData, status: "paid", stockReleasedAt: null, paymentIssue: null },
      });
      if (moved.count !== 1) return false;
      await reserveStock(tx, order.storeId, holds);
      await retakeDiscountUse(tx, order);
      return true;
    });
    if (!reinstated) return "not_expired";
    console.warn(`[order expiry] order ${order.orderNumber} was paid after it expired; stock was still there, so it is paid again`);
    await ensureSupplierOrdersSafely(order.id);
    await confirmOrderSplit(order.id).catch((error) => console.error(`[order expiry] split balance for ${order.id} failed`, error));
    return "reinstated";
  } catch (error) {
    if (!(error instanceof InsufficientStockError)) throw error;
    const window = windowInWords(Math.round(((order.paymentDueAt?.getTime() ?? order.expiredAt.getTime()) - order.createdAt.getTime()) / 60_000));
    const issue = `Paid after the order expired (unpaid for over ${window}) and the stock had sold: ${error.message.replace(/^Insufficient stock for /, "")}. Refund the buyer.`;
    await db.retailOrder.updateMany({ where: { id: order.id, status: "cancelled", refundStatus: null }, data: { ...paidData, paymentIssue: issue.slice(0, 500) } });
    console.warn(`[order expiry] order ${order.orderNumber} paid after expiry with no stock left: refunding`);
    // Claims the refund once; a replayed event gets "skipped" and refunds nothing.
    await refundLatePayment(order.id);
    return "needs_refund";
  }
}

/**
 * The seller cancelled an order before it went out: give back the stock checkout took for it, once (stockReleasedAt
 * is the guard). Orders from before holds were saved give back what checkout took then.
 */
export async function releaseOrderStock(orderId: string) {
  const order = await db.retailOrder.findUnique({
    where: { id: orderId },
    select: { id: true, stockHold: true, stockReleasedAt: true, items: true, channel: true, logisticsDetails: true, paystackStatus: true },
  });
  if (!order || order.stockReleasedAt) return false;
  const holds = orderStockHolds(order);
  if (!holds.length) return false;
  const legacy = isLegacyCheckoutOrder(order);
  return db.$transaction(async (tx) => {
    const claimed = await tx.retailOrder.updateMany({
      where: { id: order.id, stockReleasedAt: null },
      data: { stockReleasedAt: new Date(), ...(legacy ? { stockHold: JSON.parse(JSON.stringify(holds)) } : {}) },
    });
    if (claimed.count !== 1) return false;
    // Read the hold again under the claim: a supplier order that ran out of time may have just given back its
    // own lines and taken them off the hold (src/lib/supplier-orders/acceptance.server.ts).
    const fresh = legacy ? null : await tx.retailOrder.findUnique({ where: { id: order.id }, select: { stockHold: true } });
    await releaseStock(tx, fresh ? parseStockHold(fresh.stockHold) : holds);
    return true;
  });
}

/** The seller cancelled an order that was never paid: its discount use goes back, once. */
export async function releaseOrderDiscount(order: { id: string; storeId: string; discountCode: string | null; discountReleasedAt?: Date | null }, statusBefore: string) {
  if (!shouldRestoreDiscount(order, statusBefore)) return false;
  return db.$transaction((tx) => restoreDiscountUse(tx, order, statusBefore));
}
