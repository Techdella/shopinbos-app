import type { Metadata } from "next";
import { db } from "@/lib/db/client";
import { requireRole } from "@/lib/server-auth";
import { SellerPage, storeSummary } from "@/components/seller/SellerPage";
import { Card, CardHead, StatGrid, StatTile, TextLink } from "@/components/app-kit";
import { Bars, ShareBar } from "@/components/growth/kit";
import { InsightsExportButton } from "./InsightsExportButton";
import { computeSellerInsights } from "@/lib/insights";
import { isProPlan } from "@/lib/plan-limits";
import { naira } from "@shared/onboarding";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Reports" };

function hourName(h: number) {
  return `${h % 12 === 0 ? 12 : h % 12}${h < 12 ? "am" : "pm"}`;
}

function hourLabel(hour: number) {
  return `${hourName(hour)} to ${hourName((hour + 1) % 24)}`;
}

export default async function SellerInsightsPage() {
  const user = await requireRole(["seller"], "/login");
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true, name: true, slug: true, logoUrl: true } });
  const since = new Date(Date.now() - 180 * 86_400_000);
  const [orders, account] = await Promise.all([
    store
      ? db.retailOrder.findMany({
          where: { storeId: store.id, createdAt: { gte: since } },
          select: { total: true, status: true, createdAt: true, buyerEmail: true, deliveryAddress: true, items: true },
          orderBy: { createdAt: "desc" },
          take: 5000,
        })
      : Promise.resolve([]),
    db.user.findUnique({ where: { id: user.id }, select: { aiCredits: true } }),
  ]);

  const insights = computeSellerInsights(orders);
  const topValue = Math.max(...insights.topProducts.map((product) => product.revenue), 1);
  const aiCredits = account?.aiCredits ?? 0;
  const proPlan = isProPlan({ aiCredits });
  const month = insights.daily.data.reduce((sum, value) => sum + value, 0);
  const dailyLabels = insights.daily.labels.map((label, index) => (index === insights.daily.labels.length - 1 ? "Today" : label));

  return (
    <SellerPage
      user={user}
      store={storeSummary(store)}
      title="Reports"
      sub="Sales, buyers and best sellers from your orders over the last 180 days."
      actions={<InsightsExportButton />}
    >
      <div className="grid gap-5">
        <StatGrid>
          <StatTile tone="card" label="Sales" value={naira(insights.revenue)} hint="Paid orders" />
          <StatTile tone="card" label="Paid orders" value={insights.paidOrders} hint={`${insights.totalOrders} orders in all`} />
          <StatTile tone="card" label="Average order" value={naira(Math.round(insights.aov))} />
          <StatTile
            tone="card"
            label="Buyers who came back"
            value={insights.repeatRate == null ? "None yet" : `${Math.round(insights.repeatRate * 100)}%`}
            hint={insights.repeatRate == null ? "No paying buyers yet" : "Bought 2 or more times"}
          />
        </StatGrid>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px] 2xl:grid-cols-[minmax(0,1fr)_480px]">
          <Card className="p-5">
            <CardHead title="Sales, last 30 days" sub={`${naira(month)} from paid orders`} />
            <div className="mt-5">
              <Bars values={insights.daily.data} labels={dailyLabels} format={naira} recent={7} summary={`Daily sales for the last 30 days, ${naira(month)} in total.`} />
            </div>
            {insights.cities.length > 0 && (
              <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
                {insights.cities.map((city) => (
                  <div key={city.city} className="min-w-0 rounded-[14px] bg-app-canvas px-3.5 py-2.5">
                    <div className="truncate text-[12.5px] text-app-ink-soft">{city.city}</div>
                    <div className="truncate text-[16px] font-extrabold">{naira(city.revenue)}</div>
                    <div className="text-[12px] text-app-ink-soft">{Math.round(city.share * 100)}% of sales</div>
                  </div>
                ))}
              </div>
            )}
            <p className="mb-0 mt-3 text-[13px] text-app-ink-soft">
              {insights.cityCount > 0 ? `Top ${insights.cities.length} of ${insights.cityCount} delivery cities` : "Delivery cities show up once orders have an address."}
            </p>
          </Card>

          <Card className="p-5">
            <CardHead title="Best sellers" action={<TextLink href="/products">All products</TextLink>} />
            {insights.topProducts.length ? (
              <div className="mt-4 grid gap-4">
                {insights.topProducts.map((product, index) => (
                  <ShareBar key={`${product.name}-${index}`} label={product.name} value={`${product.quantity} sold · ${naira(product.revenue)}`} share={product.revenue / topValue} tone={index === 0 ? "accent" : "ink"} />
                ))}
              </div>
            ) : (
              <p className="mb-0 mt-2 text-[14px] text-app-ink-soft">Your best sellers show up after the first paid orders.</p>
            )}
          </Card>
        </div>

        <div className="grid gap-5 lg:grid-cols-2 2xl:grid-cols-3">
          <Card className="p-5">
            <CardHead title="When people buy" sub="Paid orders by hour, Lagos time" />
            <div className="mt-5">
              <Bars
                values={insights.hours}
                labels={insights.hours.map((_, hour) => (hour % 6 === 0 ? hourName(hour) : hour === 23 ? "11pm" : ""))}
                format={(value) => `${value} order${value === 1 ? "" : "s"}`}
                highlightLast={false}
                height={130}
                summary={insights.peakHour == null ? "No paid orders yet." : `Most orders come in between ${hourLabel(insights.peakHour)}.`}
              />
            </div>
            <p className="mb-0 mt-3 text-[13.5px] text-app-ink-soft">
              {insights.peakHour == null ? "Your busiest hour shows up once you have paid orders." : <>Busiest: <strong className="text-app-ink">{hourLabel(insights.peakHour)}</strong>. Send WhatsApp broadcasts just before.</>}
            </p>
          </Card>

          <Card className="p-5">
            <CardHead title="Buyers who come back" sub="Share of each month's new buyers who bought again" />
            {insights.cohorts.length ? (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[300px] border-separate border-spacing-1 text-[12.5px]">
                  <thead>
                    <tr className="text-app-ink-soft">
                      <th scope="col" className="text-left font-semibold">Started</th>
                      {["First month", "+1", "+2", "+3", "+4"].map((label) => <th key={label} scope="col" className="font-semibold">{label}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {insights.cohorts.map((row) => (
                      <tr key={row.month}>
                        <th scope="row" className="pr-2 text-left font-semibold text-app-ink-soft">{row.month}</th>
                        {Array.from({ length: 5 }, (_, index) => {
                          const value = row.retention[index];
                          if (value == null) return <td key={index} />;
                          return (
                            <td
                              key={index}
                              className="h-8 rounded-[8px] text-center font-bold"
                              style={{ background: `rgba(22, 20, 31, ${Math.min(0.85, 0.06 + value / 120)})`, color: value > 45 ? "#fff" : "#16141F" }}
                            >
                              {value}%
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="mb-0 mt-2 text-[14px] text-app-ink-soft">Shows up once buyers start paying.</p>
            )}
          </Card>

          <Card className="p-5">
            <CardHead title="AI credits" />
            <div className="mt-3 text-[36px] font-extrabold leading-none tracking-[-0.8px]">{aiCredits.toLocaleString("en-NG")}</div>
            <p className="mb-0 mt-2 text-[14px] text-app-ink-soft">For Rex copy, images and store edits.</p>
            <p className="mb-0 mt-4 border-t border-app-line pt-3 text-[14px] text-app-ink-soft">
              You&apos;re on <strong className="text-app-ink">{proPlan ? "Pro" : "Starter"}</strong>. <TextLink href="/home/settings?tab=Billing">Manage plan</TextLink>
            </p>
          </Card>
        </div>
      </div>
    </SellerPage>
  );
}
