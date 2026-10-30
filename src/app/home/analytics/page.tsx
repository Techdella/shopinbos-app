import type { Metadata } from "next";
import type { ReactNode } from "react";
import { db } from "@/lib/db/client";
import { requireRole } from "@/lib/server-auth";
import { SellerPage, storeSummary } from "@/components/seller/SellerPage";
import { pilotNumbersOnForOwner } from "@/lib/pilot-numbers.server";
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
import { getLocale, getT } from "@/lib/i18n/server";
import { formatNumber, type TFunction } from "@shared/i18n";
import type { MessageKey } from "@shared/i18n/catalog";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  const t = await getT("analytics");
  return { title: t("title") };
}

type Search = Promise<{ range?: string; from?: string; to?: string }>;
type AnalyticsT = TFunction<MessageKey<"analytics"> | MessageKey<"common">>;

const pct = (value: number | null, digits = 1, none = "No visits yet") => (value == null ? none : `${(value * 100).toFixed(digits).replace(/\.0$/, "")}%`);

function hourName(h: number) {
  return `${h % 12 === 0 ? 12 : h % 12}${h < 12 ? "am" : "pm"}`;
}

/** "▲ 12% vs before" with words, so the direction never relies on colour alone. */
function Delta({ change, upIsGood = true, t }: { change: number | null | undefined; upIsGood?: boolean; t: AnalyticsT }) {
  if (change == null) return <span className="text-app-ink-soft">{t("delta.none")}</span>;
  if (change === 0) return <span className="text-app-ink-soft">{t("delta.same")}</span>;
  const up = change > 0;
  const good = up === upIsGood;
  return (
    <span className={cx("inline-flex items-center gap-1 font-bold", good ? "text-app-success" : "text-app-danger")}>
      <span aria-hidden="true">{up ? "▲" : "▼"}</span>
      {up ? t("delta.up") : t("delta.down")} {Math.abs(change)}%<span className="font-normal text-app-ink-soft"> {t("delta.vsBefore")}</span>
    </span>
  );
}

