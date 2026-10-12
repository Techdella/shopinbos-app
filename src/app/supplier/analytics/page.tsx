import { requireRole } from "@/lib/server-auth";
import { ensureSupplierAccess, getSupplierForUser } from "@/lib/role-queries";
import { db } from "@/lib/db/client";
import { AppPage, Card, CardHead, EmptyState, SplitLayout, StatGrid, StatTile } from "@/components/app-kit";
import { cx } from "@/components/app-ui/cx";
import { ORDER_STATUS, money, statusOf, supplierFrame } from "@/components/supplier/supplier-kit";

export const dynamic = "force-dynamic";

const DAY = 24 * 60 * 60 * 1000;
const lagosDay = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos", year: "numeric", month: "2-digit", day: "2-digit" });
const lagosLabel = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Lagos", day: "numeric", month: "short" });

const BAR_TONE: Record<string, string> = {
  accent: "bg-app-accent",
  success: "bg-app-success",
  warning: "bg-[#F2A93B]",
  info: "bg-[#3D4FB8]",
  danger: "bg-app-danger",
  muted: "bg-app-ink-faint",
  ink: "bg-app-ink",
};

function change(current: number, previous: number) {
  if (previous <= 0) return current > 0 ? "new this month" : "no orders yet";
  const pct = Math.round(((current - previous) / previous) * 100);
  return `${pct >= 0 ? "up" : "down"} ${Math.abs(pct)}% on the 30 days before`;
}

export default async function SupplierAnalyticsPage() {
  const user = await requireRole(["supplier"], "/supplier/login");
  const supplier = await getSupplierForUser(user);
  ensureSupplierAccess(supplier);

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
    const name = o.supplierProduct?.name ?? "Unknown product";
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
  const weekLabels = ["3 weeks ago", "2 weeks ago", "Last week", "This week"];
  const weekMax = Math.max(1, ...weekCounts);

  const quoteCount = (status: string) => quoteCounts.find((row) => row.status === status)?._count._all ?? 0;
  const decided = quoteCount("accepted") + quoteCount("rejected") + quoteCount("expired") + quoteCount("responded");
  const winRate = decided > 0 ? `${Math.round((quoteCount("accepted") / decided) * 100)}%` : "—";

  const quality: Array<[string, string]> = [
    ["Shipped or delivered", `${fulfillmentRate}%`],
    ["Refunded", orders.length > 0 ? `${Math.round((refunded / orders.length) * 100)}%` : "—"],
    ["Rating", supplier.ratingCount > 0 ? `${supplier.rating.toFixed(1)} from ${supplier.ratingCount}` : "No ratings yet"],
    ["Response time", supplier.responseTimeLabel ?? supplier.responseTime ?? "Not set"],
    ["Prices shops accepted", winRate],
  ];

  return (
    <AppPage
      frame={supplierFrame(user, supplier)}
      title="How you're doing"
      sub={`${orders.length} order${orders.length === 1 ? "" : "s"} worth ${money(totalRevenue)}${orders.length === 200 ? " (latest 200)" : ""}.`}
    >
      <StatGrid className="mb-5">
        <StatTile tone="card" label="Order value, 30 days" value={money(sum(last30))} hint={change(sum(last30), sum(prev30))} />
        <StatTile tone="card" label="Orders, 30 days" value={last30.length} hint={change(last30.length, prev30.length)} />
        <StatTile tone="card" label="Products" value={products} hint="in your catalogue" />
        <StatTile tone="card" label="Orders sent" value={`${fulfillmentRate}%`} hint={`${fulfilled.length} of ${orders.length} orders`} />
      </StatGrid>

      {orders.length === 0 ? (
        <EmptyState icon="chart" title="No orders to chart yet">
          Charts fill in as sellers order from you: daily order value, best sellers, and how fast you ship.
        </EmptyState>
      ) : (
        <SplitLayout
          main={
            <>
              <Card className="p-5">
                <CardHead title="Order value, last 14 days" sub={`${money(week)} in the last 7 days`} />
                <div className="mt-5 flex h-[180px] items-end gap-1.5 sm:gap-2" role="img" aria-label={`Daily order value for the last 14 days. Last 7 days ${money(week)}.`}>
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
                  <span>Today</span>
                </div>
              </Card>

              <div className="grid gap-5 lg:grid-cols-2">
                <Card className="p-5">
                  <CardHead title="Orders by week" />
                  <div className="mt-4 grid gap-3">
                    {weekCounts.map((count, index) => (
                      <div key={weekLabels[index]}>
                        <div className="flex justify-between text-[13.5px]">
                          <span className="font-bold">{weekLabels[index]}</span>
                          <span className="text-app-ink-soft">{count} order{count === 1 ? "" : "s"}</span>
                        </div>
                        <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-app-canvas">
                          <div className={cx("h-full rounded-full", index === 3 ? "bg-app-accent" : "bg-app-ink")} style={{ width: `${(count / weekMax) * 100}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="mb-0 mt-3 text-[13px] text-app-ink-soft">
                    {weekCounts[3] > weekCounts[2] ? "More orders than last week." : weekCounts[3] < weekCounts[2] ? "Fewer orders than last week." : "Same as last week."}
                  </p>
                </Card>

                <Card className="p-5">
                  <CardHead title="Orders by stage" />
                  <div className="mt-4 grid gap-3">
                    {Object.entries(statusAgg).map(([status, count]) => {
                      const stage = statusOf(ORDER_STATUS, status);
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
                <CardHead title="Best sellers" sub="By order value" />
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
                <CardHead title="Quality" />
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
