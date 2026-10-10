import { NextRequest } from "next/server";
import { withSeller } from "@/lib/auth/middleware";
import { db } from "@/lib/db/client";
import { ok, apiError } from "@/lib/api/response";
import type { AuthUser } from "@/lib/auth/types";

interface HealthFactors {
  inventory: number;
  orders: number;
  products: number;
  store: number;
  activity: number;
}

export const GET = withSeller(async (req: NextRequest, { user }: { user: AuthUser }) => {
  const store = await db.store.findUnique({ where: { userId: user.id } });
  if (!store) return apiError("NOT_FOUND", "Store not found", 404);

  const latest = await db.storeHealthSnapshot.findFirst({
    where: { storeId: store.id },
    orderBy: { createdAt: "desc" },
  });

  if (latest) return ok(latest);

  const snapshot = await calculateHealthScore(store.id);
  return ok(snapshot);
});

export const POST = withSeller(async (req: NextRequest, { user }: { user: AuthUser }) => {
  const store = await db.store.findUnique({ where: { userId: user.id } });
  if (!store) return apiError("NOT_FOUND", "Store not found", 404);

  const snapshot = await calculateHealthScore(store.id);
  return ok(snapshot);
});

async function calculateHealthScore(storeId: string) {
  const [productStats, orderStats, inventoryStats, activityCount] = await Promise.all([
    db.storeProduct.aggregate({
      where: { storeId },
      _count: true,
      _sum: { currentStock: true, reservedStock: true, incomingStock: true, damagedStock: true },
    }),
    db.retailOrder.aggregate({
      where: { storeId },
      _count: true,
    }),
    db.storeProduct.findMany({
      where: { storeId, currentStock: { lte: 0 } },
      select: { id: true },
    }),
    db.activityEvent.count({
      where: { storeId, createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
    }),
  ]);

  const totalProducts = productStats._count;
  const outOfStock = inventoryStats.length;
  const recentActivity = activityCount;

  const factors: HealthFactors = {
    inventory: outOfStock === 0 ? 100 : Math.max(0, 100 - (outOfStock / Math.max(totalProducts, 1)) * 100),
    orders: orderStats._count > 0 ? Math.min(100, orderStats._count * 10) : 0,
    products: totalProducts > 0 ? Math.min(100, totalProducts * 5) : 0,
    store: 80,
    activity: Math.min(100, recentActivity * 10),
  };

  const score = Math.round(
    factors.inventory * 0.3 +
    factors.orders * 0.25 +
    factors.products * 0.2 +
    factors.store * 0.15 +
    factors.activity * 0.1
  );

  const recommendations: Array<{ action: string; label: string; link: string; impact: string }> = [];

  if (outOfStock > 0) {
    recommendations.push({
      action: "restock",
      label: `${outOfStock} product(s) out of stock`,
      link: "/store/products?lowStock=true",
      impact: "high",
    });
  }

  if (totalProducts === 0) {
    recommendations.push({
      action: "add_products",
      label: "Add your first products",
      link: "/store/products/new",
      impact: "high",
    });
  }

  if (orderStats._count === 0) {
    recommendations.push({
      action: "drive_sales",
      label: "Share your store to start getting orders",
      link: "/store/marketing",
      impact: "high",
    });
  }

  if (recentActivity < 5) {
    recommendations.push({
      action: "increase_activity",
      label: "Increase store activity to improve engagement",
      link: "/store/dashboard",
      impact: "medium",
    });
  }

  const snapshot = await db.storeHealthSnapshot.create({
    data: {
      storeId,
      score,
      factors,
      recommendations,
    },
  });

  return snapshot;
}
