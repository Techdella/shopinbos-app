import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { createNotification } from "@/lib/notifications/create";
import { parsePricingTiers, tierPrice } from "@/lib/marketplace/find";
import { SELLER_CANCELLABLE_WHOLESALE, SELLER_CANCEL_PREFIX, plainText, wholesaleReleasesStock, wholesaleReservation, wholesaleStatusAfter, type SupplierAction } from "./pure";
import type { ServiceResult } from "./service.server";
import { acceptByFor, messageSupplierPhone } from "./deadline.server";

// Wholesale orders: a seller buys stock from a supplier (at least the minimum order, at the supplier's price tier
// for the quantity). There's no payment rail for this yet: the supplier sends an invoice and the seller pays them
// directly. Used by POST /api/app/wholesale/request and the marketplace "Buy wholesale" button.

export const WHOLESALE_PAYMENT_NOTE = "The supplier confirms first. Then pay in Shopinbos by card (straight to their bank), or pay them directly against their invoice.";

export interface PlaceWholesaleInput {
  sellerId: string;
  supplierProductId: string;
  supplierId?: string;
  quantity: number;
  deliveryAddress: string;
  notes?: string | null;
}

function money(amount: number, currency: string) {
  return currency === "NGN" ? `₦${Math.round(amount).toLocaleString("en-NG")}` : `${currency} ${Math.round(amount).toLocaleString("en-NG")}`;
}

export function wholesaleRef(id: string) {
  return `PO-${id.slice(-6).toUpperCase()}`;
}

export async function placeWholesaleOrder(input: PlaceWholesaleInput): Promise<ServiceResult<Prisma.WholesaleOrderGetPayload<{ include: { supplierProduct: { select: { id: true; name: true; images: true } } } }>>> {
  // Paused for money long overdue (src/lib/money-owed): no new business until it's paid.
  const buyer = await db.user.findUnique({ where: { id: input.sellerId }, select: { debtPausedAt: true } });
  if (buyer?.debtPausedAt) return { ok: false, code: "CONFLICT", message: "Pay what you owe in your Shopinbos Wallet before placing new wholesale orders." };
  const product = await db.supplierProduct.findFirst({
    where: {
      id: input.supplierProductId,
      ...(input.supplierId ? { supplierId: input.supplierId } : {}),
      status: "published",
      bulkOrderAvailable: true,
      supplier: { status: "active", verificationStatus: "verified", user: { debtPausedAt: null } },
    },
    include: { supplier: { select: { id: true, userId: true, displayName: true, acceptHoursDropship: true, acceptHoursWholesale: true } } },
  });
  if (!product) return { ok: false, code: "NOT_FOUND", message: "This product isn't available to buy wholesale." };
  if (product.supplier.userId === input.sellerId) return { ok: false, code: "BAD_REQUEST", message: "You can't order your own product." };
  const moq = Math.max(1, product.moq);
  if (input.quantity < moq) return { ok: false, code: "BAD_REQUEST", message: `The minimum order is ${moq.toLocaleString("en-NG")}.` };
  const short = (stock: number) => ({ ok: false as const, code: "BAD_REQUEST" as const, message: `${plainText(product.supplier.displayName)} has ${stock.toLocaleString("en-NG")} in stock. Lower the quantity or request a quote.` });
  const reservation = wholesaleReservation(product.stockQuantity, input.quantity);
  if ("short" in reservation) return short(product.stockQuantity);

  const unitPrice = tierPrice(parsePricingTiers(product.pricingTiers), input.quantity, product.wholesalePrice);
  const totalPrice = Math.round(unitPrice * input.quantity * 100) / 100;
  // The supplier has 24 hours to accept a bulk order unless set otherwise (acceptance.server.ts).
  const deadline = acceptByFor("wholesale", product.supplier);
  // The units are reserved as the order is made (conditionally, so two sellers can't take the same stock and it
  // never goes below zero). They go back if the supplier declines or the seller cancels.
  const order = await db.$transaction(async (tx) => {
    if (reservation.reserve > 0) {
      const taken = await tx.supplierProduct.updateMany({
        where: { id: product.id, status: "published", stockQuantity: { gte: reservation.reserve } },
        data: { stockQuantity: { decrement: reservation.reserve } },
      });
      if (taken.count !== 1) return null;
    }
    return tx.wholesaleOrder.create({
      data: {
        stockReserved: reservation.reserve,
        sellerId: input.sellerId,
        supplierId: product.supplierId,
        supplierProductId: product.id,
        quantity: input.quantity,
        unitPrice,
        totalPrice,
        currency: product.currency,
        deliveryAddress: input.deliveryAddress.trim(),
        notes: input.notes?.trim() || null,
        acceptBy: deadline.acceptBy,
      },
      include: { supplierProduct: { select: { id: true, name: true, images: true } } },
    });
  });
  if (!order) {
    // Someone else took the stock a moment ago.
    const fresh = await db.supplierProduct.findUnique({ where: { id: product.id }, select: { stockQuantity: true } });
    return short(fresh?.stockQuantity ?? 0);
  }

  await createNotification({
    userId: product.supplier.userId,
    type: "suppliers",
    priority: "warning",
    title: `New wholesale order ${wholesaleRef(order.id)}: accept within ${deadline.words}`,
    description: `A shop wants ${input.quantity.toLocaleString("en-NG")} × ${plainText(product.name)} (${money(totalPrice, product.currency)}). Accept it within ${deadline.words} and send them your invoice; they pay you directly.`,
    link: `/supplier/orders/${order.id}?kind=wholesale`,
    actionLabel: "Accept order",
    actionUrl: `/supplier/orders/${order.id}?kind=wholesale`,
    metadata: { wholesaleOrderId: order.id },
    sendEmail: true,
    event: "supplier_order.new",
    dedupeKey: `supplier_order.new:wholesale:${order.id}`,
  }).catch(() => null);

  await messageSupplierPhone(product.supplierId, `Shopinbos: a shop wants ${input.quantity.toLocaleString("en-NG")} × ${plainText(product.name, 60)} (${money(totalPrice, product.currency)}). Accept it within ${deadline.words} in the app.`);

  return { ok: true, data: order };
}

