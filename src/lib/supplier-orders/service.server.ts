import { podFeeDue } from "@shared/pay-at-door";
import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { createNotification } from "@/lib/notifications/create";
import { acceptByFor, messageSupplierPhone } from "./deadline.server";
import { makeDeliveryCode } from "@/lib/logistics/job-rules";
import { readDeliveryPlan, supplierSelfShipments } from "@shared/delivery-market";
import { brandingOfferFor, dropshipUnitPrice, effectiveBranding, readBrandingOffer, type BrandingChoice } from "@shared/dropship-rules";
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
      currency: true, orderNumber: true, logisticsDetails: true, store: { select: { userId: true, name: true } },
      depositKobo: true, balanceKobo: true, balancePaidAt: true, paymentDueAt: true, depositPaidAt: true,
    },
  });
  if (!order || !readyForSuppliers(order)) return { created: 0 };
  // Parcels the customer chose the supplier's own delivery for: the supplier delivers it, earns the fee and gets
  // the customer's code on arrival (shared/delivery-market.ts selfDeliveryPart).
  const plan = readDeliveryPlan(order.logisticsDetails);
  const selfFee = new Map((plan ? supplierSelfShipments(plan) : []).map((part) => [part.shipmentKey.slice("supplier:".length), part.price]));

  const productIds = [...new Set((Array.isArray(order.items) ? order.items : []).map((item) => (item as { productId?: unknown })?.productId).filter((id): id is string => typeof id === "string"))];
  if (!productIds.length) return { created: 0 };
  const products = await db.storeProduct.findMany({
    where: { storeId: order.storeId, id: { in: productIds }, fulfillmentType: "dropship", supplierProductId: { not: null } },
    select: {
      id: true, sku: true, barcode: true, brandingChoice: true,
      supplierProduct: { select: { id: true, supplierId: true, wholesalePrice: true, priceMode: true, dropshipPrice: true, images: true } },
    },
  });
  const links = new Map<string, DropshipLink>();
  for (const product of products) {
    if (!product.supplierProduct) continue;
    links.set(product.id, {
      supplierId: product.supplierProduct.supplierId,
      supplierProductId: product.supplierProduct.id,
      // What the seller pays per piece sent to their customer (the dropship price when it has its own).
      unitCost: dropshipUnitPrice(product.supplierProduct),
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
    select: { id: true, userId: true, acceptHoursDropship: true, acceptHoursWholesale: true, level: true, brandingOffer: true },
  });
  const now = new Date();
  const deadlines = new Map(supplierRows.map((row) => [row.id, acceptByFor("dropship", row, now)]));
  // Pack it the seller's way (shared/dropship-rules.ts): the shop's name and logo, the branding the seller chose for
  // these products (falling back to blind when the supplier doesn't offer it) and the seller's own SKUs.
  const storeBrand = await db.store.findUnique({ where: { id: order.storeId }, select: { logoUrl: true } }).catch(() => null);
  const brandingFor = (supplierId: string, lines: SupplierOrderLine[]) => {
    const supplier = supplierRows.find((row) => row.id === supplierId);
    const offer = brandingOfferFor(supplier?.level, readBrandingOffer(supplier?.brandingOffer));
    const chosen = lines.map((line) => products.find((product) => product.id === line.storeProductId)).filter((product) => product !== undefined);
    const rank: Record<string, number> = { stickers: 2, packing_slip: 1 };
    const wanted = chosen.map((product) => product.brandingChoice as BrandingChoice).sort((a, b) => (rank[b] ?? 0) - (rank[a] ?? 0))[0];
    const { choice, fee } = effectiveBranding(wanted, offer);
    return {
      sellerName: plainText(order.store.name, 80) || "The shop",
      logoUrl: storeBrand?.logoUrl ?? null,
      choice,
      fee,
      skus: [...new Set(chosen.map((product) => (product.sku || product.barcode || "").trim()).filter(Boolean))].slice(0, 20),
    };
  };

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
          branding: brandingFor(group.supplierId, group.items) as unknown as Prisma.InputJsonValue,
          ...(selfFee.has(group.supplierId) ? { selfDelivery: true, deliveryFee: selfFee.get(group.supplierId)!, deliveryCode: makeDeliveryCode() } : {}),
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
        // Awaited with the bell/email/push so a serverless function can't end before the WhatsApp or SMS goes out
        // (it never throws).
        const phone = messageSupplierPhone(row.supplierId, `Shopinbos: new order ${ref} from ${shop}. You get ${money(row.costTotal, order.currency)}. Accept it within ${within} in the app.`);
        const notice = createNotification({
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
        return Promise.all([phone, notice]);
      }),
    );
  }
  return { created: created.length };
}

