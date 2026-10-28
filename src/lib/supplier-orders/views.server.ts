import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { addressLines } from "@/lib/labels";
import { pickupWindowText } from "@shared/supplier-pickup";
import { supplierOrderActions, supplierOrderRef, type SupplierOrderLine } from "./pure";
import { readOrderBranding } from "@/lib/supplier-dropship.server";

// Reading a supplier's dropship orders (SupplierOrder) in one shape for the web portal, /api/supplier/orders and
// the mobile app. Always scoped by supplierId: a supplier only ever sees their own.

export const SUPPLIER_ORDER_SELECT = {
  id: true, status: true, items: true, costTotal: true, currency: true, shippingAddress: true, recipientName: true, recipientPhone: true,
  trackingCode: true, carrier: true, rejectReason: true, acceptedAt: true, shippedAt: true, deliveredAt: true, rejectedAt: true,
  acceptBy: true, expiredAt: true, packedAt: true, selfDelivery: true, deliveryFee: true, branding: true, packSteps: true, packPhotoUrl: true,
  createdAt: true, updatedAt: true, storeId: true, sellerId: true, retailOrderId: true,
  retailOrder: { select: { orderNumber: true, status: true, paymentMethod: true, total: true, notes: true, items: true } },
} as const satisfies Prisma.SupplierOrderSelect;

export type SupplierOrderRow = Prisma.SupplierOrderGetPayload<{ select: typeof SUPPLIER_ORDER_SELECT }>;

export function orderLines(items: unknown): SupplierOrderLine[] {
  return (Array.isArray(items) ? items : []).map((raw) => {
    const item = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    return {
      storeProductId: String(item.storeProductId ?? ""),
      supplierProductId: String(item.supplierProductId ?? ""),
      name: typeof item.name === "string" ? item.name : "Product",
      variant: typeof item.variant === "string" ? item.variant : null,
      quantity: Math.max(1, Number(item.quantity) || 1),
      unitCost: Number(item.unitCost) || 0,
      image: typeof item.image === "string" ? item.image : null,
      ...(item.preorder === true ? { preorder: true as const, shipsOn: typeof item.shipsOn === "string" ? item.shipsOn : null } : {}),
    };
  });
}

/** One dropship order as a supplier sees it: what to pack, where it goes, what they're owed, what they can do. */
export function dropshipView(row: SupplierOrderRow, shopName: string, pickup?: PickupSummary | null) {
  const items = orderLines(row.items);
  const retailLines = Array.isArray(row.retailOrder.items) ? row.retailOrder.items.length : items.length;
  const unpaidPod = row.retailOrder.paymentMethod === "pay_on_delivery" && ["pending", "awaiting_payment"].includes(row.retailOrder.status);
  return {
    kind: "dropship" as const,
    id: row.id,
    ref: supplierOrderRef(row.id),
    orderNumber: row.retailOrder.orderNumber,
    status: row.status,
    next: supplierOrderActions(row.status),
    shop: shopName,
    sellerUserId: row.sellerId,
    recipient: { name: row.recipientName, phone: row.recipientPhone, address: addressLines(row.shippingAddress) },
    // The rider collects from the buyer on pay-on-delivery orders (the whole store order).
    collectOnDelivery: unpaidPod ? Number(row.retailOrder.total) : 0,
    otherItemsInOrder: retailLines > items.length,
    items: items.map((item) => ({ ...item, lineCost: Math.round(item.unitCost * item.quantity * 100) / 100 })),
    costTotal: row.costTotal,
    // The supplier delivers this one itself ("You deliver"): the fee it earns on top, and it's delivered with the
    // customer's code (never sent to the supplier).
    selfDelivery: row.selfDelivery,
    deliveryFee: row.deliveryFee,
    currency: row.currency,
    notes: row.retailOrder.notes,
    trackingCode: row.trackingCode,
    carrier: row.carrier,
    rejectReason: row.rejectReason,
    acceptedAt: row.acceptedAt?.toISOString() ?? null,
    shippedAt: row.shippedAt?.toISOString() ?? null,
    deliveredAt: row.deliveredAt?.toISOString() ?? null,
    // The time to accept a new order (the countdown) and the rider booked for a packed one.
    acceptBy: row.acceptBy?.toISOString() ?? null,
    expiredAt: row.expiredAt?.toISOString() ?? null,
    packedAt: row.packedAt?.toISOString() ?? null,
    // Pack it the seller's way: { sellerName, logoUrl, choice, fee, skus }, the steps ticked and the parcel photo
    // (the checklist itself: GET /api/supplier/orders/[id]/pack).
    branding: readOrderBranding(row.branding, shopName),
    packSteps: row.packSteps,
    packPhotoUrl: row.packPhotoUrl,
    pickup: pickup ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

export interface PickupSummary {
  status: string;
  text: string | null;
}

/** The open rider booking for each order ("Pick up 12–4pm today", or still finding a rider). */
export async function pickupSummaries(kind: "dropship" | "wholesale", orderIds: string[], now = new Date()) {
  if (!orderIds.length) return new Map<string, PickupSummary>();
  const rows = await db.supplierPickup.findMany({ where: { orderKind: kind, orderId: { in: orderIds }, status: { not: "cancelled" } }, select: { orderId: true, status: true, windowStart: true, windowEnd: true } });
  return new Map(rows.map((row) => [row.orderId, { status: row.status, text: pickupWindowText(row.windowStart, row.windowEnd, now) }]));
}

export type DropshipView = ReturnType<typeof dropshipView>;

export async function shopNames(storeIds: string[]) {
  if (!storeIds.length) return new Map<string, string>();
  const stores = await db.store.findMany({ where: { id: { in: [...new Set(storeIds)] } }, select: { id: true, name: true } });
  return new Map(stores.map((store) => [store.id, store.name]));
}

export async function listDropshipOrders(supplierId: string, options: { statuses?: readonly string[]; id?: string; q?: string; skip?: number; take?: number; order?: "asc" | "desc" } = {}) {
  const q = options.q?.trim();
  const where: Prisma.SupplierOrderWhereInput = {
    supplierId,
    ...(options.id ? { id: options.id } : {}),
    ...(options.statuses ? { status: { in: [...options.statuses] } } : {}),
    ...(q
      ? {
          OR: [
            { recipientName: { contains: q, mode: "insensitive" } },
            { trackingCode: { contains: q, mode: "insensitive" } },
            { retailOrder: { orderNumber: { contains: q, mode: "insensitive" } } },
          ],
        }
      : {}),
  };
  const [rows, total] = await Promise.all([
    db.supplierOrder.findMany({ where, orderBy: { createdAt: options.order ?? "desc" }, skip: options.skip, take: options.take ?? 50, select: SUPPLIER_ORDER_SELECT }),
    db.supplierOrder.count({ where }),
  ]);
  const [names, pickups] = await Promise.all([
    shopNames(rows.map((row) => row.storeId)),
    pickupSummaries("dropship", rows.filter((row) => row.status === "accepted" || row.status === "shipped").map((row) => row.id)),
  ]);
  return { orders: rows.map((row) => dropshipView(row, names.get(row.storeId) ?? "Shop", pickups.get(row.id))), total };
}
