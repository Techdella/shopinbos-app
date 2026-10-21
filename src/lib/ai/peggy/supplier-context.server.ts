import "server-only";

import { db } from "@/lib/db/client";
import { parsePricingTiers } from "@/lib/marketplace/find";
import { bestSellers, quoteDiscounts, restockList, type SupplierProductFact, type SupplierSaleLine } from "./roles";

// What a supplier's Peggy knows (read-only, GET/POST /api/mobile/peggy): products with prices, tiers and stock,
// what sold in the last 30 days (wholesale and dropship), what to restock, past quotes, open orders and price
// requests. Reads only; nothing here changes anything.

const DAY = 86_400_000;
const LOW_STOCK = 5;
const OPEN_WHOLESALE = ["pending", "confirmed", "processing"] as const;
const OPEN_DROPSHIP = ["pending", "accepted"];

async function safe<T>(query: Promise<T>, fallback: T): Promise<T> {
  return query.catch((error) => {
    console.error("[peggy/supplier-context] query failed", error);
    return fallback;
  });
}

const naira = (value: number) => `₦${Math.round(value).toLocaleString("en-NG")}`;

function dropshipLines(items: unknown): Array<{ productId: string; quantity: number }> {
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => (item && typeof item === "object" ? (item as Record<string, unknown>) : {}))
    .filter((item) => typeof item.supplierProductId === "string")
    .map((item) => ({ productId: item.supplierProductId as string, quantity: Math.max(0, Math.floor(Number(item.quantity) || 0)) }));
}