export interface MoveWholesaleInput {
  supplierId: string;
  orderId: string;
  action: SupplierAction;
  trackingCode?: string | null;
  reason?: string | null;
}

export async function moveWholesaleOrder(input: MoveWholesaleInput): Promise<ServiceResult<{ id: string; status: string }>> {
  const order = await db.wholesaleOrder.findFirst({
    where: { id: input.orderId, supplierId: input.supplierId },
    select: { id: true, status: true, sellerId: true, quantity: true, supplierProductId: true, expiredAt: true, supplier: { select: { displayName: true } }, supplierProduct: { select: { name: true } } },
  });
  if (!order) return { ok: false, code: "NOT_FOUND", message: "Order not found" };
  if (order.expiredAt) return { ok: false, code: "CONFLICT", message: "Time ran out on this order, so the shop was told. Don't send it." };
  const next = wholesaleStatusAfter(order.status, input.action);
  if (!next) return { ok: false, code: "CONFLICT", message: "This order has already moved on. Refresh to see where it is." };
  const reason = input.reason?.trim();
  if (input.action === "reject" && (!reason || reason.length < 3)) return { ok: false, code: "BAD_REQUEST", message: "Say why you can't fill this order." };

  const now = new Date();
  const trackingCode = input.trackingCode?.trim() || null;
  const data: Prisma.WholesaleOrderUpdateManyMutationInput = { status: next };
  if (next === "shipped") {
    data.shippedAt = now;
    if (trackingCode) data.trackingCode = trackingCode;
  }
  if (next === "delivered") data.deliveredAt = now;
  if (next === "cancelled") data.rejectReason = reason!.slice(0, 500);
  // Only if nobody moved it in the meantime; a decline gives the reserved stock back in the same transaction.
  const moved = await db.$transaction(async (tx) => {
    const result = await tx.wholesaleOrder.updateMany({ where: { id: order.id, supplierId: input.supplierId, status: order.status }, data });
    if (result.count === 1 && wholesaleReleasesStock(next)) await releaseWholesaleStock(tx, order.id);
    return result;
  });
  if (moved.count !== 1) return { ok: false, code: "CONFLICT", message: "This order has already moved on. Refresh to see where it is." };

  const supplierName = plainText(order.supplier.displayName) || "Your supplier";
  const what = `${order.quantity.toLocaleString("en-NG")} × ${plainText(order.supplierProduct.name)}`;
  const note = {
    confirmed: { title: `${supplierName} confirmed your wholesale order`, description: `${what}. Pay in Shopinbos by card (straight to their bank), or pay them against their invoice.`, priority: "info" as const },
    shipped: { title: `${supplierName} shipped your wholesale order`, description: `${what} is on its way.${trackingCode ? ` Tracking: ${plainText(trackingCode, 80)}.` : ""}`, priority: "success" as const },
    delivered: { title: "Wholesale order delivered", description: `${supplierName} marked ${what} as delivered. Add the units to your stock.`, priority: "success" as const },
    cancelled: { title: `${supplierName} declined your wholesale order`, description: `${what}: "${plainText(reason, 300)}"`, priority: "warning" as const },
  }[next];
  await createNotification({
    userId: order.sellerId,
    type: "suppliers",
    priority: note.priority,
    title: note.title,
    description: note.description,
    link: `/marketplace/product/${order.supplierProductId}`,
    sendEmail: next !== "delivered",
    event: next === "confirmed" ? "supplier.accepted" : next === "cancelled" ? "supplier.declined" : "supplier.update",
    dedupeKey: `supplier.${next}:wholesale:${order.id}`,
  }).catch(() => null);
  return { ok: true, data: { id: order.id, status: next } };
}

