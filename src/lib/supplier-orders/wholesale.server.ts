import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { createNotification } from "@/lib/notifications/create";
import { parsePricingTiers, tierPrice } from "@/lib/marketplace/find";
import { plainText, wholesaleStatusAfter, type SupplierAction } from "./pure";
import type { ServiceResult } from "./service.server";

// Wholesale orders: a seller buys stock from a supplier (at least the minimum order, at the supplier's price tier
// for the quantity). There's no payment rail for this yet: the supplier sends an invoice and the seller pays them
// directly. Used by POST /api/app/wholesale/request and the marketplace "Buy wholesale" button.

export const WHOLESALE_PAYMENT_NOTE = "No payment is taken on Shopinbos. The supplier confirms and sends you an invoice; you pay them directly.";

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
  const product = await db.supplierProduct.findFirst({
    where: {
      id: input.supplierProductId,
      ...(input.supplierId ? { supplierId: input.supplierId } : {}),
      status: "published",
      bulkOrderAvailable: true,
      supplier: { status: "active", verificationStatus: "verified" },
    },
    include: { supplier: { select: { id: true, userId: true, displayName: true } } },
  });
  if (!product) return { ok: false, code: "NOT_FOUND", message: "This product isn't available to buy wholesale." };
  if (product.supplier.userId === input.sellerId) return { ok: false, code: "BAD_REQUEST", message: "You can't order your own product." };
  const moq = Math.max(1, product.moq);
  if (input.quantity < moq) return { ok: false, code: "BAD_REQUEST", message: `The minimum order is ${moq.toLocaleString("en-NG")}.` };
  if (product.stockQuantity > 0 && input.quantity > product.stockQuantity) {
    return { ok: false, code: "BAD_REQUEST", message: `${plainText(product.supplier.displayName)} has ${product.stockQuantity.toLocaleString("en-NG")} in stock. Lower the quantity or request a quote.` };
  }

  const unitPrice = tierPrice(parsePricingTiers(product.pricingTiers), input.quantity, product.wholesalePrice);
  const totalPrice = Math.round(unitPrice * input.quantity * 100) / 100;
  const order = await db.wholesaleOrder.create({
    data: {
      sellerId: input.sellerId,
      supplierId: product.supplierId,
      supplierProductId: product.id,
      quantity: input.quantity,
      unitPrice,
      totalPrice,
      currency: product.currency,
      deliveryAddress: input.deliveryAddress.trim(),
      notes: input.notes?.trim() || null,
    },
    include: { supplierProduct: { select: { id: true, name: true, images: true } } },
  });

  await createNotification({
    userId: product.supplier.userId,
    type: "suppliers",
    priority: "warning",
    title: `New wholesale order ${wholesaleRef(order.id)}`,
    description: `A seller ordered ${input.quantity.toLocaleString("en-NG")} × ${plainText(product.name)} (${money(totalPrice, product.currency)}). Confirm it and send them your invoice; they pay you directly.`,
    link: "/supplier/orders?kind=wholesale",
    actionLabel: "View order",
    actionUrl: "/supplier/orders?kind=wholesale",
    metadata: { wholesaleOrderId: order.id },
    sendEmail: true,
  }).catch(() => null);

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
    select: { id: true, status: true, sellerId: true, quantity: true, supplierProductId: true, supplier: { select: { displayName: true } }, supplierProduct: { select: { name: true } } },
  });
  if (!order) return { ok: false, code: "NOT_FOUND", message: "Order not found" };
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
  const moved = await db.wholesaleOrder.updateMany({ where: { id: order.id, supplierId: input.supplierId, status: order.status }, data });
  if (moved.count !== 1) return { ok: false, code: "CONFLICT", message: "This order has already moved on. Refresh to see where it is." };

  const supplierName = plainText(order.supplier.displayName) || "Your supplier";
  const what = `${order.quantity.toLocaleString("en-NG")} × ${plainText(order.supplierProduct.name)}`;
  const note = {
    confirmed: { title: `${supplierName} confirmed your wholesale order`, description: `${what}. Expect their invoice; you pay them directly.`, priority: "info" as const },
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
  }).catch(() => null);
  return { ok: true, data: { id: order.id, status: next } };
}