export async function buildSupplierSnapshot(userId: string, now = new Date()) {
  const supplier = await db.supplier.findUnique({
    where: { userId },
    select: { id: true, displayName: true, businessName: true, city: true, verificationStatus: true, rating: true, ratingCount: true, missedOrders: true },
  });
  if (!supplier) return { supplier: null, firstName: null, pendingRequest: null, snapshot: { note: "No supplier profile yet. Finish signing up in the app first." } };
  const since = new Date(now.getTime() - 30 * DAY);
  const where = { supplierId: supplier.id };

  const [products, wholesale, dropship, quotes, openWholesale, openDropship, pendingQuotes] = await Promise.all([
    safe(db.supplierProduct.findMany({
      where: { ...where, status: { not: "rejected" } },
      orderBy: { createdAt: "desc" },
      take: 300,
      select: { id: true, name: true, wholesalePrice: true, moq: true, stockQuantity: true, pricingTiers: true, status: true, dropshipAvailable: true, createdAt: true },
    }), []),
    safe(db.wholesaleOrder.findMany({ where: { ...where, createdAt: { gte: since }, status: { notIn: ["cancelled", "refunded"] } }, take: 2000, select: { supplierProductId: true, quantity: true } }), []),
    safe(db.supplierOrder.findMany({ where: { ...where, createdAt: { gte: since }, status: { notIn: ["rejected", "cancelled", "expired"] } }, take: 2000, select: { items: true } }), []),
    safe(db.supplierQuoteRequest.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 30,
      select: { supplierProductId: true, quantity: true, quotedPrice: true, status: true, createdAt: true, supplierProduct: { select: { name: true } }, seller: { select: { name: true, store: { select: { name: true } } } } },
    }), []),
    safe(db.wholesaleOrder.findMany({
      where: { ...where, status: { in: [...OPEN_WHOLESALE] } },
      orderBy: { createdAt: "asc" },
      take: 10,
      select: { id: true, quantity: true, totalPrice: true, status: true, acceptBy: true, createdAt: true, supplierProduct: { select: { name: true } }, seller: { select: { name: true, store: { select: { name: true } } } } },
    }), []),
    safe(db.supplierOrder.findMany({
      where: { ...where, status: { in: OPEN_DROPSHIP } },
      orderBy: { createdAt: "asc" },
      take: 10,
      select: { id: true, status: true, costTotal: true, acceptBy: true, packedAt: true, items: true, createdAt: true },
    }), []),
    safe(db.supplierQuoteRequest.count({ where: { ...where, status: "pending" } }), 0),
  ]);

  const facts: SupplierProductFact[] = products.map((product) => ({
    id: product.id,
    name: product.name,
    price: product.wholesalePrice,
    moq: product.moq,
    stock: product.stockQuantity,
    tiers: parsePricingTiers(product.pricingTiers),
    status: product.status,
  }));
  const lines: SupplierSaleLine[] = [
    ...wholesale.map((order) => ({ productId: order.supplierProductId, quantity: order.quantity, kind: "wholesale" as const })),
    ...dropship.flatMap((order) => dropshipLines(order.items).map((line) => ({ ...line, kind: "dropship" as const }))),
  ];
  const sales = bestSellers(facts, lines, 30);
  const shopName = (seller: { name: string; store: { name: string } | null }) => seller.store?.name ?? seller.name;
  const pending = quotes.filter((quote) => quote.status === "pending");

  const snapshot = {
    supplier: { name: supplier.displayName || supplier.businessName, city: supplier.city, verified: supplier.verificationStatus === "verified", rating: supplier.ratingCount ? supplier.rating : null, missedOrders: supplier.missedOrders },
    products: facts.slice(0, 60).map((product) => ({
      name: product.name,
      priceToShops: naira(product.price),
      minimumOrder: product.moq,
      stock: product.stock,
      tiers: product.tiers.map((tier) => `${tier.minQty}${tier.maxQty ? `–${tier.maxQty}` : "+"}: ${naira(tier.price)} each`),
      status: product.status,
    })),
    productCount: facts.length,
    bestSellers: sales.slice(0, 8).map((row) => ({ name: row.name, unitsLast30Days: row.units, orders: row.orders, stock: row.stock, daysOfStockLeft: row.daysLeft })),
    restock: restockList(facts, sales, LOW_STOCK).slice(0, 8),
    quotes: {
      ...quoteDiscounts(facts, quotes.map((quote) => ({ productId: quote.supplierProductId, quantity: quote.quantity, quotedPrice: quote.quotedPrice, status: quote.status }))),
      recent: quotes.slice(0, 12).map((quote) => ({
        product: quote.supplierProduct.name,
        shop: shopName(quote.seller),
        quantity: quote.quantity,
        yourPrice: quote.quotedPrice ? naira(quote.quotedPrice) : null,
        status: quote.status,
        date: quote.createdAt.toISOString().slice(0, 10),
      })),
    },
    priceRequests: { waiting: pendingQuotes, newest: pending.slice(0, 5).map((quote) => ({ product: quote.supplierProduct.name, shop: shopName(quote.seller), quantity: quote.quantity, asked: quote.createdAt.toISOString().slice(0, 10) })) },
    openOrders: {
      wholesale: openWholesale.map((order) => ({ ref: `W-${order.id.slice(-6).toUpperCase()}`, product: order.supplierProduct.name, shop: shopName(order.seller), quantity: order.quantity, total: naira(order.totalPrice), status: order.status, acceptBy: order.acceptBy?.toISOString() ?? null })),
      dropship: openDropship.map((order) => ({
        ref: `D-${order.id.slice(-6).toUpperCase()}`,
        status: order.status === "accepted" && !order.packedAt ? "accepted, to pack" : order.status,
        items: dropshipLines(order.items).reduce((sum, line) => sum + line.quantity, 0),
        yourTotal: naira(order.costTotal),
        acceptBy: order.acceptBy?.toISOString() ?? null,
      })),
    },
  };

  const newest = pending[0];
  return {
    supplier,
    firstName: supplier.displayName || supplier.businessName,
    pendingRequest: newest ? { quantity: newest.quantity, product: newest.supplierProduct.name, shop: shopName(newest.seller) } : null,
    snapshot,
  };
}
