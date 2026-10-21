import { requireRole } from "@/lib/server-auth";
import { supplierLimits } from "@shared/plans";
import { planOfUser } from "@/lib/plan-limits";
import { AnalyticsPlanNote } from "@/components/plans/AnalyticsPlanNote";
import { ensureSupplierAccess, getSupplierForUser } from "@/lib/role-queries";
import { db } from "@/lib/db/client";
import { AppPage, Card, CardHead, EmptyState, SplitLayout, StatGrid, StatTile } from "@/components/app-kit";
import { cx } from "@/components/app-ui/cx";
import { ORDER_STATUS, money, statusOf, supplierFrame, type SupplierT } from "@/components/supplier/supplier-kit";
import { getT } from "@/lib/i18n/server";
import { intlLocale } from "@shared/i18n";

export const dynamic = "force-dynamic";

const DAY = 24 * 60 * 60 * 1000;
const lagosDay = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos", year: "numeric", month: "2-digit", day: "2-digit" });

const BAR_TONE: Record<string, string> = {
  accent: "bg-app-accent",
  success: "bg-app-success",
  warning: "bg-[#F2A93B]",
  info: "bg-[#3D4FB8]",
  danger: "bg-app-danger",
  muted: "bg-app-ink-faint",
  ink: "bg-app-ink",
};

function change(current: number, previous: number, t: SupplierT) {
  if (previous <= 0) return current > 0 ? t("analytics.newThisMonth") : t("analytics.noOrdersYet");
  const pct = Math.round(((current - previous) / previous) * 100);
  return pct >= 0 ? t("analytics.up", { pct: Math.abs(pct) }) : t("analytics.down", { pct: Math.abs(pct) });
}

