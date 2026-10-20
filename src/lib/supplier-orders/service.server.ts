import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { createNotification } from "@/lib/notifications/create";
import { acceptByFor, messageSupplierPhone } from "./deadline.server";
import {
  groupDropshipLines,
  plainText,
  readyForSuppliers,
  supplierOrderKey,
  supplierOrderRef,
  supplierOrderStatusAfter,
  type DropshipLink,
  type SupplierAction,
  type SupplierOrderLine,
} from "./pure";

// Dropship orders for suppliers (SupplierOrder). A seller's store order with dropshipped products becomes one
// supplier order per supplier once it's paid (webhook, payment return page, seller marking it paid) or placed
// with pay on delivery. The supplier accepts, ships with a tracking code, marks delivered, or declines with a
// reason; the seller's store order follows (src/lib/supplier-orders/pure.ts has the rules).

/** What a supplier sees when they try to accept an order whose time ran out. */
export const TIME_RAN_OUT = "Time ran out on this order, so the shop was told. Don't send it.";

export type ServiceResult<T> = { ok: true; data: T } | { ok: false; code: "NOT_FOUND" | "CONFLICT" | "BAD_REQUEST"; message: string };

function money(amount: number, currency: string) {
  if (currency === "NGN") return `₦${Math.round(amount).toLocaleString("en-NG")}`;
  return `${currency} ${Math.round(amount).toLocaleString("en-NG")}`;
}

function isUniqueViolation(error: unknown) {
  return typeof error === "object" && error !== null && (error as { code?: unknown }).code === "P2002";
}

/**
 * Creates the supplier orders for a store order's dropship lines, once. Safe to call on every payment event:
 * the unique idempotency key means a replayed webhook (or two racing ones) can't make a second order, and only
 * the call that created an order notifies the supplier.
 */
export async function ensureSupplierOrders(retailOrderId: string): Promise<{ created: number }> {
  const order = await db.retailOrder.findUnique({
    where: { id: retailOrderId },
    select: {
      id: true, storeId: true, status: true, paymentMethod: true, items: true, deliveryAddress: true, buyerName: true, buyerPhone: true,
      currency: true, orderNumber: true, store: { select: { userId: true, name: true } },
    },
  });
  if (!order || !readyForSuppliers(order)) return { created: 0 };

  const productIds = [...new Set((Array.isArray(order.items) ? order.items : []).map((item) => (item as { productId?: unknown })?.productId).filter((id): id is string => typeof id === "string"))];
  if (!productIds.length) return { created: 0 };
  const products = await db.storeProduct.findMany({
    where: { storeId: order.storeId, id: { in: productIds }, fulfillmentType: "dropship", supplierProductId: { not: null } },
    select: { id: true, supplierProduct: { select: { id: true, supplierId: true, wholesalePrice: true, images: true } } },
  });
  const links = new Map<string, DropshipLink>();
  for (const product of products) {
    if (!product.supplierProduct) continue;
    links.set(product.id, {
      supplierId: product.supplierProduct.supplierId,
      supplierProductId: product.supplierProduct.id,
      unitCost: product.supplierProduct.wholesalePrice,
      image: product.supplierProduct.images[0] ?? null,
    });
  }
  const { groups } = groupDropshipLines(order.items, links);
  if (!groups.length) return { created: 0 };

  // Already sent (a replayed event): skip without touching the unique index; a true race still hits it below.
  const existing = await db.supplierOrder.findMany({
    where: { idempotencyKey: { in: groups.map((group) => supplierOrderKey(order.id, group.supplierId)) } },
    select: { idempotencyKey: true },
  });
  const sent = new Set(existing.map((row) => row.idempotencyKey));

  // Each supplier has a deadline to accept (4 hours unless set otherwise): see acceptance.server.ts.
  const supplierRows = await db.supplier.findMany({
    where: { id: { in: groups.map((group) => group.supplierId) } },
    select: { id: true, userId: true, acceptHoursDropship: true, acceptHoursWholesale: true },
  });
  const now = new Date();
  const deadlines = new Map(supplierRows.map((row) => [row.id, acceptByFor("dropship", row, now)]));

  const created: Array<{ id: string; supplierId: string; items: SupplierOrderLine[]; costTotal: number }> = [];
  for (const group of groups) {
    if (sent.has(supplierOrderKey(order.id, group.supplierId))) continue;
    try {
      const row = await db.supplierOrder.create({
        data: {
          idempotencyKey: supplierOrderKey(order.id, group.supplierId),
          supplierId: group.supplierId,
          retailOrderId: order.id,
          storeId: order.storeId,
          sellerId: order.store.userId,
          items: group.items as unknown as Prisma.InputJsonValue,
          costTotal: group.costTotal,
          currency: order.currency,
          shippingAddress: (order.deliveryAddress ?? {}) as Prisma.InputJsonValue,
          recipientName: order.buyerName,
          recipientPhone: order.buyerPhone,
          acceptBy: (deadlines.get(group.supplierId) ?? acceptByFor("dropship", null, now)).acceptBy,
        },
        select: { id: true },
      });
      created.push({ id: row.id, ...group });
    } catch (error) {
      if (isUniqueViolation(error)) continue; // already sent to this supplier
      throw error;
    }
  }

  if (created.length) {
    const suppliers = supplierRows;
    const shop = plainText(order.store.name) || "A shop";
    const address = order.deliveryAddress && typeof order.deliveryAddress === "object" ? (order.deliveryAddress as Record<string, unknown>) : {};
    const place = plainText([address.city, address.state].filter((part) => typeof part === "string" && part).join(", "), 60);
    const pod = order.paymentMethod === "pay_on_delivery" && ["pending", "awaiting_payment"].includes(order.status);
    await Promise.allSettled(
      created.map((row) => {
        const supplier = suppliers.find((item) => item.id === row.supplierId);
        if (!supplier) return Promise.resolve(null);
        const units = row.items.reduce((sum, item) => sum + item.quantity, 0);
        const within = deadlines.get(row.supplierId)?.words ?? "4 hours";
        const ref = supplierOrderRef(row.id);
        void messageSupplierPhone(row.supplierId, `Shopinbos: new order ${ref} from ${shop}. You get ${money(row.costTotal, order.currency)}. Accept it within ${within} in the app.`);
        return createNotification({
          userId: supplier.userId,
          type: "dropshipping",
          priority: "warning",
          title: `New dropship order ${ref} from ${shop}: accept within ${within}`,
          description: `${shop} sold ${units} ${units === 1 ? "piece" : "pieces"} for you${place ? `, going to ${place}` : ""}. You get ${money(row.costTotal, order.currency)}.${pod ? " The customer pays the rider when it arrives." : ""} Accept it within ${within}, or the shop will be told you didn't answer.`,
          link: `/supplier/orders/${row.id}`,
          actionLabel: "Accept order",
          actionUrl: `/supplier/orders/${row.id}`,
          metadata: { supplierOrderId: row.id, retailOrderId: order.id },
          sendEmail: true,
          event: "supplier_order.new",
          dedupeKey: `supplier_order.new:${row.id}`,
          phoneHandled: true,
        });
      }),
    );
  }
  return { created: created.length };
}

