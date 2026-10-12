import { ok } from "@/lib/api/response";
import { marketingRoute } from "@/lib/marketing/api";
import { discountUsage } from "@/lib/marketing/discounts";
import { db } from "@/lib/db/client";

export const dynamic = "force-dynamic";

// Marketing at a glance for the mobile app (the web pages read these on the server): the latest campaigns
// with their numbers, totals for sent campaigns, and the store's discount codes with how much each has sold.
// Creating a code uses POST /api/app/marketing/discounts; templates come from GET /api/app/marketing/templates.
export const GET = marketingRoute(async ({ store }) => {
  const [campaigns, totals, discounts, usage, subscribers] = await Promise.all([
    db.broadcastCampaign.findMany({
      where: { storeId: store.id },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { id: true, name: true, subject: true, channel: true, status: true, sentCount: true, openCount: true, clickCount: true, revenueGenerated: true, scheduledAt: true, sentAt: true, createdAt: true },
    }),
    db.broadcastCampaign.aggregate({ where: { storeId: store.id, status: "sent" }, _sum: { sentCount: true, openCount: true, clickCount: true, revenueGenerated: true }, _count: true }),
    db.discount.findMany({ where: { storeId: store.id }, orderBy: { createdAt: "desc" }, take: 100, select: { id: true, name: true, code: true, type: true, value: true, status: true, usedCount: true, maxUses: true, expiresAt: true, createdAt: true } }),
    discountUsage(store.id),
    db.subscriber.count({ where: { storeId: store.id, status: "active" } }).catch(() => 0),
  ]);
  return ok({
    totals: {
      campaignsSent: totals._count,
      sent: totals._sum.sentCount ?? 0,
      opens: totals._sum.openCount ?? 0,
      clicks: totals._sum.clickCount ?? 0,
      revenue: totals._sum.revenueGenerated ?? 0,
      subscribers,
    },
    campaigns,
    discounts: discounts.map((discount) => {
      const used = usage.get(discount.code.toUpperCase());
      return { ...discount, orders: used?.orders ?? 0, revenue: used?.revenue ?? 0 };
    }),
  });
});
