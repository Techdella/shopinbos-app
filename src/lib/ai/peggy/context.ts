import "server-only";

import { db } from "@/lib/db/client";
import { getSellerWorkspace } from "@/lib/workspace";
import { computeDashboard, startOfLagosDay, type DashboardOrder } from "@/lib/dashboard/compute";
import { aggregateCustomers, lowStockProducts, periodSales } from "./pure";

// What Peggy and Rex know about a seller's shop: a compact, accurate snapshot. Also feeds getPeggyData,
// getSuggestions and Rex's system prompt (src/app/actions/ai.ts).

const DAY = 86_400_000;

export function fmtMoney(amount: number, currency = "NGN") {
  return `${currency} ${amount.toLocaleString("en-NG", { maximumFractionDigits: 0 })}`;
}

export function orderItemCount(items: unknown) {
  return Array.isArray(items) ? items.length : 0;
}

async function safe<T>(query: Promise<T>, fallback: T): Promise<T> {
  return query.catch((error) => {
    console.error("[peggy/context] query failed", error);
    return fallback;
  });
}

export async function buildSellerSnapshot(userId: string, now = new Date()) {
  const workspace = await getSellerWorkspace(userId);
  const store = workspace?.store ?? null;
  const storeId = store?.id ?? "__missing__";
  const today = startOfLagosDay(now);
  const monthStart = new Date(today.getTime() - 29 * DAY);
  const yearStart = new Date(today.getTime() - 364 * DAY);

  const [products, monthOrders, latestOrders, buyerOrders, statusCounts, unreadMessages, activeDiscounts, reviews] = await Promise.all([
    safe(
      db.storeProduct.findMany({
        where: { storeId, status: { not: "archived" } },
        orderBy: { createdAt: "desc" },
        take: 500,
        select: { id: true, name: true, status: true, retailPrice: true, currency: true, currentStock: true, lowStockThreshold: true, soldStock: true, fulfillmentType: true },
      }),
      [],
    ),
    safe(
      db.retailOrder.findMany({
        where: { storeId, createdAt: { gte: monthStart } },
        orderBy: { createdAt: "desc" },
        take: 3000,
        select: { id: true, orderNumber: true, buyerName: true, buyerEmail: true, buyerPhone: true, items: true, total: true, status: true, createdAt: true, channel: true, deliveryAddress: true, logisticsDetails: true },
      }),
      [],
    ),
    safe(
      db.retailOrder.findMany({
        where: { storeId },
        orderBy: { createdAt: "desc" },
        take: 6,
        select: { orderNumber: true, buyerName: true, items: true, total: true, currency: true, status: true, createdAt: true },
      }),
      [],
    ),
    safe(
      db.retailOrder.findMany({
        where: { storeId, createdAt: { gte: yearStart }, status: { in: ["paid", "processing", "packed", "shipped", "delivered"] } },
        orderBy: { createdAt: "desc" },
        take: 3000,
        select: { orderNumber: true, buyerName: true, buyerEmail: true, buyerPhone: true, total: true, status: true, createdAt: true, items: true },
      }),
      [],
    ),
    safe(db.retailOrder.groupBy({ by: ["status"], where: { storeId }, _count: { _all: true } }), []),
    safe(
      db.message.count({
        where: { read: false, senderId: { not: userId }, conversation: { OR: [{ participant1Id: userId }, { participant2Id: userId }] } },
      }),
      0,
    ),
    safe(
      db.discount.findMany({
        where: { storeId, status: "active" },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: { code: true, type: true, value: true, usedCount: true, expiresAt: true },
      }),
      [],
    ),
    safe(
      db.productReview.findMany({
        where: { storeId, createdAt: { gte: monthStart } },
        orderBy: { createdAt: "desc" },
        take: 200,
        select: { rating: true, body: true, title: true, status: true, buyerName: true, product: { select: { name: true } } },
      }),
      [],
    ),
  ]);

  const currency = store?.currency ?? "NGN";
  const count = (...statuses: string[]) => statusCounts.filter((row) => statuses.includes(row.status)).reduce((sum, row) => sum + row._count._all, 0);
  const totalOrders = statusCounts.reduce((sum, row) => sum + row._count._all, 0);

  const orders = monthOrders.map((order) => ({ ...order, total: Number(order.total) }));
  const sales = periodSales(orders, now);
  const dashboard = computeDashboard({ orders: orders as DashboardOrder[], products: [], now });
  const low = lowStockProducts(products);
  const published = products.filter((product) => product.status === "published" || product.status === "active");
  const customers = aggregateCustomers(buyerOrders.map((order) => ({ ...order, total: Number(order.total) })), "top");
  const avgRating = reviews.length ? Math.round((reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length) * 10) / 10 : null;

  return {
    store: store
      ? { id: store.id, name: store.name, slug: store.slug, status: store.status, currency: store.currency, customDomain: store.customDomain }
      : null,
    sales: {
      note: "Paid orders only, Lagos days, today included",
      today: fmtMoney(sales.today.total, currency),
      todayOrders: sales.today.orders,
      last7Days: fmtMoney(sales.week.total, currency),
      last7DaysOrders: sales.week.orders,
      changeVsPrevious7DaysPercent: dashboard.weekChange,
      last30Days: fmtMoney(sales.month.total, currency),
      last30DaysOrders: sales.month.orders,
    },
    products: {
      total: products.length,
      published: published.length,
      drafts: products.filter((product) => product.status === "draft").length,
      lowStock: low.length,
      lowStockItems: low.slice(0, 5).map((product) => ({ id: product.id, name: product.name, stock: product.currentStock, lowAt: product.lowStockThreshold })),
      bestSellers: [...products]
        .filter((product) => product.soldStock > 0)
        .sort((a, b) => b.soldStock - a.soldStock)
        .slice(0, 5)
        .map((product) => ({ id: product.id, name: product.name, sold: product.soldStock, stock: product.currentStock, price: fmtMoney(Number(product.retailPrice), product.currency) })),
      recent: products.slice(0, 5).map((product) => ({
        id: product.id,
        name: product.name,
        status: product.status,
        price: fmtMoney(Number(product.retailPrice), product.currency),
        stock: product.currentStock,
        fulfillmentType: product.fulfillmentType,
      })),
    },
    orders: {
      total: totalOrders,
      revenue: fmtMoney(sales.month.total, currency),
      revenueNote: "Paid sales in the last 30 days",
      toSend: count("paid", "processing", "packed"),
      awaitingPayment: count("pending", "awaiting_payment"),
      pending: count("pending", "awaiting_payment"),
      processing: count("paid", "processing", "packed"),
      shipped: count("shipped"),
      recent: latestOrders.map((order) => ({
        orderNumber: order.orderNumber,
        buyerName: order.buyerName,
        total: fmtMoney(Number(order.total), order.currency),
        status: order.status,
        itemCount: orderItemCount(order.items),
        createdAt: order.createdAt.toISOString(),
      })),
    },
    customers: {
      buyersLast12Months: customers.length,
      top: customers.slice(0, 3).map((customer) => ({ name: customer.name, orders: customer.orders, spent: fmtMoney(customer.spent, currency) })),
    },
    discounts: {
      active: activeDiscounts.map((discount) => ({
        code: discount.code,
        type: discount.type,
        value: discount.value,
        used: discount.usedCount,
        ends: discount.expiresAt?.toISOString().slice(0, 10) ?? null,
      })),
    },
    reviews: {
      last30Days: reviews.length,
      averageRating: avgRating,
      awaitingApproval: reviews.filter((review) => review.status === "pending").length,
      latest: reviews.slice(0, 3).map((review) => ({
        rating: review.rating,
        product: review.product.name,
        by: review.buyerName,
        said: (review.title || review.body).slice(0, 120),
      })),
    },
    sourcing: {
      wholesaleOrders: (workspace?.wholesaleOrders ?? []).slice(0, 3).map((order) => ({
        product: order.supplierProduct.name,
        supplier: order.supplier.displayName,
        quantity: order.quantity,
        status: order.status,
      })),
      recommendedProducts: (workspace?.trendingProducts ?? []).slice(0, 4).map((product) => ({
        name: product.name,
        supplier: product.supplier.displayName,
        wholesalePrice: fmtMoney(Number(product.wholesalePrice), product.currency),
        suggestedRetailPrice: fmtMoney(Number(product.suggestedRetailPrice), product.currency),
        dropshipAvailable: product.dropshipAvailable,
      })),
    },
    logistics: {
      bookings: (workspace?.deliveryBookings ?? []).slice(0, 3).map((booking) => ({
        partner: booking.logisticsPartner.displayName,
        destination: booking.destination,
        status: booking.status,
        trackingCode: booking.trackingCode,
      })),
      quoteRequests: (workspace?.deliveryQuotes ?? []).slice(0, 3).map((quote) => ({
        partner: quote.logisticsPartner.displayName,
        destination: quote.destination,
        status: quote.status,
        quotedPrice: quote.quotedPrice ? fmtMoney(Number(quote.quotedPrice)) : null,
      })),
      partners: (workspace?.logisticsPartners ?? []).slice(0, 3).map((partner) => ({
        name: partner.displayName,
        city: partner.city,
        rating: partner.rating,
      })),
    },
    messages: { unread: unreadMessages },
  };
}