/** Never let a supplier-order problem break a payment webhook or checkout: log it and carry on. */
export async function ensureSupplierOrdersSafely(retailOrderId: string) {
  // Every place an order goes live calls this, so the shop's own parcel goes to its delivery partner here too
  // (logistics marketplace; idempotent, never throws).
  const deliveries = import("@/lib/delivery-market/jobs.server").then((jobs) => jobs.dispatchOrderDeliveriesSafely(retailOrderId)).catch(() => undefined);
  try {
    return await ensureSupplierOrders(retailOrderId);
  } catch (error) {
    console.error(`[supplier orders] could not create for order ${retailOrderId}`, error);
    return { created: 0 };
  } finally {
    await deliveries;
  }
}

/** The seller cancelled the store order: suppliers stop (anything already shipped stays as it is). */
export async function cancelSupplierOrdersFor(retailOrderId: string) {
  // The shop's delivery-partner jobs not yet picked up stop too.
  await import("@/lib/delivery-market/jobs.server").then((jobs) => jobs.cancelOrderDeliveries(retailOrderId)).catch(() => undefined);
  const open = await db.supplierOrder.findMany({
    where: { retailOrderId, status: { in: ["pending", "accepted"] } },
    select: { id: true, status: true, supplier: { select: { userId: true } } },
  });
  for (const row of open) {
    const moved = await db.supplierOrder.updateMany({ where: { id: row.id, status: row.status }, data: { status: "cancelled" } });
    if (moved.count === 1) {
      await createNotification({
        userId: row.supplier.userId,
        type: "dropshipping",
        priority: "warning",
        title: `Dropship order ${supplierOrderRef(row.id)} was cancelled`,
        description: "The shop cancelled this order. Don't ship it.",
        link: "/supplier/orders?kind=dropship",
        sendEmail: true,
        event: "supplier_order.cancelled",
        dedupeKey: `supplier_order.cancelled:${row.id}`,
      }).catch(() => null);
    }
  }
}

// ─── Supplier moves a dropship order ─────────────────────────────────────────

export interface MoveInput {
  supplierId: string;
  orderId: string;
  action: SupplierAction;
  trackingCode?: string | null;
  carrier?: string | null;
  reason?: string | null;
}