function AttributionList({ title, rows, empty, extraLabel, href, t }: { title: string; rows: AttributionRow[]; empty: ReactNode; extraLabel?: string; href: string; t: AnalyticsT }) {
  const max = Math.max(1, ...rows.map((row) => row.sales));
  return (
    <Card className="p-5">
      <CardHead title={title} action={<TextLink href={href}>{t("open")}</TextLink>} />
      {rows.length ? (
        <ul className="m-0 mt-4 grid list-none gap-4 p-0">
          {rows.slice(0, 6).map((row) => (
            <li key={row.key}>
              <ShareBar
                label={<>{row.label}{row.sub ? <span className="font-normal text-app-ink-soft"> · {row.sub}</span> : null}</>}
                value={t("paidSales", { count: row.orders, sales: naira(row.sales) })}
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
  const t = await getT("analytics", "common");
  const locale = await getLocale();
  const n = (value: number) => formatNumber(value, locale);
  const params = await searchParams;
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true, name: true, slug: true, logoUrl: true } });
  const now = new Date();
  const range = resolveRange(params, now);

  if (!store) {
    return (
      <SellerPage user={user} store={null} title={t("title")}>
        <EmptyState icon="chart" title={t("noStore.title")} action={<PillLink href="/onboarding" tone="ink">{t("noStore.action")}</PillLink>}>
          {t("noStore.body")}
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
  // Shops in the pilot also get their Pilot numbers (link/QR visits, repeat buyers, resell, videos).
  const pilotOn = await pilotNumbersOnForOwner(user.id);
  const tPilot = await getT("pilotNumbers");

  const k = report.kpis;
  const query = (extra: Record<string, string>) => `?${new URLSearchParams(extra).toString()}`;
  const rangeQuery: Record<string, string> = range.key === "custom" ? { range: "custom", from: range.fromDay, to: range.toDay } : { range: range.key };
  const exportHref = `/api/app/analytics/export${query(rangeQuery)}`;
  const previousLabel =
    range.key === "today" ? t("prev.yesterday") : t("prev.range", { from: formatDay(range.previous.start), to: formatDay(new Date(range.previous.end.getTime() - 1), true) });

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
    { key: "sales", label: t("kpi.sales"), value: naira(k.sales), hint: t("kpi.salesHint") },
    { key: "orders", label: t("kpi.orders"), value: n(k.orders), hint: t("kpi.ordersHint", { count: k.placedOrders }) },
    { key: "aov", label: t("kpi.aov"), value: naira(k.aov) },
    { key: "visits", label: t("kpi.visits"), value: n(k.visits), hint: t("kpi.visitsHint") },
    { key: "conversionRate", label: t("kpi.conversion"), value: pct(k.conversionRate, 1, t("kpi.noVisits")), hint: t("kpi.conversionHint") },
    { key: "returningRate", label: t("kpi.returning"), value: k.returningRate == null ? t("kpi.noBuyers") : pct(k.returningRate, 0), hint: t("kpi.returningHint", { returning: k.returningCustomers, total: k.customers }) },
    { key: "refundsCount", label: t("kpi.refunds"), value: n(k.refundsCount), hint: k.refundsValue ? t("kpi.refundsValue", { amount: naira(k.refundsValue) }) : t("kpi.refundsHint"), upIsGood: false },
  ];

  return (
    <SellerPage
      user={user}
      store={storeSummary(store)}
      title={t("title")}
      sub={t("sub")}
      actions={
        <>
          {pilotOn ? <PillLink href="/home/pilot-numbers" icon="chart">{tPilot("open")}</PillLink> : null}
          <a href={exportHref} className={buttonClass("white")} download>
            <Icon name="download" size={16} />
            {t("export")}
          </a>
        </>
      }
    >
      <div className="grid gap-5">
        {/* Date range: presets first, custom dates behind a toggle. Scopes everything below. */}
        <div className="flex flex-wrap items-center gap-3">
          <FilterChips
            items={[
              ...RANGE_PRESETS.map((preset) => ({ label: t.dynamic(`range.${preset.key}`, preset.label), href: query({ range: preset.key }), active: range.key === preset.key })),
              ...(range.key === "custom" ? [{ label: range.label, href: query(rangeQuery), active: true }] : []),
            ]}
          />
          <details className="group relative">
            <summary className="inline-flex min-h-[40px] cursor-pointer list-none items-center gap-2 rounded-full border border-app-line bg-white px-4 text-[14px] font-bold hover:border-app-line-strong [&::-webkit-details-marker]:hidden">
              <Icon name="calendar" size={15} />
              {t("custom.title")}
            </summary>
            <form method="get" className="z-20 mt-2 grid w-[min(320px,calc(100vw-32px))] sm:absolute sm:left-0 gap-3 rounded-[18px] border border-app-line bg-white p-4 shadow-[0_12px_32px_rgba(22,20,31,0.12)]">
              <input type="hidden" name="range" value="custom" />
              <label className="grid gap-1 text-[13px] font-bold">
                {t("custom.from")}
                <input type="date" name="from" defaultValue={range.fromDay} max={range.toDay} required className={inputClass} />
              </label>
              <label className="grid gap-1 text-[13px] font-bold">
                {t("custom.to")}
                <input type="date" name="to" defaultValue={range.toDay} required className={inputClass} />
              </label>
              <button type="submit" className={buttonClass("ink")}>{t("custom.show")}</button>
            </form>
          </details>
          <p className="m-0 text-[13.5px] text-app-ink-soft">{t("comparedWith", { previous: previousLabel })}</p>
        </div>

        {range.error && <p role="alert" className="m-0 rounded-[14px] bg-app-danger-tint px-4 py-3 text-[14px] text-app-danger">{range.error} {t("showingLast30")}</p>}
        {truncated && <p className="m-0 rounded-[14px] bg-app-peach px-4 py-3 text-[14px]">{t("truncated")}</p>}

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 2xl:grid-cols-7">
          {tiles.map((tile) => (
            <StatTile
              key={tile.key}
              tone="card"
              label={tile.label}
              value={tile.value}
              hint={
                <span className="grid gap-0.5">
                  <Delta change={report.change[tile.key]} upIsGood={tile.upIsGood ?? true} t={t} />
                  {tile.hint && <span>{tile.hint}</span>}
                </span>
              }
            />
          ))}
        </div>

        <Card className="p-5">
          <CardHead title={t("trend.title")} sub={t("trend.sub", { range: range.key === "custom" ? range.label : t.dynamic(`range.${range.key}`, range.label), sales: naira(k.sales), count: k.orders })} />
          <div className="mt-4">
            <TrendChart points={report.series} rangeLabel={range.key === "custom" ? range.label : t.dynamic(`range.${range.key}`, range.label)} />
          </div>
        </Card>

        <div className="grid gap-5 xl:grid-cols-2">
          <Card className="p-5">
            <CardHead title={t("top.title")} sub={t("top.sub")} action={<TextLink href="/products">{t("top.all")}</TextLink>} />
            {report.topProducts.length ? (
              <ul className="m-0 mt-4 grid list-none gap-3 p-0">
                {report.topProducts.map((product, index) => (
                  <li key={product.key} className="flex items-center gap-3">
                    <Thumb src={product.image} label={product.name} size={40} />
                    <div className="min-w-0 flex-1">
                      <ShareBar label={product.name} value={naira(product.sales)} share={product.sales / topMax} tone={index === 0 ? "accent" : "ink"} />
                      <div className="mt-1 text-[12.5px] text-app-ink-soft">
                        {t("top.sold", { count: product.quantity })}
                        {product.views != null && product.views > 0 ? ` · ${t("top.views", { count: product.views })} · ${t("top.perView", { pct: Math.round((product.quantity / product.views) * 100) })}` : ""}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mb-0 mt-2 text-[14px] text-app-ink-soft">{t("top.empty")}</p>
            )}
          </Card>

          <Card className="p-5">
            <CardHead title={t("channels.title")} sub={t("channels.sub")} action={<TextLink href="/channels">{t("channels.sellEverywhere")}</TextLink>} />
            {report.channels.length ? (
              <ul className="m-0 mt-4 grid list-none gap-4 p-0">
                {report.channels.map((row) => (
                  <li key={row.key || "none"}>
                    <ShareBar label={row.key ? row.label : t("channels.notRecorded")} value={t("paidSales", { count: row.orders, sales: naira(row.sales) })} share={row.sales / channelMax} />
                    {row.visits > 0 && <div className="mt-1 text-[12.5px] text-app-ink-soft">{t("visits", { count: row.visits })}{row.orders ? ` · ${t("converted", { pct: pct(row.orders / row.visits) })}` : ""}</div>}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mb-0 mt-2 text-[14px] text-app-ink-soft">{t("channels.empty")}</p>
            )}
            <p className="mb-0 mt-4 border-t border-app-line pt-3 text-[12.5px] leading-[1.5] text-app-ink-soft">
              {t("channels.note")}
            </p>
          </Card>
        </div>

        <div className="grid gap-5 lg:grid-cols-2 2xl:grid-cols-3">
          <Card className="p-5">
            <CardHead title={t("customers.title")} sub={t("customers.sub")} />
            {customersTotal ? (
              <>
                <div className="mt-4 flex h-3 overflow-hidden rounded-full bg-app-canvas" role="img" aria-label={t("customers.aria", { new: report.customers.new.customers, returning: report.customers.returning.customers })}>
                  <div className="h-full bg-app-ink" style={{ width: `${(report.customers.new.customers / customersTotal) * 100}%` }} />
                  <div className="h-full border-l-2 border-white bg-app-accent" style={{ width: `${(report.customers.returning.customers / customersTotal) * 100}%` }} />
                </div>
                <dl className="m-0 mt-4 grid grid-cols-2 gap-3">
                  {([[t("customers.new"), "bg-app-ink", report.customers.new], [t("customers.returning"), "bg-app-accent", report.customers.returning]] as const).map(([label, swatch, row]) => (
                    <div key={label} className="min-w-0 rounded-[14px] bg-app-canvas px-3.5 py-2.5">
                      <dt className="flex items-center gap-2 text-[12.5px] text-app-ink-soft"><span className={cx("h-2.5 w-2.5 rounded-[3px]", swatch)} />{label}</dt>
                      <dd className="m-0 mt-0.5 text-[17px] font-extrabold">{t("customers.buyers", { count: row.customers })}</dd>
                      <dd className="m-0 truncate text-[12px] text-app-ink-soft">{t("customers.orders", { count: row.orders })} · {naira(row.sales)}</dd>
                    </div>
                  ))}
                </dl>
              </>
            ) : (
              <p className="mb-0 mt-2 text-[14px] text-app-ink-soft">{t("customers.empty")}</p>
            )}
          </Card>

          <Card className="p-5">
            <CardHead title={t("funnel.title")} sub={t("funnel.sub")} />
            <ol className="m-0 mt-4 grid list-none gap-3 p-0">
              {report.funnel.map((step, index) => {
                const before = index > 0 ? report.funnel[index - 1].count : 0;
                return (
                  <li key={step.key}>
                    <div className="flex justify-between gap-3 text-[14px]">
                      <span className="font-bold">{t.dynamic(`funnel.step.${step.key}`, step.label)}</span>
                      <span className="text-app-ink-soft">
                        {n(step.count)}
                        {index > 0 && before > 0 ? ` · ${t("funnel.ofBefore", { pct: Math.round((step.count / before) * 100) })}` : ""}
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
                ? t("funnel.off")
                : trackingStarted
                  ? t("funnel.countedFrom", { date: formatDay(new Date(`${trackingStarted}T12:00:00+01:00`), true) })
                  : t("funnel.startsNext")}
            </p>
          </Card>

          <Card className="p-5">
            <CardHead title={t("sources.title")} sub={t("sources.sub")} />
            {report.sources.length ? (
              <ul className="m-0 mt-4 grid list-none gap-3 p-0">
                {report.sources.slice(0, 8).map((row) => (
                  <li key={row.key || "direct"}>
                    <ShareBar label={row.key ? row.label : t("sources.direct")} value={n(row.visits)} share={row.visits / Math.max(1, report.sources[0].visits)} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mb-0 mt-2 text-[14px] text-app-ink-soft">{t("sources.empty")}</p>
            )}
            {report.utmCampaigns.length > 0 && (
              <div className="mt-4 border-t border-app-line pt-3">
                <h3 className="m-0 text-[13.5px] font-bold">{t("sources.utm")}</h3>
                <ul className="m-0 mt-2 grid list-none gap-1.5 p-0 text-[13.5px]">
                  {report.utmCampaigns.slice(0, 8).map((row) => (
                    <li key={row.key} className="flex justify-between gap-3"><span className="min-w-0 truncate">{row.key}</span><span className="shrink-0 text-app-ink-soft">{t("visits", { count: row.visits })}</span></li>
                  ))}
                </ul>
              </div>
            )}
          </Card>
        </div>

        <section aria-labelledby="attribution-title" className="grid gap-3">
          <h2 id="attribution-title" className="m-0 text-[20px] font-extrabold tracking-[-0.3px]">{t("attr.title")}</h2>
          <div className="grid gap-5 md:grid-cols-2 2xl:grid-cols-4">
            <AttributionList t={t} title={t("attr.email")} rows={report.attribution.email} href="/home/marketing/campaigns" empty={t("attr.emailEmpty")} />
            <AttributionList t={t} title={t("attr.ads")} rows={report.attribution.ads} extraLabel={t("attr.spend")} href="/home/ads" empty={t("attr.adsEmpty")} />
            <AttributionList t={t} title={t("attr.creators")} rows={report.attribution.affiliates} href="/home/affiliates" empty={t("attr.creatorsEmpty")} />
            <AttributionList t={t} title={t("attr.codes")} rows={report.attribution.discounts} extraLabel={t("attr.given")} href="/home/discounts" empty={t("attr.codesEmpty")} />
          </div>
        </section>

        <section aria-labelledby="habits-title" className="grid gap-3">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <h2 id="habits-title" className="m-0 text-[20px] font-extrabold tracking-[-0.3px]">{t("habits.title")}</h2>
            <span className="text-[13px] text-app-ink-soft">{t("habits.sub")}</span>
          </div>
          <div className="grid gap-5 lg:grid-cols-2 2xl:grid-cols-3">
            <Card className="p-5">
              <CardHead title={t("hours.title")} sub={t("hours.sub")} />
              <div className="mt-5">
                <Bars
                  values={insights.hours}
                  labels={insights.hours.map((_, hour) => (hour % 6 === 0 ? hourName(hour) : hour === 23 ? "11pm" : ""))}
                  format={(value) => t("customers.orders", { count: value })}
                  highlightLast={false}
                  height={130}
                  summary={insights.peakHour == null ? t("hours.none") : t("hours.summary", { from: hourName(insights.peakHour), to: hourName((insights.peakHour + 1) % 24) })}
                />
              </div>
              <p className="mb-0 mt-3 text-[13.5px] text-app-ink-soft">
                {insights.peakHour == null ? t("hours.later") : <>{t("hours.busiest")} <strong className="text-app-ink">{t("hours.fromTo", { from: hourName(insights.peakHour), to: hourName((insights.peakHour + 1) % 24) })}</strong>. {t("hours.tip")}</>}
              </p>
            </Card>

            <Card className="p-5">
              <CardHead title={t("cohorts.title")} sub={t("cohorts.sub")} />
              {insights.cohorts.length ? (
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full min-w-[300px] border-separate border-spacing-1 text-[12.5px]">
                    <thead>
                      <tr className="text-app-ink-soft">
                        <th scope="col" className="text-left font-semibold">{t("cohorts.started")}</th>
                        {[t("cohorts.first"), "+1", "+2", "+3", "+4"].map((label) => <th key={label} scope="col" className="font-semibold">{label}</th>)}
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
                <p className="mb-0 mt-2 text-[14px] text-app-ink-soft">{t("cohorts.empty")}</p>
              )}
            </Card>

            <Card className="p-5">
              <CardHead title={t("cities.title")} sub={insights.cityCount ? t("cities.sub", { shown: insights.cities.length, total: insights.cityCount }) : undefined} />
              {insights.cities.length ? (
                <ul className="m-0 mt-4 grid list-none gap-3 p-0">
                  {insights.cities.map((city) => (
                    <li key={city.city}>
                      <ShareBar label={city.city} value={`${naira(city.revenue)} · ${Math.round(city.share * 100)}%`} share={city.share} />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mb-0 mt-2 text-[14px] text-app-ink-soft">{t("cities.empty")}</p>
              )}
            </Card>
          </div>
        </section>

        <p className="m-0 flex flex-wrap items-center gap-2 text-[13px] text-app-ink-soft">
          <Pill tone="muted">{t("how.title")}</Pill>
          {t("how.body")} <TextLink href="/home/marketing/analytics">{t("how.link")}</TextLink>.
        </p>
      </div>
    </SellerPage>
  );
}
