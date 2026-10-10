import { db } from "@/lib/db/client";
import { createNotification } from "./create";

interface AlertCheckResult {
  triggered: boolean;
  notifications: Array<{
    type: "inventory" | "orders" | "category" | "marketing" | "products";
    priority: "critical" | "warning" | "info" | "success";
    title: string;
    description: string;
    link?: string;
    actionLabel?: string;
    actionUrl?: string;
  }>;
}

export async function checkLowStock(storeId: string): Promise<AlertCheckResult> {
  const products = await db.storeProduct.findMany({
    where: {
      storeId,
      inventoryType: "seller",
      status: { not: "archived" },
    },
    select: { id: true, name: true, currentStock: true, lowStockThreshold: true },
    take: 50,
  });

  const lowStockProducts = products.filter((p) => p.currentStock <= p.lowStockThreshold);

  if (lowStockProducts.length === 0) return { triggered: false, notifications: [] };

  return {
    triggered: true,
    notifications: lowStockProducts.slice(0, 5).map((p) => ({
      type: "inventory" as const,
      priority: p.currentStock === 0 ? "critical" as const : "warning" as const,
      title: p.currentStock === 0 ? "Out of Stock" : "Low Stock Alert",
      description: `${p.name} — Only ${p.currentStock} units remaining`,
      link: `/products/${p.id}`,
      actionLabel: "Restock Product",
      actionUrl: `/products/${p.id}`,
    })),
  };
}

export async function checkStuckOrders(storeId: string): Promise<AlertCheckResult> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const stuckOrders = await db.retailOrder.findMany({
    where: {
      storeId,
      status: { in: ["processing", "paid"] },
      createdAt: { lt: sevenDaysAgo },
    },
    take: 10,
  });

  if (stuckOrders.length === 0) return { triggered: false, notifications: [] };

  return {
    triggered: true,
    notifications: stuckOrders.slice(0, 5).map((o) => ({
      type: "orders" as const,
      priority: "critical" as const,
      title: "Order Stuck — Needs Attention",
      description: `Order #${o.orderNumber} has been in "${o.status}" status for over 7 days`,
      link: `/home/orders/${o.id}`,
      actionLabel: "View Order",
      actionUrl: `/home/orders/${o.id}`,
    })),
  };
}

export async function checkEmptyCategories(storeId: string): Promise<AlertCheckResult> {
  const categories = await db.category.findMany({
    where: {
      storeProducts: {
        some: { storeId, visibility: { notIn: ["hidden"] } },
      },
    },
  });

  if (categories.length > 0) return { triggered: false, notifications: [] };

  return {
    triggered: true,
    notifications: [{
      type: "category" as const,
      priority: "warning" as const,
      title: "No Categories With Visible Products",
      description: "Add products to categories to help customers find what they need",
      link: "/home/collections",
      actionLabel: "Manage Categories",
      actionUrl: "/products",
    }],
  };
}

export async function checkNoRecentOrders(storeId: string): Promise<AlertCheckResult> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const recentOrder = await db.retailOrder.findFirst({
    where: { storeId, createdAt: { gte: thirtyDaysAgo } },
  });

  if (recentOrder) return { triggered: false, notifications: [] };

  return {
    triggered: true,
    notifications: [{
      type: "marketing" as const,
      priority: "warning" as const,
      title: "No Orders In 30 Days",
      description: "Your store hasn't received any orders recently. Try promoting your products.",
      link: "/home/marketing",
      actionLabel: "View Marketing Tools",
      actionUrl: "/home/marketing",
    }],
  };
}

export async function runAllChecks(storeId: string, userId: string): Promise<void> {
  const checks = await Promise.all([
    checkLowStock(storeId),
    checkStuckOrders(storeId),
    checkEmptyCategories(storeId),
    checkNoRecentOrders(storeId),
  ]);

  for (const result of checks) {
    if (!result.triggered) continue;
    for (const notif of result.notifications) {
      await createNotification(userId, notif.type, notif.priority, notif.title, notif.description, {
        link: notif.link,
        actionLabel: notif.actionLabel,
        actionUrl: notif.actionUrl,
      });
    }
  }
}
