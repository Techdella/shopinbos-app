import "server-only";

import { db } from "@/lib/db/client";
import { getSellerOnboardingStatus } from "@/lib/onboarding-status";
import { ensureStorefrontVisitorTables } from "@/lib/storefront/visitor-data";
import { naira } from "@shared/onboarding";
import { computeDashboard, startOfLagosDay, type DashboardOrder, type DashboardProduct } from "./compute";

// Seller home dashboard (2026 "Seller app" mockups): one loader for web /home and GET /api/app/dashboard.

export interface DashboardTask {
  key: string;
  icon: "chat" | "mail" | "truck" | "box" | "coin";
  title: string;
  hint: string;
  href: string;
  image?: string | null;
  action?: { label: string; href: string };
}

const DAY = 86_400_000;

async function countSafely(query: Promise<number>) {
  return query.catch(() => 0);
}

export async function getSellerDashboard(userId: string, now = new Date()) {
  const store = await db.store.findUnique({
    where: { userId },
    select: { id: true, name: true, slug: true, currency: true, logoUrl: true, user: { select: { name: true, avatarUrl: true } } },
  });
  if (!store) return null;

  const today = startOfLagosDay(now);
  const since = new Date(today.getTime() - 29 * DAY);
  await ensureStorefrontVisitorTables().catch(() => null);

  const [orders, products, unreadMessages, messagesToday, newSubmissions, submissionsToday, visitorsToday, importsOnTheWay, onboarding] = await Promise.all([
    db.retailOrder.findMany({
      where: { storeId: store.id, createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
      take: 2000,
      select: { id: true, orderNumber: true, buyerName: true, buyerEmail: true, items: true, total: true, status: true, createdAt: true, channel: true, deliveryAddress: true, logisticsDetails: true },
    }),
    db.storeProduct.findMany({
      where: { storeId: store.id, status: { not: "archived" } },
      orderBy: { soldStock: "desc" },
      take: 200,
      select: { id: true, name: true, images: true, retailPrice: true, currentStock: true, lowStockThreshold: true, soldStock: true, trackStock: true },
    }),
    countSafely(db.message.count({ where: { read: false, senderId: { not: userId }, conversation: { OR: [{ participant1Id: userId }, { participant2Id: userId }] } } })),
    countSafely(db.message.count({ where: { createdAt: { gte: today }, senderId: { not: userId }, conversation: { OR: [{ participant1Id: userId }, { participant2Id: userId }] } } })),
    countSafely(db.storeFormSubmission.count({ where: { storeId: store.id, status: "new" } })),
    countSafely(db.storeFormSubmission.count({ where: { storeId: store.id, createdAt: { gte: today } } })),
    countSafely(db.storeVisitor.count({ where: { storeId: store.id, lastSeenAt: { gte: today } } })),
    db.wholesaleOrder
      .findMany({
        where: { sellerId: userId, status: "shipped" },
        orderBy: { updatedAt: "desc" },
        take: 5,
        select: { id: true, quantity: true, supplierProduct: { select: { name: true } }, supplier: { select: { displayName: true } } },
      })
      .catch(() => []),
    getSellerOnboardingStatus(userId),
  ]);

  // Older orders may be outside the 30-day window but still need action; fetch the latest 8 regardless.
  const latest = orders.length >= 8
    ? orders
    : await db.retailOrder.findMany({
        where: { storeId: store.id },
        orderBy: { createdAt: "desc" },
        take: 8,
        select: { id: true, orderNumber: true, buyerName: true, buyerEmail: true, items: true, total: true, status: true, createdAt: true, channel: true, deliveryAddress: true, logisticsDetails: true },
      });
  const mergedOrders = new Map<string, DashboardOrder>();
  for (const order of [...orders, ...latest]) mergedOrders.set(order.id, { ...order, total: Number(order.total) });

  const numbers = computeDashboard({
    orders: [...mergedOrders.values()],
    products: products.map((p): DashboardProduct => ({ ...p, retailPrice: Number(p.retailPrice) })),
    now,
  });

  // "Peggy needs you for N things": real, actionable items only.
  const tasks: DashboardTask[] = [];
  if (unreadMessages > 0) {
    tasks.push({ key: "messages", icon: "chat", title: `Reply to ${unreadMessages} message${unreadMessages === 1 ? "" : "s"}`, hint: "Suppliers and delivery partners are waiting", href: "/home/messages" });
  }
  if (newSubmissions > 0) {
    tasks.push({ key: "forms", icon: "mail", title: `${newSubmissions} customer message${newSubmissions === 1 ? "" : "s"}`, hint: "From your shop's contact form", href: "/home/forms" });
  }
  const topLow = numbers.lowStock[0];
  if (topLow) {
    tasks.push({
      key: `stock-${topLow.id}`,
      icon: "box",
      title: topLow.stock <= 0 ? `${topLow.name}: sold out` : `${topLow.name}: ${topLow.stock} left`,
      hint: "Restock before it runs out",
      href: `/products/${topLow.id}`,
      image: topLow.image,
      action: { label: "Restock", href: `/products/${topLow.id}` },
    });
  }
  if (numbers.ordersToSend > 0) {
    tasks.push({ key: "send", icon: "truck", title: `Send out ${numbers.ordersToSend} order${numbers.ordersToSend === 1 ? "" : "s"}`, hint: "Book riders so they arrive on time", href: "/home/orders" });
  }
  if (numbers.ordersAwaitingPayment > 0) {
    tasks.push({ key: "payment", icon: "coin", title: `${numbers.ordersAwaitingPayment} order${numbers.ordersAwaitingPayment === 1 ? "" : "s"} not paid yet`, hint: "Send a payment reminder on WhatsApp", href: "/home/orders" });
  }

  return {
    store: { id: store.id, name: store.name, slug: store.slug, logoUrl: store.logoUrl, url: onboarding?.store.url ?? null, live: onboarding?.store.live ?? false },
    ownerName: store.user.name,
    /** The person's profile photo (same as the web top bar), or null. */
    ownerAvatarUrl: store.user.avatarUrl ?? null,
    today: today.toISOString(),
    sales: { today: numbers.todaySales, week: numbers.weekSales, weekChange: numbers.weekChange, todayLabel: naira(numbers.todaySales) },
    counts: { ordersToday: numbers.ordersToday, visitorsToday, chatsToday: messagesToday + submissionsToday },
    tasks,
    daily: numbers.daily,
    latestOrders: numbers.latestOrders,
    sources: numbers.sources,
    sellingFast: numbers.sellingFast,
    imports: importsOnTheWay.map((order) => ({ id: order.id, quantity: order.quantity, product: order.supplierProduct.name, supplier: order.supplier.displayName })),
    checklist: onboarding?.checklist ?? [],
  };
}

export type SellerDashboard = NonNullable<Awaited<ReturnType<typeof getSellerDashboard>>>;
