import type { Metadata } from "next";
import type { ReactNode } from "react";
import { db } from "@/lib/db/client";
import { requireRole } from "@/lib/server-auth";
import { SellerPage, storeSummary } from "@/components/seller/SellerPage";
import { Card, CardHead, EmptyState, FilterChips, Pill, PillLink, StatTile, TextLink, Thumb } from "@/components/app-kit";
import { Bars, ShareBar, buttonClass, inputClass } from "@/components/growth/kit";
import { Icon } from "@/components/ui/Icon";
import { cx } from "@/components/app-ui/cx";
import { loadAnalytics } from "@/lib/analytics/load";
import { RANGE_PRESETS, formatDay, resolveRange } from "@/lib/analytics/range";
import type { AttributionRow, KpiKey } from "@/lib/analytics/compute";
import { computeSellerInsights } from "@/lib/insights";
import { naira } from "@shared/onboarding";
import { TrendChart } from "./TrendChart";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Analytics" };

type Search = Promise<{ range?: string; from?: string; to?: string }>;

const pct = (value: number | null, digits = 1) => (value == null ? "No visits yet" : `${(value * 100).toFixed(digits).replace(/\.0$/, "")}%`);

function hourName(h: number) {
  return `${h % 12 === 0 ? 12 : h % 12}${h < 12 ? "am" : "pm"}`;
}

/** "▲ 12% vs before" with words, so the direction never relies on colour alone. */
function Delta({ change, upIsGood = true }: { change: number | null | undefined; upIsGood?: boolean }) {
  if (change == null) return <span className="text-app-ink-soft">No earlier data to compare</span>;
  if (change === 0) return <span className="text-app-ink-soft">Same as the period before</span>;
  const up = change > 0;
  const good = up === upIsGood;
  return (
    <span className={cx("inline-flex items-center gap-1 font-bold", good ? "text-app-success" : "text-app-danger")}>
      <span aria-hidden="true">{up ? "▲" : "▼"}</span>
      {up ? "Up" : "Down"} {Math.abs(change)}%<span className="font-normal text-app-ink-soft"> vs before</span>
    </span>
  );
}

