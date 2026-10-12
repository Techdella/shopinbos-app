import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { createNotification } from "@/lib/notifications/create";
import {
  groupDropshipLines,
  plainText,
  readyForSuppliers,
  retailStatusAfterSupplierUpdate,
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

  const created: Array<{ id: string; supplierId: string; items: SupplierOrderLine[]; costTotal: number }> = [];
  for (const group of groups) {
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
    const suppliers = await db.supplier.findMany({ where: { id: { in: created.map((row) => row.supplierId) } }, select: { id: true, userId: true } });
    const shop = plainText(order.store.name) || "A shop";
    const address = order.deliveryAddress && typeof order.deliveryAddress === "object" ? (order.deliveryAddress as Record<string, unknown>) : {};
    const place = plainText([address.city, address.state].filter((part) => typeof part === "string" && part).join(", "), 60);
    const pod = order.paymentMethod === "pay_on_delivery" && ["pending", "awaiting_payment"].includes(order.status);
    await Promise.allSettled(
      created.map((row) => {
        const supplier = suppliers.find((item) => item.id === row.supplierId);
        if (!supplier) return Promise.resolve(null);
        const units = row.items.reduce((sum, item) => sum + item.quantity, 0);
        return createNotification({
          userId: supplier.userId,
          type: "dropshipping",
          priority: "warning",
          title: `New dropship order ${supplierOrderRef(row.id)} from ${shop}`,
          description: `${units} ${units === 1 ? "unit" : "units"} to ship${place ? ` to ${place}` : ""}. You're owed ${money(row.costTotal, order.currency)} at wholesale.${pod ? " The buyer pays the rider on delivery." : ""} Accept it, then add the tracking code when it ships.`,
          link: "/supplier/orders?kind=dropship",
          actionLabel: "View order",
          actionUrl: "/supplier/orders?kind=dropship",
          metadata: { supplierOrderId: row.id, retailOrderId: order.id },
          sendEmail: true,
        });
      }),
    );
  }
  return { created: created.length };
}

/** Never let a supplier-order problem break a payment webhook or checkout: log it and carry on. */
export async function ensureSupplierOrdersSafely(retailOrderId: string) {
  try {
    return await ensureSupplierOrders(retailOrderId);
  } catch (error) {
    console.error(`[supplier orders] could not create for order ${retailOrderId}`, error);
    return { created: 0 };
  }
}

/** The seller cancelled the store order: suppliers stop (anything already shipped stays as it is). */
export async function cancelSupplierOrdersFor(retailOrderId: string) {
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
    select: { id: true, status: true, retailOrderId: true, sellerId: true, trackingCode: true, supplier: { select: { displayName: true } }, retailOrder: { select: { orderNumber: true } } },
  });
  if (!order) return { ok: false, code: "NOT_FOUND", message: "Order not found" };
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
  if (moved.count !== 1) return { ok: false, code: "CONFLICT", message: "This order has already moved on. Refresh to see where it is." };

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
  }[next];
  if (note) {
    await createNotification({
      userId: order.sellerId,
      type: "dropshipping",
      priority: note.priority,
      title: note.title,
      description: note.description,
      link: `/home/orders/${order.retailOrderId}`,
      sendEmail: next === "rejected" || next === "shipped",
    }).catch(() => null);
  }
  return { ok: true, data: { id: order.id, status: next } };
}

/** Moves the seller's store order along with its suppliers (only forward; see retailStatusAfterSupplierUpdate). */
export async function syncRetailOrder(retailOrderId: string, trackingCode: string | null) {
  const order = await db.retailOrder.findUnique({ where: { id: retailOrderId } });
  if (!order) return;
  const supplierOrders = await db.supplierOrder.findMany({ where: { retailOrderId }, select: { status: true, items: true, trackingCode: true } });
  const covered = new Set(supplierOrders.flatMap((row) => (Array.isArray(row.items) ? row.items : []).map((item) => String((item as { storeProductId?: unknown })?.storeProductId ?? ""))));
  const sellerLines = (Array.isArray(order.items) ? order.items : []).filter((item) => !covered.has(String((item as { productId?: unknown })?.productId ?? ""))).length;
  const target = retailStatusAfterSupplierUpdate({ retailStatus: order.status, supplierStatuses: supplierOrders.map((row) => row.status), sellerLines });
  if (!target) return;
  const store = await db.store.findUnique({ where: { id: order.storeId }, select: { id: true, name: true } });
  if (!store) return;
  const codes = [...new Set(supplierOrders.map((row) => row.trackingCode).filter((code): code is string => Boolean(code)))];
  const tracking = target === "shipped" ? (codes.length ? codes.join(", ") : trackingCode) : null;
  const { updateOrderStatus } = await import("@/lib/orders/update-status");
  await updateOrderStatus(store, order, { status: target, ...(tracking && !order.trackingCode ? { trackingCode: tracking.slice(0, 200) } : {}) });
}