export async function moveSupplierOrder(input: MoveInput): Promise<ServiceResult<{ id: string; status: string }>> {
  const order = await db.supplierOrder.findFirst({
    where: { id: input.orderId, supplierId: input.supplierId },
    select: { id: true, status: true, retailOrderId: true, storeId: true, sellerId: true, trackingCode: true, supplier: { select: { displayName: true } }, retailOrder: { select: { orderNumber: true } } },
  });
  if (!order) return { ok: false, code: "NOT_FOUND", message: "Order not found" };
  if (order.status === "expired") return { ok: false, code: "CONFLICT", message: TIME_RAN_OUT };
  const next = supplierOrderStatusAfter(order.status, input.action);
  if (!next) return { ok: false, code: "CONFLICT", message: "This order has already moved on. Refresh to see where it is." };
  const reason = input.reason?.trim();
  if (input.action === "reject" && (!reason || reason.length < 3)) return { ok: false, code: "BAD_REQUEST", message: "Say why you can't fill this order so the shop can tell the buyer." };

  const now = new Date();
  const trackingCode = input.trackingCode?.trim() || null;
  const data: Prisma.SupplierOrderUpdateManyMutationInput = { status: next };
  if (next === "accepted") data.acceptedAt = now;
  if (next === "shipped") {
    data.shippedAt = now;
    if (order.status === "pending") data.acceptedAt = now;
    if (trackingCode) data.trackingCode = trackingCode;
    if (input.carrier?.trim()) data.carrier = input.carrier.trim();
  }
  if (next === "delivered") data.deliveredAt = now;
  if (next === "rejected") {
    data.rejectedAt = now;
    data.rejectReason = reason!.slice(0, 500);
  }
  // Only if nobody moved it in the meantime.
  const moved = await db.supplierOrder.updateMany({ where: { id: order.id, supplierId: input.supplierId, status: order.status }, data });
  if (moved.count !== 1) {
    // The acceptance cron may have expired it a moment before.
    const current = await db.supplierOrder.findUnique({ where: { id: order.id }, select: { status: true } });
    return { ok: false, code: "CONFLICT", message: current?.status === "expired" ? TIME_RAN_OUT : "This order has already moved on. Refresh to see where it is." };
  }

  await syncRetailOrder(order.retailOrderId, next === "shipped" ? trackingCode ?? order.trackingCode : null).catch((error) => {
    console.error(`[supplier orders] could not move store order ${order.retailOrderId}`, error);
  });

  const supplierName = plainText(order.supplier.displayName) || "Your supplier";
  const ref = order.retailOrder.orderNumber;
  const note = {
    accepted: { title: `${supplierName} accepted order ${ref}`, description: `${supplierName} is preparing the dropship items on order ${ref}.`, priority: "info" as const },
    shipped: { title: `${supplierName} shipped order ${ref}`, description: `The dropship items on order ${ref} are on their way.${trackingCode ? ` Tracking: ${plainText(trackingCode, 80)}.` : ""}`, priority: "success" as const },
    delivered: { title: `Order ${ref} was delivered`, description: `${supplierName} marked the dropship items on order ${ref} as delivered.`, priority: "success" as const },
    rejected: { title: `${supplierName} can't fill order ${ref}`, description: `${supplierName} declined the dropship items on order ${ref}: "${plainText(reason, 300)}". Contact the buyer, then refund or replace the items.`, priority: "critical" as const },
    pending: null,
    cancelled: null,
    expired: null,
  }[next];
  if (note && (next === "shipped" || next === "delivered")) {
    // "2 of 3 parcels sent": the seller sees where the whole order is.
    const { sellerPartsView } = await import("./parts.server");
    const parts = await sellerPartsView(order.retailOrderId, order.storeId).catch(() => null);
    if (parts?.line) note.description = `${note.description} ${parts.line}.`;
  }
  if (note) {
    await createNotification({
      userId: order.sellerId,
      type: "dropshipping",
      priority: note.priority,
      title: note.title,
      description: note.description,
      link: `/home/orders/${order.retailOrderId}`,
      sendEmail: next === "rejected" || next === "shipped",
      event: next === "accepted" ? "supplier.accepted" : next === "rejected" ? "supplier.declined" : "supplier.update",
      dedupeKey: `supplier.${next}:${order.id}`,
    }).catch(() => null);
  }
  return { ok: true, data: { id: order.id, status: next } };
}

/**
 * Moves the seller's store order along with its parcels (only forward; shared/order-parts.ts has the rules): shipped
 * once every parcel has left, delivered once every parcel arrived. Locked and idempotent (parts.server.ts).
 */
export async function syncRetailOrder(retailOrderId: string, _trackingCode?: string | null) {
  void _trackingCode;
  const { recomputeOrderStatus } = await import("./parts.server");
  return recomputeOrderStatus(retailOrderId);
}
