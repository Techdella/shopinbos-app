import { db } from "@/lib/db/client";
import { buildStorefrontUrl } from "@/lib/domains/storefront";
import { affiliateTotals } from "@shared/affiliates";

// Server loader for /home/affiliates and GET /api/app/affiliates.

export async function getSellerAffiliates(store: { id: string; slug: string; customDomain: string | null }) {
  const affiliates = await db.affiliate.findMany({
    where: { storeId: store.id },
    orderBy: [{ active: "desc" }, { createdAt: "desc" }],
    include: {
      orders: {
        select: { id: true, orderNumber: true, buyerName: true, status: true, total: true, affiliateCommission: true, affiliatePaidAt: true, createdAt: true },
        orderBy: { createdAt: "desc" },
      },
    },
  });
  const storeUrl = buildStorefrontUrl(store, "/");
  return affiliates.map(({ orders, ...affiliate }) => ({
    ...affiliate,
    link: `${storeUrl}${storeUrl.includes("?") ? "&" : "?"}aff=${affiliate.code}`,
    totals: affiliateTotals(orders.map((order) => ({ ...order, total: Number(order.total) }))),
    recentOrders: orders.slice(0, 5).map((order) => ({ ...order, total: Number(order.total) })),
  }));
}

export type SellerAffiliate = Awaited<ReturnType<typeof getSellerAffiliates>>[number];