function AttributionList({ title, rows, empty, extraLabel, href }: { title: string; rows: AttributionRow[]; empty: ReactNode; extraLabel?: string; href: string }) {
  const max = Math.max(1, ...rows.map((row) => row.sales));
  return (
    <Card className="p-5">
      <CardHead title={title} action={<TextLink href={href}>Open</TextLink>} />
      {rows.length ? (
        <ul className="m-0 mt-4 grid list-none gap-4 p-0">
          {rows.slice(0, 6).map((row) => (
            <li key={row.key}>
              <ShareBar
                label={<>{row.label}{row.sub ? <span className="font-normal text-app-ink-soft"> · {row.sub}</span> : null}</>}
                value={`${row.orders} paid · ${naira(row.sales)}`}
                share={row.sales / max}
              />
              {extraLabel && row.extra ? <div className="mt-1 text-[12.5px] text-app-ink-soft">{extraLabel} {naira(row.extra)}</div> : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mb-0 mt-2 text-[14px] leading-[1.5] text-app-ink-soft">{empty}</p>
      )}
    </Card>
  );
}

export default async function AnalyticsPage({ searchParams }: { searchParams: Search }) {
  const user = await requireRole(["seller"], "/login");
  const params = await searchParams;
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true, name: true, slug: true, logoUrl: true } });
  const now = new Date();
  const range = resolveRange(params, now);

  if (!store) {
    return (
      <SellerPage user={user} store={null} title="How your shop is doing">
        <EmptyState icon="chart" title="Set up your store first" action={<PillLink href="/onboarding" tone="ink">Start setup</PillLink>}>
          Your numbers show up here once you have a store and your first orders.
        </EmptyState>
      </SellerPage>
    );
  }

  const since = new Date(now.getTime() - 180 * 86_400_000);
  const [{ report, countersAvailable, truncated }, orders] = await Promise.all([
    loadAnalytics(store.id, range, now),
    db.retailOrder.findMany({
      where: { storeId: store.id, createdAt: { gte: since } },
      select: { total: true, status: true, createdAt: true, buyerEmail: true, deliveryAddress: true, items: true },
      orderBy: { createdAt: "desc" },
      take: 5000,
    }),
  ]);
  // When people buy, cohorts and cities look at the last 180 days whatever the range (they need the history).
  const insights = computeSellerInsights(orders);

  const k = report.kpis;
  const query = (extra: Record<string, string>) => `?${new URLSearchParams(extra).toString()}`;
  const rangeQuery: Record<string, string> = range.key === "custom" ? { range: "custom", from: range.fromDay, to: range.toDay } : { range: range.key };
  const exportHref = `/api/app/analytics/export${query(rangeQuery)}`;
  const previousLabel =
    range.key === "today" ? "the same time yesterday" : `${formatDay(range.previous.start)} to ${formatDay(new Date(range.previous.end.getTime() - 1), true)}`;

  const funnelMax = Math.max(1, ...report.funnel.map((step) => step.count));
  const trackingStarted = report.funnel
    .filter((step) => step.key !== "placed" && step.key !== "paid")
    .map((step) => step.since)
    .filter((day): day is string => Boolean(day))
    .sort()[0];
  const channelMax = Math.max(1, ...report.channels.map((row) => row.sales));
  const topMax = Math.max(1, ...report.topProducts.map((row) => row.sales));
  const customersTotal = report.customers.new.customers + report.customers.returning.customers;

  const tiles: Array<{ key: KpiKey; label: string; value: string; hint?: ReactNode; upIsGood?: boolean }> = [
    { key: "sales", label: "Sales", value: naira(k.sales), hint: "Paid orders" },
    { key: "orders", label: "Paid orders", value: k.orders.toLocaleString("en-NG"), hint: `${k.placedOrders} placed in all` },
    { key: "aov", label: "Average order", value: naira(k.aov) },
    { key: "visits", label: "Store visits", value: k.visits.toLocaleString("en-NG"), hint: "Browser sessions on your store" },
    { key: "conversionRate", label: "Conversion rate", value: pct(k.conversionRate), hint: "Paid online orders per visit" },
    { key: "returningRate", label: "Returning customers", value: k.returningRate == null ? "No buyers yet" : pct(k.returningRate, 0), hint: `${k.returningCustomers} of ${k.customers} buyers had bought before` },
    { key: "refundsCount", label: "Refunded or cancelled", value: k.refundsCount.toLocaleString("en-NG"), hint: k.refundsValue ? `${naira(k.refundsValue)} in orders` : "Orders placed in this period", upIsGood: false },
  ];

  return (
    <SellerPage
      user={user}
      store={storeSummary(store)}
      title="How your shop is doing"
      sub="Sales, visits, customers and what brought them, from your real orders and store visits."
      actions={
        <a href={exportHref} className={buttonClass("white")} download>
          <Icon name="download" size={16} />
          Export CSV
        </a>
      }
    >
      <div className="grid gap-5">
        {/* Date range: presets first, custom dates behind a toggle. Scopes everything below. */}
        <div className="flex flex-wrap items-center gap-3">
          <FilterChips
            items={[
              ...RANGE_PRESETS.map((preset) => ({ label: preset.label, href: query({ range: preset.key }), active: range.key === preset.key })),
              ...(range.key === "custom" ? [{ label: range.label, href: query(rangeQuery), active: true }] : []),
            ]}
          />
          <details className="group relative">
            <summary className="inline-flex min-h-[40px] cursor-pointer list-none items-center gap-2 rounded-full border border-app-line bg-white px-4 text-[14px] font-bold hover:border-app-line-strong [&::-webkit-details-marker]:hidden">
              <Icon name="calendar" size={15} />
              Custom dates
            </summary>
            <form method="get" className="z-20 mt-2 grid w-[min(320px,calc(100vw-32px))] sm:absolute sm:left-0 gap-3 rounded-[18px] border border-app-line bg-white p-4 shadow-[0_12px_32px_rgba(22,20,31,0.12)]">
              <input type="hidden" name="range" value="custom" />
              <label className="grid gap-1 text-[13px] font-bold">
                From
                <input type="date" name="from" defaultValue={range.fromDay} max={range.toDay} required className={inputClass} />
              </label>
              <label className="grid gap-1 text-[13px] font-bold">
                To
                <input type="date" name="to" defaultValue={range.toDay} required className={inputClass} />
              </label>
              <button type="submit" className={buttonClass("ink")}>Show these dates</button>
            </form>
          </details>
          <p className="m-0 text-[13.5px] text-app-ink-soft">Compared with {previousLabel}.</p>
        </div>

        {range.error && <p role="alert" className="m-0 rounded-[14px] bg-app-danger-tint px-4 py-3 text-[14px] text-app-danger">{range.error} Showing the last 30 days.</p>}
        {truncated && <p className="m-0 rounded-[14px] bg-app-peach px-4 py-3 text-[14px]">This range has more than 20,000 orders, so only the newest 20,000 are counted. Pick a shorter range for exact totals.</p>}

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 2xl:grid-cols-7">
          {tiles.map((tile) => (
            <StatTile
              key={tile.key}
              tone="card"
              label={tile.label}
              value={tile.value}
              hint={
                <span className="grid gap-0.5">
                  <Delta change={report.change[tile.key]} upIsGood={tile.upIsGood ?? true} />
                  {tile.hint && <span>{tile.hint}</span>}
                </span>
              }
            />
          ))}
        </div>

        <Card className="p-5">
          <CardHead title="Sales over time" sub={`${range.label} · ${naira(k.sales)} from ${k.orders} paid order${k.orders === 1 ? "" : "s"}`} />
          <div className="mt-4">
            <TrendChart points={report.series} rangeLabel={range.label} />
          </div>
        </Card>

        <div className="grid gap-5 xl:grid-cols-2">
          <Card className="p-5">
            <CardHead title="Top products" sub="By sales from paid orders" action={<TextLink href="/products">All products</TextLink>} />
            {report.topProducts.length ? (
              <ul className="m-0 mt-4 grid list-none gap-3 p-0">
                {report.topProducts.map((product, index) => (
                  <li key={product.key} className="flex items-center gap-3">
                    <Thumb src={product.image} label={product.name} size={40} />
                    <div className="min-w-0 flex-1">
                      <ShareBar label={product.name} value={naira(product.sales)} share={product.sales / topMax} tone={index === 0 ? "accent" : "ink"} />
                      <div className="mt-1 text-[12.5px] text-app-ink-soft">
                        {product.quantity} sold
                        {product.views != null && product.views > 0 ? ` · ${product.views} view${product.views === 1 ? "" : "s"} · ${Math.round((product.quantity / product.views) * 100)}% bought per view` : ""}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mb-0 mt-2 text-[14px] text-app-ink-soft">No paid orders in this period yet.</p>
            )}
          </Card>

          <Card className="p-5">
            <CardHead title="Sales by channel" sub="Where each paid order came from" action={<TextLink href="/channels">Sell everywhere</TextLink>} />
            {report.channels.length ? (
              <ul className="m-0 mt-4 grid list-none gap-4 p-0">
                {report.channels.map((row) => (
                  <li key={row.key || "none"}>
                    <ShareBar label={row.label} value={`${row.orders} paid · ${naira(row.sales)}`} share={row.sales / channelMax} />
                    {row.visits > 0 && <div className="mt-1 text-[12.5px] text-app-ink-soft">{row.visits.toLocaleString("en-NG")} visit{row.visits === 1 ? "" : "s"}{row.orders ? ` · ${pct(row.orders / row.visits)} converted` : ""}</div>}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mb-0 mt-2 text-[14px] text-app-ink-soft">Nothing yet. Share tagged links from Sell everywhere so each sale shows its channel.</p>
            )}
            <p className="mb-0 mt-4 border-t border-app-line pt-3 text-[12.5px] leading-[1.5] text-app-ink-soft">
              The channel is saved when they pay, from the link the buyer used (?ref= or utm_source), or picked when you record a sale. &ldquo;Not recorded&rdquo; is older orders from before channels were saved.
            </p>
          </Card>
        </div>

        <div className="grid gap-5 lg:grid-cols-2 2xl:grid-cols-3">
          <Card className="p-5">
            <CardHead title="New and returning customers" sub="Buyers with paid orders in this period" />
            {customersTotal ? (
              <>
                <div className="mt-4 flex h-3 overflow-hidden rounded-full bg-app-canvas" role="img" aria-label={`${report.customers.new.customers} new and ${report.customers.returning.customers} returning customers`}>
                  <div className="h-full bg-app-ink" style={{ width: `${(report.customers.new.customers / customersTotal) * 100}%` }} />
                  <div className="h-full border-l-2 border-white bg-app-accent" style={{ width: `${(report.customers.returning.customers / customersTotal) * 100}%` }} />
                </div>
                <dl className="m-0 mt-4 grid grid-cols-2 gap-3">
                  {([["New", "bg-app-ink", report.customers.new], ["Returning", "bg-app-accent", report.customers.returning]] as const).map(([label, swatch, row]) => (
                    <div key={label} className="min-w-0 rounded-[14px] bg-app-canvas px-3.5 py-2.5">
                      <dt className="flex items-center gap-2 text-[12.5px] text-app-ink-soft"><span className={cx("h-2.5 w-2.5 rounded-[3px]", swatch)} />{label}</dt>
                      <dd className="m-0 mt-0.5 text-[17px] font-extrabold">{row.customers} buyer{row.customers === 1 ? "" : "s"}</dd>
                      <dd className="m-0 truncate text-[12px] text-app-ink-soft">{row.orders} order{row.orders === 1 ? "" : "s"} · {naira(row.sales)}</dd>
                    </div>
                  ))}
                </dl>
              </>
            ) : (
              <p className="mb-0 mt-2 text-[14px] text-app-ink-soft">No paying buyers in this period yet.</p>
            )}
          </Card>

          <Card className="p-5">
            <CardHead title="Store funnel" sub="Visits and actions on your store, then orders" />
            <ol className="m-0 mt-4 grid list-none gap-3 p-0">
              {report.funnel.map((step, index) => {
                const before = index > 0 ? report.funnel[index - 1].count : 0;
                return (
                  <li key={step.key}>
                    <div className="flex justify-between gap-3 text-[14px]">
                      <span className="font-bold">{step.label}</span>
                      <span className="text-app-ink-soft">
                        {step.count.toLocaleString("en-NG")}
                        {index > 0 && before > 0 ? ` · ${Math.round((step.count / before) * 100)}% of the step before` : ""}
                      </span>
                    </div>
                    <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-app-canvas">
                      <div className={cx("h-full rounded-full", step.key === "paid" ? "bg-app-accent" : "bg-app-ink")} style={{ width: `${(step.count / funnelMax) * 100}%` }} />
                    </div>
                  </li>
                );
              })}
            </ol>
            <p className="mb-0 mt-4 border-t border-app-line pt-3 text-[12.5px] leading-[1.5] text-app-ink-soft">
              {!countersAvailable
                ? "Store visit counting isn't switched on for this workspace yet, so only orders are shown."
                : trackingStarted
                  ? `Visits and store actions are counted from ${formatDay(new Date(`${trackingStarted}T12:00:00+01:00`), true)}. Counts are visits and actions, not unique people. Orders recorded in person aren't in the funnel.`
                  : "Visits and store actions start counting from the next visit to your store. Orders recorded in person aren't in the funnel."}
            </p>
          </Card>

          <Card className="p-5">
            <CardHead title="Where visits came from" sub="From ?ref= and utm_source on links" />
            {report.sources.length ? (
              <ul className="m-0 mt-4 grid list-none gap-3 p-0">
                {report.sources.slice(0, 8).map((row) => (
                  <li key={row.key || "direct"}>
                    <ShareBar label={row.label} value={row.visits.toLocaleString("en-NG")} share={row.visits / Math.max(1, report.sources[0].visits)} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mb-0 mt-2 text-[14px] text-app-ink-soft">No store visits counted in this period.</p>
            )}
            {report.utmCampaigns.length > 0 && (
              <div className="mt-4 border-t border-app-line pt-3">
                <h3 className="m-0 text-[13.5px] font-bold">Visits by link name</h3>
                <ul className="m-0 mt-2 grid list-none gap-1.5 p-0 text-[13.5px]">
                  {report.utmCampaigns.slice(0, 8).map((row) => (
                    <li key={row.key} className="flex justify-between gap-3"><span className="min-w-0 truncate">{row.key}</span><span className="shrink-0 text-app-ink-soft">{row.visits} visit{row.visits === 1 ? "" : "s"}</span></li>
                  ))}
                </ul>
              </div>
            )}
          </Card>
        </div>

        <section aria-labelledby="attribution-title" className="grid gap-3">
          <h2 id="attribution-title" className="m-0 text-[20px] font-extrabold tracking-[-0.3px]">What your marketing brought in</h2>
          <div className="grid gap-5 md:grid-cols-2 2xl:grid-cols-4">
            <AttributionList title="Email messages to customers" rows={report.attribution.email} href="/home/marketing/campaigns" empty="No paid orders from email links in this period." />
            <AttributionList title="Ads" rows={report.attribution.ads} extraLabel="Spend logged so far:" href="/home/ads" empty="No paid orders from ad links in this period." />
            <AttributionList title="Creators" rows={report.attribution.affiliates} href="/home/affiliates" empty="No paid orders from creator links in this period." />
            <AttributionList title="Discount codes" rows={report.attribution.discounts} extraLabel="Discount given:" href="/home/discounts" empty="No discount codes used on paid orders in this period." />
          </div>
        </section>

        <section aria-labelledby="habits-title" className="grid gap-3">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <h2 id="habits-title" className="m-0 text-[20px] font-extrabold tracking-[-0.3px]">Buying habits</h2>
            <span className="text-[13px] text-app-ink-soft">Last 180 days, whatever range is picked above</span>
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
                  summary={insights.peakHour == null ? "No paid orders yet." : `Most orders come in between ${hourName(insights.peakHour)} and ${hourName((insights.peakHour + 1) % 24)}.`}
                />
              </div>
              <p className="mb-0 mt-3 text-[13.5px] text-app-ink-soft">
                {insights.peakHour == null ? "Your busiest hour shows up once you have paid orders." : <>Busiest: <strong className="text-app-ink">{hourName(insights.peakHour)} to {hourName((insights.peakHour + 1) % 24)}</strong>. Post or send broadcasts just before.</>}
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
                              <td key={index} className="h-8 rounded-[8px] text-center font-bold" style={{ background: `rgba(22, 20, 31, ${Math.min(0.85, 0.06 + value / 120)})`, color: value > 45 ? "#fff" : "#16141F" }}>
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
              <CardHead title="Top delivery cities" sub={insights.cityCount ? `Top ${insights.cities.length} of ${insights.cityCount}` : undefined} />
              {insights.cities.length ? (
                <ul className="m-0 mt-4 grid list-none gap-3 p-0">
                  {insights.cities.map((city) => (
                    <li key={city.city}>
                      <ShareBar label={city.city} value={`${naira(city.revenue)} · ${Math.round(city.share * 100)}%`} share={city.share} />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mb-0 mt-2 text-[14px] text-app-ink-soft">Delivery cities show up once paid orders have an address.</p>
              )}
            </Card>
          </div>
        </section>

        <p className="m-0 flex flex-wrap items-center gap-2 text-[13px] text-app-ink-soft">
          <Pill tone="muted">How we count</Pill>
          Sales and orders are paid orders (paid, packing, shipped or delivered) by the date they were placed, Lagos time. Email open and click rates are in <TextLink href="/home/marketing/analytics">Marketing reports</TextLink>.
        </p>
      </div>
    </SellerPage>
  );
}