/**
 * Gives back the supplier stock a wholesale order reserved, once: stockReleasedAt is claimed with a conditional
 * update first, so a retried decline or cancel can't add it twice. Orders that reserved nothing are left alone.
 */
export async function releaseWholesaleStock(tx: Prisma.TransactionClient, orderId: string) {
  const order = await tx.wholesaleOrder.findUnique({ where: { id: orderId }, select: { id: true, supplierProductId: true, stockReserved: true, stockReleasedAt: true } });
  if (!order || order.stockReleasedAt || order.stockReserved <= 0) return false;
  const claimed = await tx.wholesaleOrder.updateMany({ where: { id: order.id, stockReleasedAt: null, stockReserved: { gt: 0 } }, data: { stockReleasedAt: new Date() } });
  if (claimed.count !== 1) return false;
  await tx.supplierProduct.updateMany({ where: { id: order.supplierProductId }, data: { stockQuantity: { increment: order.stockReserved } } });
  return true;
}

/** The seller cancels a wholesale order before the supplier starts packing it; the reserved stock goes back. */
export async function cancelWholesaleOrder(input: { sellerId: string; orderId: string; reason?: string | null }): Promise<ServiceResult<{ id: string; status: string }>> {
  const order = await db.wholesaleOrder.findFirst({
    where: { id: input.orderId, sellerId: input.sellerId },
    select: { id: true, status: true, quantity: true, supplier: { select: { userId: true } }, supplierProduct: { select: { name: true } } },
  });
  if (!order) return { ok: false, code: "NOT_FOUND", message: "Order not found" };
  if (order.status === "cancelled") return { ok: false, code: "CONFLICT", message: "This order is already cancelled." };
  if (!(SELLER_CANCELLABLE_WHOLESALE as readonly string[]).includes(order.status)) {
    return { ok: false, code: "CONFLICT", message: "The supplier is already packing or has sent this order. Contact them to cancel it." };
  }
  const reason = input.reason?.trim().slice(0, 500) || null;
  const moved = await db.$transaction(async (tx) => {
    const result = await tx.wholesaleOrder.updateMany({
      where: { id: order.id, sellerId: input.sellerId, status: { in: [...SELLER_CANCELLABLE_WHOLESALE] } },
      // Always marked, so the seller's list can tell their own cancel from a supplier's decline.
      data: { status: "cancelled", rejectReason: (reason ? `${SELLER_CANCEL_PREFIX}: ${reason}` : `${SELLER_CANCEL_PREFIX}.`).slice(0, 500) },
    });
    if (result.count === 1) await releaseWholesaleStock(tx, order.id);
    return result;
  });
  if (moved.count !== 1) return { ok: false, code: "CONFLICT", message: "This order has already moved on. Refresh to see where it is." };
  await createNotification({
    userId: order.supplier.userId,
    type: "suppliers",
    priority: "warning",
    title: `Wholesale order ${wholesaleRef(order.id)} was cancelled`,
    description: `The seller cancelled ${order.quantity.toLocaleString("en-NG")} × ${plainText(order.supplierProduct.name)}. Don't send it.${reason ? ` "${plainText(reason, 300)}"` : ""}`,
    link: "/supplier/orders?kind=wholesale",
    sendEmail: true,
    event: "supplier_order.cancelled",
    dedupeKey: `supplier_order.cancelled:wholesale:${order.id}`,
  }).catch(() => null);
  return { ok: true, data: { id: order.id, status: "cancelled" } };
}