export type SellerSnapshot = Awaited<ReturnType<typeof buildSellerSnapshot>>;

export function greetingFor(name: string, snapshot: SellerSnapshot) {
  const firstName = name.split(" ")[0] || "there";
  const storeName = snapshot.store?.name ?? "your store";
  const urgent: string[] = [];
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

  if (snapshot.orders.toSend > 0) urgent.push(`${plural(snapshot.orders.toSend, "paid order")} to send out`);
  if (snapshot.orders.awaitingPayment > 0) urgent.push(`${plural(snapshot.orders.awaitingPayment, "order")} waiting for payment`);
  if (snapshot.products.lowStock > 0) urgent.push(`${plural(snapshot.products.lowStock, "product")} running low on stock`);
  if (snapshot.messages.unread > 0) urgent.push(`${plural(snapshot.messages.unread, "unread message")}`);
  if (snapshot.products.drafts > 0) urgent.push(`${plural(snapshot.products.drafts, "draft product")} not yet published`);

  if (urgent.length > 0) {
    return `Hi ${firstName}. ${snapshot.sales.today} sold today in ${storeName}. Here is what needs you:\n\n${urgent.map((item, i) => `${i + 1}. ${item}`).join("\n")}\n\nI can look things up and do the work: mark orders paid or shipped, change prices and stock, make discount codes, and draft blog posts, broadcasts and ads.`;
  }
  if (snapshot.products.total === 0) {
    return `Hi ${firstName}. ${storeName} is set up but has no products yet. Add your first product, and I can write its description, price it and help you sell it.`;
  }
  return `Hi ${firstName}. ${storeName} looks good: ${snapshot.sales.last7Days} sold in the last 7 days and nothing urgent. What would you like to work on?`;
}

export function sellerSystemPrompt(snapshot: SellerSnapshot, assistantName: "Peggy" | "Rex") {
  return `You are ${assistantName}, a practical AI commerce assistant for Shopinbos.
Use only the live workspace data below when discussing store status, product pages, orders, import/export, sourcing, supplier chats, and logistics.
If a user asks for data that is not present, say what is missing and point them to the relevant app area instead of inventing it.
Keep replies concise, operational, and specific. Use plain app paths when useful: /products, /products/import, /home/orders, /marketplace, /home/logistics, /home/peggy.

Live workspace snapshot:
${JSON.stringify(snapshot)}`;
}