/** Never let a supplier-order problem break a payment webhook or checkout: log it and carry on. */
export async function ensureSupplierOrdersSafely(retailOrderId: string) {
  // A preorder whose shopper paid a deposit and still owes the rest: nothing is sent or booked until it's paid in
  // full (store-balance.server.ts calls this again then).
  // Pay on delivery waiting for its delivery fee (shared/pay-at-door.ts): the same, until the fee is in.
  const waiting = await db.retailOrder
    .findUnique({ where: { id: retailOrderId }, select: { status: true, paymentMethod: true, depositKobo: true, balanceKobo: true, balancePaidAt: true, paymentDueAt: true, depositPaidAt: true } })
    .then((order) => Boolean(order && (((order.depositKobo ?? 0) > 0 && (order.balanceKobo ?? 0) > 0 && !order.balancePaidAt) || podFeeDue(order))))
    .catch(() => false);
  if (waiting) return { created: 0 };
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

/** The carrier saved on a parcel the supplier delivers itself. */
export const SELF_DELIVERY_CARRIER = "Supplier's own delivery";

export interface MoveInput {
  supplierId: string;
  orderId: string;
  action: SupplierAction;
  trackingCode?: string | null;
  carrier?: string | null;
  reason?: string | null;
  /** The customer's 4-digit code, to mark a parcel the supplier delivers itself as delivered. */
  deliveryCode?: string | null;
}

export async function moveSupplierOrder(input: MoveInput): Promise<ServiceResult<{ id: string; status: string }>> {
  const order = await db.supplierOrder.findFirst({
    where: { id: input.orderId, supplierId: input.supplierId },
    select: { id: true, status: true, retailOrderId: true, storeId: true, sellerId: true, trackingCode: true, selfDelivery: true, deliveryCode: true, packedAt: true, supplier: { select: { displayName: true } }, retailOrder: { select: { orderNumber: true } } },
  });
  if (!order) return { ok: false, code: "NOT_FOUND", message: "Order not found" };
  // The supplier delivers this one itself: it's delivered only with the code we texted the customer.
  if (order.selfDelivery && input.action === "deliver" && order.deliveryCode && input.deliveryCode?.trim() !== order.deliveryCode) {
    return { ok: false, code: "BAD_REQUEST", message: input.deliveryCode?.trim() ? "That code isn't right. Ask the customer to check the text we sent them." : "Enter the 4-digit code the customer gives you." };
  }
  if (order.status === "expired") return { ok: false, code: "CONFLICT", message: TIME_RAN_OUT };
  const next = supplierOrderStatusAfter(order.status, input.action);
  if (!next) return { ok: false, code: "CONFLICT", message: "This order has already moved on. Refresh to see where it is." };
  const reason = input.reason?.trim();
  if (input.action === "reject" && (!reason || reason.length < 3)) return { ok: false, code: "BAD_REQUEST", message: "Say why you can't fill this order so the shop can tell the buyer." };

  // Pack it the seller's way: a parcel that wasn't marked packed can't be sent before the checklist is done and the
  // sealed parcel photographed (src/lib/supplier-dropship.server.ts).
  if (next === "shipped" && !order.packedAt) {
    const { dropshipPackProblem } = await import("@/lib/supplier-dropship.server");
    const problem = await dropshipPackProblem(order.id);
    if (problem) return { ok: false, code: "BAD_REQUEST", message: problem };
  }

  const now = new Date();
  const trackingCode = input.trackingCode?.trim() || null;
  const data: Prisma.SupplierOrderUpdateManyMutationInput = { status: next };
  if (next === "accepted") data.acceptedAt = now;
  if (next === "shipped") {
    data.shippedAt = now;
    if (order.status === "pending") data.acceptedAt = now;
    if (trackingCode) data.trackingCode = trackingCode;
    if (input.carrier?.trim()) data.carrier = input.carrier.trim();
    if (order.selfDelivery) data.carrier = SELF_DELIVERY_CARRIER;
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
  if (data.acceptedAt) void import("@/lib/rewards/rewards.server").then((rewards) => rewards.rewardSupplierOrderAccepted(order.id)).catch(() => undefined);
  // Ship by: the products' handling time from now (shared/fault-matrix.ts); past it unsent, the customer may cancel.
  if (data.acceptedAt) await import("@/lib/faults/strikes.server").then((strikes) => strikes.setShipBy(order.id, now)).catch(() => undefined);
  // Out of stock after payment (shared/fault-matrix.ts row 1): the customer gets that part back in full, the supplier's
  // pay goes back to the shop from its next payments, and a strike.
  if (next === "rejected") await import("@/lib/faults/customer.server").then((faults) => faults.onSupplierRejected(order.id)).catch((error) => console.error(`[supplier orders] out-of-stock outcome for ${order.id}`, error));
  // Sent without "I've packed it" (the supplier delivers it itself): the seller's sticker is used here instead.
  if (next === "shipped" && !order.packedAt) await import("@/lib/supplier-dropship.server").then((pack) => pack.useSellerSticker(order.id)).catch(() => undefined);
  // A delivered order counts towards the supplier's level (New → Trusted → Established).
  if (next === "delivered") void import("@/lib/supplier-levels.server").then((levels) => levels.refreshSupplierLevel(input.supplierId)).catch(() => undefined);

  await syncRetailOrder(order.retailOrderId, next === "shipped" ? trackingCode ?? order.trackingCode : null).catch((error) => {
    console.error(`[supplier orders] could not move store order ${order.retailOrderId}`, error);
  });
  if (next === "shipped" && order.selfDelivery && order.deliveryCode) {
    const { textSelfDeliveryCode } = await import("@/lib/notifications/customer-messages");
    await textSelfDeliveryCode(order.retailOrderId, order.deliveryCode);
  }

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
