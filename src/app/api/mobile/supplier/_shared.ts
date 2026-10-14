import "server-only";
import { db } from "@/lib/db/client";
import { isOnboardingComplete } from "@/lib/role-queries";
import { listDropshipOrders, type DropshipView } from "@/lib/supplier-orders/views.server";
import { toE164 } from "@shared/phone";
import { nextActions, type SupplierOrderAction } from "./_rules";
import { pickupSummaries } from "@/lib/supplier-orders/views.server";

// Shared by the mobile supplier routes (/api/mobile/supplier/**): the supplier's dropship orders (SupplierOrder:
// what they ship for a shop's order, with what goes on the parcel) and wholesale orders, in the shape the app reads.

export async function supplierForUser(userId: string) {
  return db.supplier.findUnique({ where: { userId } });
}

export function canTrade(supplier: { verificationStatus: string; onboardingState: unknown }) {
  return isOnboardingComplete(supplier) && supplier.verificationStatus === "verified";
}

/** The app's shape for one dropship order (kept the same as before SupplierOrder existed). */
export function appDropshipView(order: DropshipView) {
  return {
    kind: "dropship" as const,
    id: order.id,
    ref: order.orderNumber,
    status: order.status,
    // The shop's order has other products too (the supplier ships only theirs).
    mixed: order.otherItemsInOrder,
    // "I've packed it" is kept on the order (packedAt); it stays "accepted" until the rider has it.
    next: order.status === "accepted" && !order.packedAt ? (["packed", ...nextActions("dropship", order.status)] as SupplierOrderAction[]) : nextActions("dropship", order.status),
    shop: order.shop,
    sellerUserId: order.sellerUserId,
    // What goes on the label: the shop's name as the sender, the buyer as the recipient.
    label: {
      from: order.shop,
      to: order.recipient.name,
      phone: order.recipient.phone ? toE164(order.recipient.phone) ?? order.recipient.phone : null,
      address: order.recipient.address,
      collect: order.collectOnDelivery,
    },
    items: order.items.map((item) => ({ name: item.name, variant: item.variant, quantity: item.quantity, image: item.image, yourPrice: item.lineCost })),
    yourTotal: order.costTotal,
    notes: order.notes,
    trackingCode: order.trackingCode,
    rejectReason: order.rejectReason,
    acceptBy: order.acceptBy,
    packed: Boolean(order.packedAt),
    pickup: order.pickup,
    createdAt: order.createdAt,
  };
}

/** The supplier's dropship orders, newest first (or one, by id). */
export async function dropshipOrders(supplierId: string, options: { orderId?: string; statuses?: readonly string[]; take?: number; order?: "asc" | "desc" } = {}) {
  const { orders } = await listDropshipOrders(supplierId, { id: options.orderId, statuses: options.statuses, take: options.take ?? 200, order: options.order });
  return orders.map(appDropshipView);
}

export type DropshipOrderView = ReturnType<typeof appDropshipView>;

export const WHOLESALE_SELECT = {
  id: true, sellerId: true, quantity: true, unitPrice: true, totalPrice: true, currency: true, deliveryAddress: true, notes: true,
  status: true, trackingCode: true, rejectReason: true, createdAt: true, acceptBy: true,
  seller: { select: { name: true, phone: true, store: { select: { name: true } } } },
  supplierProduct: { select: { id: true, name: true, images: true } },
} as const;

type WholesaleRow = {
  id: string; sellerId: string; quantity: number; unitPrice: number; totalPrice: number; currency: string; deliveryAddress: string; notes: string | null;
  status: string; trackingCode: string | null; rejectReason: string | null; createdAt: Date; acceptBy: Date | null;
  seller: { name: string; phone: string | null; store: { name: string } | null };
  supplierProduct: { id: string; name: string; images: string[] };
};

export function wholesaleView(order: WholesaleRow) {
  return {
    kind: "wholesale" as const,
    id: order.id,
    ref: `W-${order.id.slice(-6).toUpperCase()}`,
    status: order.status,
    next: nextActions("wholesale", order.status),
    shop: order.seller.store?.name ?? order.seller.name,
    sellerUserId: order.sellerId,
    sellerName: order.seller.name,
    sellerPhone: order.seller.phone,
    product: { id: order.supplierProduct.id, name: order.supplierProduct.name, image: order.supplierProduct.images[0] ?? null },
    quantity: order.quantity,
    unitPrice: order.unitPrice,
    total: order.totalPrice,
    currency: order.currency,
    address: order.deliveryAddress,
    notes: order.notes,
    trackingCode: order.trackingCode,
    rejectReason: order.rejectReason,
    acceptBy: order.acceptBy?.toISOString() ?? null,
    packed: order.status === "processing",
    pickup: null as { status: string; text: string | null } | null,
    createdAt: order.createdAt.toISOString(),
  };
}

export type WholesaleOrderView = ReturnType<typeof wholesaleView>;

/** Bulk orders with their rider booking ("Pick up 12–4pm today"), for the list and the order screen. */
export async function wholesaleViews(rows: WholesaleRow[]) {
  const views = rows.map(wholesaleView);
  const pickups = await pickupSummaries("wholesale", views.filter((view) => view.status === "processing" || view.status === "shipped").map((view) => view.id));
  return views.map((view) => ({ ...view, pickup: pickups.get(view.id) ?? null }));
}