export default async function SupplierAnalyticsPage() {
  const user = await requireRole(["supplier"], "/supplier/login");
  const supplier = await getSupplierForUser(user);
  ensureSupplierAccess(supplier);
  const t = await getT("supplier", "common");
  const analytics = supplierLimits(await planOfUser(user.id)).analytics;
  const lagosLabel = new Intl.DateTimeFormat(t.locale === "en" ? "en-GB" : intlLocale(t.locale), { timeZone: "Africa/Lagos", day: "numeric", month: "short" });

  const [orders, products, quoteCounts] = await Promise.all([
    db.wholesaleOrder.findMany({
      where: { supplierId: supplier.id },
      orderBy: { createdAt: "desc" },
      take: 200,
      include: { seller: { select: { name: true } }, supplierProduct: { select: { name: true } } },
    }),
    db.supplierProduct.count({ where: { supplierId: supplier.id } }),
    db.supplierQuoteRequest.groupBy({ by: ["status"], where: { supplierId: supplier.id }, _count: { _all: true } }),
  ]);

  const now = Date.now();
  const totalRevenue = orders.reduce((s, o) => s + Number(o.totalPrice), 0);
  const fulfilled = orders.filter((o) => o.status === "delivered" || o.status === "shipped");
  const refunded = orders.filter((o) => o.status === "refunded").length;
  const fulfillmentRate = orders.length > 0 ? Math.round((fulfilled.length / orders.length) * 100) : 0;
  const inWindow = (from: number, to: number) => orders.filter((o) => o.createdAt.getTime() >= from && o.createdAt.getTime() < to);
  const last30 = inWindow(now - 30 * DAY, now + 1);
  const prev30 = inWindow(now - 60 * DAY, now - 30 * DAY);
  const sum = (list: typeof orders) => list.reduce((s, o) => s + Number(o.totalPrice), 0);

  // Daily order value, last 14 days (Lagos time).
  const days = Array.from({ length: 14 }, (_, i) => new Date(now - (13 - i) * DAY));
  const byDay = new Map<string, number>();
  for (const o of orders) {
    const key = lagosDay.format(o.createdAt);
    byDay.set(key, (byDay.get(key) ?? 0) + Number(o.totalPrice));
  }
  const daily = days.map((d) => byDay.get(lagosDay.format(d)) ?? 0);
  const dailyMax = Math.max(1, ...daily);
  const week = daily.slice(-7).reduce((s, v) => s + v, 0);

  const productAgg = new Map<string, { qty: number; rev: number }>();
  orders.forEach((o) => {
    const name = o.supplierProduct?.name ?? t("analytics.unknownProduct");
    const cur = productAgg.get(name) ?? { qty: 0, rev: 0 };
    cur.qty += o.quantity;
    cur.rev += Number(o.totalPrice);
    productAgg.set(name, cur);
  });
  const topProducts = [...productAgg.entries()].map(([name, d]) => ({ name, ...d })).sort((a, b) => b.rev - a.rev).slice(0, 5);
  const topMax = Math.max(1, ...topProducts.map((p) => p.rev));

  const statusAgg: Record<string, number> = {};
  orders.forEach((o) => { statusAgg[o.status] = (statusAgg[o.status] ?? 0) + 1; });

  const weekCounts = Array.from({ length: 4 }, (_, i) => inWindow(now - (4 - i) * 7 * DAY, now - (3 - i) * 7 * DAY).length);
  const weekLabels = [t("analytics.weeksAgo", { count: 3 }), t("analytics.weeksAgo", { count: 2 }), t("time.lastWeek"), t("time.thisWeek")];
  const weekMax = Math.max(1, ...weekCounts);

  const quoteCount = (status: string) => quoteCounts.find((row) => row.status === status)?._count._all ?? 0;
  const decided = quoteCount("accepted") + quoteCount("rejected") + quoteCount("expired") + quoteCount("responded");
  const winRate = decided > 0 ? `${Math.round((quoteCount("accepted") / decided) * 100)}%` : "—";

  const quality: Array<[string, string]> = [
    [t("analytics.shippedDelivered"), `${fulfillmentRate}%`],
    [t("orderStatus.refunded"), orders.length > 0 ? `${Math.round((refunded / orders.length) * 100)}%` : "—"],
    [t("analytics.rating"), supplier.ratingCount > 0 ? t("analytics.ratingFrom", { rating: supplier.rating.toFixed(1), count: supplier.ratingCount }) : t("analytics.noRatings")],
    [t("analytics.responseTime"), supplier.responseTimeLabel ?? supplier.responseTime ?? t("payouts.notSet")],
    [t("analytics.quotesAccepted"), winRate],
  ];

  return (
    <AppPage
      frame={supplierFrame(user, supplier)}
      title={t("analytics.title")}
      sub={orders.length === 200 ? t("analytics.subLatest", { count: orders.length, amount: money(totalRevenue) }) : t("analytics.sub", { count: orders.length, amount: money(totalRevenue) })}
    >
      <StatGrid className="mb-5">
        <StatTile tone="card" label={t("analytics.value30")} value={money(sum(last30))} hint={change(sum(last30), sum(prev30), t)} />
        <StatTile tone="card" label={t("analytics.orders30")} value={last30.length} hint={change(last30.length, prev30.length, t)} />
        <StatTile tone="card" label={t("products.title")} value={products} hint={t("analytics.inCatalogue")} />
        <StatTile tone="card" label={t("analytics.fulfilmentRate")} value={`${fulfillmentRate}%`} hint={t("analytics.ofOrders", { done: fulfilled.length, total: orders.length })} />
      </StatGrid>

      <AnalyticsPlanNote level={analytics} billingHref="/supplier/profile?tab=Billing%20%26%20Plan" exportHref="/api/supplier/analytics/export" />

      {analytics === "basic" ? null : orders.length === 0 ? (
        <EmptyState icon="chart" title={t("analytics.emptyTitle")}>
          {t("analytics.emptyBody")}
        </EmptyState>
      ) : (
        <SplitLayout
          main={
            <>
              <Card className="p-5">
                <CardHead title={t("analytics.value14")} sub={t("analytics.last7", { amount: money(week) })} />
                <div className="mt-5 flex h-[180px] items-end gap-1.5 sm:gap-2" role="img" aria-label={t("analytics.chartAria", { amount: money(week) })}>
                  {daily.map((value, index) => (
                    <div
                      key={index}
                      title={`${lagosLabel.format(days[index])}: ${money(value)}`}
                      className={cx("flex-1 rounded-[8px]", index === daily.length - 1 ? "bg-app-accent" : index >= daily.length - 7 ? "bg-app-ink" : "bg-app-track")}
                      style={{ height: `${Math.max(4, (value / dailyMax) * 100)}%` }}
                    />
                  ))}
                </div>
                <div className="mt-2 flex justify-between text-[12px] text-app-ink-soft">
                  <span>{lagosLabel.format(days[0])}</span>
                  <span>{t("time.today")}</span>
                </div>
              </Card>

              <div className="grid gap-5 lg:grid-cols-2">
                <Card className="p-5">
                  <CardHead title={t("analytics.byWeek")} />
                  <div className="mt-4 grid gap-3">
                    {weekCounts.map((count, index) => (
                      <div key={weekLabels[index]}>
                        <div className="flex justify-between text-[13.5px]">
                          <span className="font-bold">{weekLabels[index]}</span>
                          <span className="text-app-ink-soft">{t("analytics.orderCount", { count })}</span>
                        </div>
                        <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-app-canvas">
                          <div className={cx("h-full rounded-full", index === 3 ? "bg-app-accent" : "bg-app-ink")} style={{ width: `${(count / weekMax) * 100}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="mb-0 mt-3 text-[13px] text-app-ink-soft">
                    {weekCounts[3] > weekCounts[2] ? t("analytics.more") : weekCounts[3] < weekCounts[2] ? t("analytics.fewer") : t("analytics.same")}
                  </p>
                </Card>

                <Card className="p-5">
                  <CardHead title={t("analytics.byStage")} />
                  <div className="mt-4 grid gap-3">
                    {Object.entries(statusAgg).map(([status, count]) => {
                      const stage = statusOf(ORDER_STATUS, status, t);
                      return (
                        <div key={status}>
                          <div className="flex justify-between text-[13.5px]">
                            <span className="font-bold">{stage.label}</span>
                            <span className="text-app-ink-soft">{count}</span>
                          </div>
                          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-app-canvas">
                            <div className={cx("h-full rounded-full", BAR_TONE[stage.tone])} style={{ width: `${(count / orders.length) * 100}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </Card>
              </div>
            </>
          }
          side={
            <>
              <Card className="p-5">
                <CardHead title={t("analytics.bestSellers")} sub={t("analytics.byValue")} />
                <div className="mt-4 grid gap-3.5">
                  {topProducts.map((product) => (
                    <div key={product.name}>
                      <div className="flex justify-between gap-3 text-[13.5px]">
                        <span className="min-w-0 truncate font-bold">{product.name}</span>
                        <span className="shrink-0 text-app-ink-soft">{money(product.rev)}</span>
                      </div>
                      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-app-canvas">
                        <div className="h-full rounded-full bg-app-forest" style={{ width: `${(product.rev / topMax) * 100}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </Card>

              <Card className="p-5">
                <CardHead title={t("analytics.quality")} />
                <dl className="m-0 mt-2 divide-y divide-app-line text-[14px]">
                  {quality.map(([label, value]) => (
                    <div key={label} className="flex justify-between gap-3 py-2.5">
                      <dt className="text-app-ink-soft">{label}</dt>
                      <dd className="m-0 text-right font-bold">{value}</dd>
                    </div>
                  ))}
                </dl>
              </Card>
            </>
          }
        />
      )}
    </AppPage>
  );
}
