import { withSeller } from "@/lib/auth/middleware";
import { db } from "@/lib/db/client";
import { ok, apiError } from "@/lib/api/response";
import type { AuthUser } from "@/lib/auth/types";

export const dynamic = "force-dynamic";

export const GET = withSeller(async (_req, { user }: { user: AuthUser }) => {
  const store = await db.store.findUnique({ where: { userId: user.id } });
  if (!store) return apiError("NOT_FOUND", "Store not found", 404);

  const storeId = store.id;

  const [
    totalSubscribers,
    campaigns,
    couponsUsed,
    abandonedCarts,
    formSubmissions,
  ] = await Promise.all([
    db.subscriber.count({ where: { storeId, status: "active" } }),
    db.broadcastCampaign.findMany({
      where: { storeId, status: "sent" },
      orderBy: { sentAt: "desc" },
      take: 20,
      select: {
        id: true,
        name: true,
        sentCount: true,
        openCount: true,
        clickCount: true,
        revenueGenerated: true,
        sentAt: true,
        createdAt: true,
      },
    }),
    db.coupon.count({ where: { storeId, status: "used" } }),
    db.abandonedCartEvent.count({ where: { storeId } }),
    db.storeFormSubmission.count({ where: { storeId } }),
  ]);

  const emailsSent = campaigns.reduce((sum, c) => sum + c.sentCount, 0);
  const totalOpens = campaigns.reduce((sum, c) => sum + c.openCount, 0);
  const totalClicks = campaigns.reduce((sum, c) => sum + c.clickCount, 0);
  const openRate = emailsSent > 0 ? Math.round((totalOpens / emailsSent) * 1000) / 10 : 0;
  const clickRate = emailsSent > 0 ? Math.round((totalClicks / emailsSent) * 1000) / 10 : 0;

  const topCampaigns = [...campaigns]
    .sort((a, b) => b.openCount - a.openCount)
    .slice(0, 5)
    .map((c) => ({
      name: c.name,
      sent: c.sentCount,
      opened: c.openCount,
      clicked: c.clickCount,
      revenue: c.revenueGenerated,
    }));

  // Build subscriber growth — last 6 months
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
  sixMonthsAgo.setDate(1);
  sixMonthsAgo.setHours(0, 0, 0, 0);

  const recentSubscribers = await db.subscriber.findMany({
    where: { storeId, createdAt: { gte: sixMonthsAgo } },
    select: { createdAt: true },
  });

  const monthLabels = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const growthMap = new Map<string, number>();
  for (const sub of recentSubscribers) {
    const key = `${sub.createdAt.getFullYear()}-${sub.createdAt.getMonth()}`;
    growthMap.set(key, (growthMap.get(key) ?? 0) + 1);
  }

  const subscriberGrowth: { month: string; count: number }[] = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    subscriberGrowth.push({ month: monthLabels[d.getMonth()], count: growthMap.get(key) ?? 0 });
  }

  // Email-attributed revenue: all-time total, and per month for the chart.
  const [emailRevenue, conversions] = await Promise.all([
    db.broadcastCampaign.aggregate({ where: { storeId }, _sum: { revenueGenerated: true } }),
    db.campaignRecipient.findMany({
      where: { storeId, convertedAt: { gte: sixMonthsAgo } },
      select: { convertedAt: true, revenue: true },
    }),
  ]);
  const revenueByMonth = new Map<string, number>();
  for (const conversion of conversions) {
    const d = conversion.convertedAt!;
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    revenueByMonth.set(key, (revenueByMonth.get(key) ?? 0) + conversion.revenue);
  }
  const revenueOverTime: { month: string; amount: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    revenueOverTime.push({ month: monthLabels[d.getMonth()], amount: revenueByMonth.get(`${d.getFullYear()}-${d.getMonth()}`) ?? 0 });
  }

  // Recent activity
  const recentActivity: { type: string; message: string; timestamp: string }[] = [];

  const recentCampaigns = campaigns.slice(0, 3);
  for (const c of recentCampaigns) {
    const ts = c.sentAt ?? c.createdAt;
    const diff = Date.now() - ts.getTime();
    const hours = Math.round(diff / 3600000);
    const label = hours < 24 ? `${hours}h ago` : `${Math.round(hours / 24)}d ago`;
    recentActivity.push({
      type: "campaign",
      message: `${c.name} sent to ${c.sentCount.toLocaleString()} subscribers`,
      timestamp: label,
    });
  }

  return ok({
    totalSubscribers,
    emailsSent,
    openRate,
    clickRate,
    revenueFromEmail: emailRevenue._sum.revenueGenerated ?? 0,
    couponsUsed,
    abandonedCarts,
    formSubmissions,
    topCampaigns,
    recentActivity,
    subscriberGrowth,
    revenueOverTime,
  });
});
