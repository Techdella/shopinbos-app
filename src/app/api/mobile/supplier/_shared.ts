import "server-only";
import { db } from "@/lib/db/client";
import { addressLines } from "@/lib/labels";
import { isOnboardingComplete } from "@/lib/role-queries";
import { toE164 } from "@shared/phone";
import { dropshipVisible, nextActions, supplierLines } from "./_rules";

// Shared by the mobile supplier routes (/api/mobile/supplier/**): the supplier's dropship orders (store orders
// with their products in them, with what goes on the parcel) and wholesale orders, in the shape the app reads.

export async function supplierForUser(userId: string) {
  return db.supplier.findUnique({ where: { userId } });
}

export function canTrade(supplier: { verificationStatus: string; onboardingState: unknown }) {
  return isOnboardingComplete(supplier) && supplier.verificationStatus === "verified";
}

const DAY_MS = 24 * 60 * 60 * 1000;

type Item = { productId?: string; name?: string; quantity?: number; image?: string; variant?: string };

/** Store orders from the last 60 days that include the supplier's dropship products, newest first. */
export async function dropshipOrders(supplierId: string, options: { orderId?: string } = {}) {
  const links = await db.dropshipRelationship.findMany({
    where: { supplierId },
    select: { storeId: true, storeProductId: true, supplierProduct: { select: { wholesalePrice: true, images: true } } },
    take: 500,
  });
  if (!links.length) return [];
  const byStoreProduct = new Map(links.map((link) => [link.storeProductId, link]));
  const storeIds = [...new Set(links.map((link) => link.storeId))];

  const orders = await db.retailOrder.findMany({
    where: {
      storeId: { in: storeIds },
      ...(options.orderId ? { id: options.orderId } : { createdAt: { gte: new Date(Date.now() - 60 * DAY_MS) } }),
    },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: {
      id: true, storeId: true, orderNumber: true, status: true, paymentMethod: true, buyerName: true, buyerPhone: true,
      deliveryAddress: true, items: true, notes: true, trackingCode: true, createdAt: true, total: true,
    },
  });
  const stores = await db.store.findMany({ where: { id: { in: storeIds } }, select: { id: true, name: true, userId: true } });
  const storeById = new Map(stores.map((store) => [store.id, store]));
  const ids = new Set(byStoreProduct.keys());

  return orders.flatMap((order) => {
    if (!dropshipVisible(order)) return [];
    const { mine, mixed } = supplierLines<Item>(order.items, ids);
    if (!mine.length) return [];
    const store = storeById.get(order.storeId);
    const lines = addressLines(order.deliveryAddress);
    const items = mine.map((item) => {
      const link = byStoreProduct.get(String(item.productId));
      const quantity = Math.max(1, Number(item.quantity) || 1);
      return {
        name: String(item.name ?? "Product"),
        variant: typeof item.variant === "string" ? item.variant : null,
        quantity,
        image: (typeof item.image === "string" && item.image) || link?.supplierProduct.images[0] || null,
        yourPrice: (link?.supplierProduct.wholesalePrice ?? 0) * quantity,
      };
    });
    // Pay on delivery orders: the rider collects from the buyer.
    const collect = order.paymentMethod === "pay_on_delivery" && ["pending", "awaiting_payment"].includes(order.status) ? order.total : 0;
    return [{
      kind: "dropship" as const,
      id: order.id,
      ref: order.orderNumber,
      status: order.status,
      mixed,
      next: nextActions("dropship", order.status, { mixed }),
      shop: store?.name ?? "Shop",
      sellerUserId: store?.userId ?? null,
      // What goes on the label: the shop's name as the sender, the buyer as the recipient.
      label: {
        from: store?.name ?? "Shop",
        to: order.buyerName,
        phone: order.buyerPhone ? toE164(order.buyerPhone) ?? order.buyerPhone : null,
        address: lines,
        collect,
      },
      items,
      yourTotal: items.reduce((sum, item) => sum + item.yourPrice, 0),
      notes: order.notes,
      trackingCode: order.trackingCode,
      createdAt: order.createdAt.toISOString(),
    }];
  });
}

export type DropshipOrderView = Awaited<ReturnType<typeof dropshipOrders>>[number];

export const WHOLESALE_SELECT = {
  id: true, sellerId: true, quantity: true, unitPrice: true, totalPrice: true, currency: true, deliveryAddress: true, notes: true,
  status: true, trackingCode: true, createdAt: true,
  seller: { select: { name: true, phone: true, store: { select: { name: true } } } },
  supplierProduct: { select: { id: true, name: true, images: true } },
} as const;

type WholesaleRow = {
  id: string; sellerId: string; quantity: number; unitPrice: number; totalPrice: number; currency: string; deliveryAddress: string; notes: string | null;
  status: string; trackingCode: string | null; createdAt: Date;
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
    createdAt: order.createdAt.toISOString(),
  };
}

export type WholesaleOrderView = ReturnType<typeof wholesaleView>;
