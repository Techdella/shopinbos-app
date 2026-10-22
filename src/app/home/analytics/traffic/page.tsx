import type { Metadata } from "next";
import type { ReactNode } from "react";
import { db } from "@/lib/db/client";
import { requireRole } from "@/lib/server-auth";
import { SellerPage, storeSummary } from "@/components/seller/SellerPage";
import { Card, CardHead, EmptyState, FilterChips, PillLink, StatTile, TextLink, Thumb } from "@/components/app-kit";
import { ShareBar, buttonClass, inputClass } from "@/components/growth/kit";
import { Icon } from "@/components/ui/Icon";
import { cx } from "@/components/app-ui/cx";
import { RANGE_PRESETS, formatDay, resolveRange } from "@/lib/analytics/range";
import { loadTraffic } from "@/lib/analytics/traffic-load";
import { askPeggyPrompt, trafficContext, type CountRow, type TrafficKpiKey, type TrafficSection } from "@/lib/analytics/traffic";
import { getSearchConsoleConnection, searchConsoleConfigured, searchConsolePerformance } from "@/lib/search-console/google.server";
import type { SearchConsolePerformance } from "@/lib/search-console/pure";
import { getLocale, getT } from "@/lib/i18n/server";
import { formatNumber, type TFunction } from "@shared/i18n";
import type { MessageKey } from "@shared/i18n/catalog";
import { TrafficChart } from "./TrafficChart";
import { PageTip } from "@/components/learn/PageTip";

// Store traffic (Analytics › Store traffic): visits, pages, sources, devices, places, shop searches and the product
// funnel from the store's own first-party counters (src/lib/analytics/traffic.ts), plus Google Search numbers when
// Search Console is connected. Every card has "Ask Peggy", which opens Peggy with that card's numbers.

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  const t = await getT("traffic");
  return { title: t("title") };
}

type Search = Promise<{ range?: string; from?: string; to?: string }>;
type TrafficT = TFunction<MessageKey<"traffic"> | MessageKey<"analytics"> | MessageKey<"common">>;

function Delta({ change, t }: { change: number | null | undefined; t: TrafficT }) {
  if (change == null) return <span className="text-app-ink-soft">{t("delta.none")}</span>;
  if (change === 0) return <span className="text-app-ink-soft">{t("delta.same")}</span>;
  const up = change > 0;
  return (
    <span className={cx("inline-flex items-center gap-1 font-bold", up ? "text-app-success" : "text-app-danger")}>
      <span aria-hidden="true">{up ? "▲" : "▼"}</span>
      {up ? t("delta.up") : t("delta.down")} {Math.abs(change)}%<span className="font-normal text-app-ink-soft"> {t("delta.vsBefore")}</span>
    </span>
  );
}

function AskPeggy({ prompt, label, t, tone = "white" }: { prompt: string; label: string; t: TrafficT; tone?: "white" | "ink" }) {
  return (
    <PillLink href={`/home/peggy?ask=${encodeURIComponent(prompt)}`} size="sm" tone={tone} icon="sparkle" className="whitespace-nowrap">
      <span aria-hidden="true">{t("askPeggy")}</span>
      <span className="sr-only">{t("askPeggyAria", { section: label })}</span>
    </PillLink>
  );
}

function Bars({ rows, empty, n, value }: { rows: CountRow[]; empty: string; n: (value: number) => string; value?: (row: CountRow) => ReactNode }) {
  if (!rows.length) return <p className="mb-0 mt-2 text-[14px] leading-[1.5] text-app-ink-soft">{empty}</p>;
  const max = Math.max(1, rows[0].count);
  return (
    <ul className="m-0 mt-4 grid list-none gap-3 p-0">
      {rows.map((row) => (
        <li key={row.key}>
          <ShareBar label={row.label} value={value ? value(row) : `${n(row.count)} · ${Math.round(row.share * 100)}%`} share={row.count / max} />
        </li>
      ))}
    </ul>
  );
}

function duration(seconds: number | null, t: TrafficT) {
  if (seconds == null) return t("kpi.notMeasured");
  return seconds >= 60 ? t("minutes", { m: Math.floor(seconds / 60), s: seconds % 60 }) : t("seconds", { s: seconds });
}

export default async function TrafficPage({ searchParams }: { searchParams: Search }) {
  const user = await requireRole(["seller"], "/login");
  const tipT = await getT("tips");
  const t: TrafficT = await getT("traffic", "analytics", "common");
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

  const [{ report, available }, google] = await Promise.all([loadTraffic(store.id, range, now), loadGoogle(store.id, range.fromDay, range.toDay)]);
  const k = report.kpis;
  const rangeLabel = range.key === "custom" ? range.label : t.dynamic(`range.${range.key}`, range.label);
  const query = (extra: Record<string, string>) => `?${new URLSearchParams(extra).toString()}`;
  const rangeQuery: Record<string, string> = range.key === "custom" ? { range: "custom", from: range.fromDay, to: range.toDay } : { range: range.key };

  // Ask Peggy: the numbers of one card (or the whole page) as plain text in Peggy's box.
  const googleLine = google.kind === "data"
    ? `Google Search: ${google.data.totals.clicks} clicks from ${google.data.totals.impressions} times shown, average position ${google.data.totals.position ?? "n/a"}; top searches: ${google.data.queries.slice(0, 5).map((q) => `${q.key} (${q.clicks} clicks)`).join(", ") || "none"}.`
    : "";
  const ask = (section: TrafficSection) => askPeggyPrompt(trafficContext(report, section, range.label, section === "overview" || section === "google" ? googleLine : ""));

  const sourceLabel = (row: { key: string; label: string }) => t.dynamic(`source.${row.key}`, row.label);
  const kindLabel = (row: { key: string; label: string }) => t.dynamic(`kind.${row.key}`, row.label);
  const deviceLabel = (row: { key: string; label: string }) => t.dynamic(`devices.${row.key}`, row.label);
  const pageName = (page: { kind: string; label: string }) => (["home", "shop", "categories", "cart", "checkout", "wishlist", "blog", "reviews", "links", "order", "pay", "form"].includes(page.kind) ? t.dynamic(`page.${page.kind}`, page.label) : page.label);
  const countryName = (() => {
    try {
      const names = new Intl.DisplayNames([locale === "en" ? "en-NG" : "en"], { type: "region" });
      return (code: string) => names.of(code) ?? code;
    } catch {
      return (code: string) => code;
    }
  })();

  const tiles: Array<{ key: TrafficKpiKey; label: string; value: string; hint: string }> = [
    { key: "sessions", label: t("kpi.visits"), value: n(k.sessions), hint: t("kpi.visitsHint") },
    { key: "pageViews", label: t("kpi.pageViews"), value: n(k.pageViews), hint: t("kpi.pageViewsHint") },
    { key: "uniqueVisitors", label: t("kpi.visitors"), value: n(k.uniqueVisitors), hint: t("kpi.visitorsHint") },
    { key: "newVisitors", label: t("kpi.newVisitors"), value: n(k.newVisitors), hint: t("kpi.newVisitorsHint") },
    { key: "returningVisitors", label: t("kpi.returningVisitors"), value: n(k.returningVisitors), hint: t("kpi.returningVisitorsHint") },
    { key: "pagesPerSession", label: t("kpi.pagesPerVisit"), value: k.pagesPerSession == null ? t("kpi.none") : String(k.pagesPerSession), hint: t("kpi.pagesPerVisitHint") },
    { key: "avgEngagedSeconds", label: t("kpi.time"), value: duration(k.avgEngagedSeconds, t), hint: t("kpi.timeHint") },
    { key: "conversionRate", label: t("kpi.conversion"), value: k.conversionRate == null ? t("kpi.none") : `${(Math.round(k.conversionRate * 1000) / 10).toString()}%`, hint: t("kpi.conversionHint", { count: k.paidOrders }) },
  ];

  const funnelMax = Math.max(1, ...report.funnel.map((step) => step.count));
  const pagesMax = Math.max(1, ...report.topPages.map((page) => page.views));

  return (
    <SellerPage
      user={user}
      store={storeSummary(store)}
      title={t("title")}
      sub={t("sub")}
      actions={
        <>
          <PillLink href="/home/connections" icon="plug">{t("connections")}</PillLink>
          <PillLink href={`/home/peggy?ask=${encodeURIComponent(ask("overview"))}`} tone="ink" icon="sparkle">{t("askPeggyAll")}</PillLink>
        </>
      }
    >
      <div className="grid gap-5">
        <PageTip>{tipT("traffic")}</PageTip>
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
            <form method="get" className="z-20 mt-2 grid w-[min(320px,calc(100vw-32px))] gap-3 rounded-[18px] border border-app-line bg-white p-4 shadow-[0_12px_32px_rgba(22,20,31,0.12)] sm:absolute sm:left-0">
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
          <p className="m-0 text-[13.5px] text-app-ink-soft">
            {t("comparedWith", { previous: range.key === "today" ? t("prev.yesterday") : t("prev.range", { from: formatDay(range.previous.start), to: formatDay(new Date(range.previous.end.getTime() - 1), true) }) })}
          </p>
        </div>

        {range.error && <p role="alert" className="m-0 rounded-[14px] bg-app-danger-tint px-4 py-3 text-[14px] text-app-danger">{range.error} {t("showingLast30")}</p>}
        <p className="m-0 rounded-[14px] bg-app-canvas px-4 py-3 text-[13.5px] leading-[1.5] text-app-ink-soft">
          {!available ? t("off") : report.since ? t("since", { date: formatDay(new Date(`${report.since}T12:00:00+01:00`), true) }) : t("startsNext")}
        </p>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {tiles.map((tile) => (
            <StatTile key={tile.key} tone="card" label={tile.label} value={tile.value} hint={<span className="grid gap-0.5"><Delta change={report.change[tile.key]} t={t} /><span>{tile.hint}</span></span>} />
          ))}
        </div>

        <Card className="p-5">
          <CardHead title={t("trend.title")} sub={t("trend.sub", { range: rangeLabel, visits: n(k.sessions), views: n(k.pageViews) })} action={<AskPeggy t={t} label={t("trend.title")} prompt={ask("overview")} />} />
          <div className="mt-4">
            <TrafficChart points={report.series} rangeLabel={rangeLabel} />
          </div>
        </Card>

        <div className="grid gap-5 xl:grid-cols-2">
          <Card className="min-w-0 p-5">
            <CardHead title={t("pages.title")} sub={t("pages.sub")} action={<AskPeggy t={t} label={t("pages.title")} prompt={ask("pages")} />} />
            {report.topPages.length ? (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[420px] border-collapse text-[13.5px]">
                  <caption className="sr-only">{t("pages.title")}</caption>
                  <thead>
                    <tr className="text-left text-app-ink-soft">
                      <th scope="col" className="pb-2 font-semibold">{t("pages.page")}</th>
                      <th scope="col" className="pb-2 text-right font-semibold">{t("pages.views")}</th>
                      <th scope="col" className="pb-2 text-right font-semibold">{t("pages.landed")}</th>
                      <th scope="col" className="pb-2 text-right font-semibold">{t("pages.time")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.topPages.map((page) => (
                      <tr key={page.path} className="border-t border-app-line">
                        <th scope="row" className="max-w-[260px] py-2 pr-3 text-left font-semibold">
                          <span className="block truncate">{pageName(page)}</span>
                          <span className="block truncate font-mono text-[11.5px] font-normal text-app-ink-soft">{page.path}</span>
                          <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-app-canvas" aria-hidden="true"><span className="block h-full rounded-full bg-app-ink" style={{ width: `${(page.views / pagesMax) * 100}%` }} /></span>
                        </th>
                        <td className="py-2 text-right tabular-nums">{n(page.views)}</td>
                        <td className="py-2 text-right tabular-nums text-app-ink-soft">{n(page.entries)}</td>
                        <td className="py-2 text-right tabular-nums text-app-ink-soft">{duration(page.avgSeconds, t)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="mb-0 mt-2 text-[14px] text-app-ink-soft">{t("pages.empty")}</p>
            )}
          </Card>

          <Card className="min-w-0 p-5">
            <CardHead title={t("sources.title")} sub={t("sources.sub")} action={<AskPeggy t={t} label={t("sources.title")} prompt={ask("sources")} />} />
            <Bars rows={report.sources.map((row) => ({ ...row, label: sourceLabel(row) }))} empty={t("sources.empty")} n={n} />
            {report.sourceKinds.length > 0 && (
              <div className="mt-4 border-t border-app-line pt-3">
                <h3 className="m-0 text-[13.5px] font-bold">{t("sources.kinds")}</h3>
                <ul className="m-0 mt-2 flex list-none flex-wrap gap-2 p-0 text-[13px]">
                  {report.sourceKinds.map((row) => (
                    <li key={row.key} className="rounded-full bg-app-canvas px-3 py-1">{kindLabel(row)} · {Math.round(row.share * 100)}%</li>
                  ))}
                </ul>
              </div>
            )}
            <p className="mb-0 mt-4 border-t border-app-line pt-3 text-[12.5px] leading-[1.5] text-app-ink-soft">{t("sources.whatsappTip")}</p>
          </Card>
        </div>

        <div className="grid gap-5 lg:grid-cols-2 2xl:grid-cols-3">
          <Card className="min-w-0 p-5">
            <CardHead title={t("entry.title")} sub={t("entry.sub")} action={<AskPeggy t={t} label={t("entry.title")} prompt={ask("pages")} />} />
            <Bars rows={report.entryPages} empty={t("pages.empty")} n={n} />
          </Card>

          <Card className="min-w-0 p-5">
            <CardHead title={t("referrers.title")} sub={t("referrers.sub")} action={<AskPeggy t={t} label={t("referrers.title")} prompt={ask("sources")} />} />
            <Bars rows={report.referrers} empty={t("referrers.empty")} n={n} />
          </Card>

          <Card className="min-w-0 p-5">
            <CardHead title={t("devices.title")} sub={t("devices.sub")} action={<AskPeggy t={t} label={t("devices.title")} prompt={ask("devices")} />} />
            <Bars rows={report.devices.map((row) => ({ ...row, label: deviceLabel(row) }))} empty={t("sources.empty")} n={n} />
          </Card>

          <Card className="min-w-0 p-5">
            <CardHead title={t("search.title")} sub={t("search.sub")} action={<AskPeggy t={t} label={t("search.title")} prompt={ask("search")} />} />
            <Bars rows={report.searchTerms} empty={t("search.empty")} n={n} value={(row) => t("search.times", { count: row.count })} />
            {report.searchTerms.length > 0 && <p className="mb-0 mt-4 border-t border-app-line pt-3 text-[12.5px] leading-[1.5] text-app-ink-soft">{t("search.tip")}</p>}
          </Card>

          <Card className="min-w-0 p-5">
            <CardHead title={t("places.title")} sub={t("places.sub")} action={<AskPeggy t={t} label={t("places.title")} prompt={ask("places")} />} />
            {report.countries.length || report.cities.length ? (
              <>
                {report.countries.length > 0 && <h3 className="m-0 mt-4 text-[13.5px] font-bold">{t("places.countries")}</h3>}
                <Bars rows={report.countries.map((row) => ({ ...row, label: countryName(row.key) }))} empty="" n={n} />
                {report.cities.length > 0 && <h3 className="m-0 mt-4 text-[13.5px] font-bold">{t("places.cities")}</h3>}
                <Bars rows={report.cities} empty="" n={n} />
              </>
            ) : (
              <p className="mb-0 mt-2 text-[14px] text-app-ink-soft">{t("places.empty")}</p>
            )}
          </Card>

          <Card className="min-w-0 p-5">
            <CardHead title={t("funnel.title")} sub={t("funnel.sub")} action={<AskPeggy t={t} label={t("funnel.title")} prompt={ask("products")} />} />
            <ol className="m-0 mt-4 grid list-none gap-3 p-0">
              {report.funnel.map((step, index) => {
                const before = index > 0 ? report.funnel[index - 1].count : 0;
                return (
                  <li key={step.key}>
                    <div className="flex justify-between gap-3 text-[14px]">
                      <span className="font-bold">{t.dynamic(`funnelStep.${step.key}`, step.label)}</span>
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
          </Card>
        </div>

        <Card className="min-w-0 p-5">
          <CardHead title={t("products.title")} sub={t("products.sub")} action={<AskPeggy t={t} label={t("products.title")} prompt={ask("products")} />} />
          {report.products.length ? (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[560px] border-collapse text-[13.5px]">
                <caption className="sr-only">{t("products.title")}</caption>
                <thead>
                  <tr className="text-left text-app-ink-soft">
                    <th scope="col" className="pb-2 font-semibold">{t("products.product")}</th>
                    <th scope="col" className="pb-2 text-right font-semibold">{t("products.views")}</th>
                    <th scope="col" className="pb-2 text-right font-semibold">{t("products.bag")}</th>
                    <th scope="col" className="pb-2 text-right font-semibold">{t("products.orders")}</th>
                    <th scope="col" className="pb-2 text-right font-semibold">{t("products.rate")}</th>
                  </tr>
                </thead>
                <tbody>
                  {report.products.map((product) => (
                    <tr key={product.productId} className="border-t border-app-line">
                      <th scope="row" className="py-2 pr-3 text-left font-semibold">
                        <span className="flex min-w-0 items-center gap-3"><Thumb src={product.image} label={product.name} size={36} /><span className="truncate">{product.name}</span></span>
                      </th>
                      <td className="py-2 text-right tabular-nums">{n(product.views)}</td>
                      <td className="py-2 text-right tabular-nums">{n(product.addToBag)}</td>
                      <td className="py-2 text-right tabular-nums">{n(product.orders)}</td>
                      <td className="py-2 text-right tabular-nums text-app-ink-soft">{product.conversionRate == null ? "–" : `${Math.round(product.conversionRate * 1000) / 10}%`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="mb-0 mt-2 text-[14px] text-app-ink-soft">{t("products.empty")}</p>
          )}
        </Card>

        <div className="grid gap-5 xl:grid-cols-2">
          <Card className="min-w-0 p-5">
            <CardHead title={t("google.title")} sub={t("google.sub")} action={google.kind === "data" ? <AskPeggy t={t} label={t("google.title")} prompt={ask("google")} /> : <TextLink href="/home/connections#search-console">{t("connections")}</TextLink>} />
            <GoogleCard google={google} t={t} n={n} />
          </Card>

          <Card className="min-w-0 p-5">
            <CardHead title={t("campaigns.title")} sub={t("campaigns.sub")} action={<AskPeggy t={t} label={t("campaigns.title")} prompt={ask("sources")} />} />
            <Bars rows={report.campaigns} empty={t("campaigns.empty")} n={n} />
            {report.mediums.length > 0 && (
              <>
                <h3 className="m-0 mt-4 text-[13.5px] font-bold">{t("campaigns.mediums")}</h3>
                <Bars rows={report.mediums} empty="" n={n} />
              </>
            )}
          </Card>
        </div>

        <p className="m-0 text-[12.5px] leading-[1.5] text-app-ink-soft">{t("privacy")}</p>
      </div>
    </SellerPage>
  );
}

type GoogleState =
  | { kind: "off" }
  | { kind: "not_connected" }
  | { kind: "choose_site" }
  | { kind: "error"; reason: string }
  | { kind: "data"; data: SearchConsolePerformance };

async function loadGoogle(storeId: string, fromDay: string, toDay: string): Promise<GoogleState> {
  if (!searchConsoleConfigured()) return { kind: "off" };
  const connection = await getSearchConsoleConnection(storeId);
  if (!connection) return { kind: "not_connected" };
  if (!connection.siteUrl) return { kind: "choose_site" };
  try {
    return { kind: "data", data: await searchConsolePerformance(storeId, fromDay, toDay) };
  } catch (error) {
    return { kind: "error", reason: error instanceof Error ? error.message.slice(0, 160) : "" };
  }
}

function GoogleCard({ google, t, n }: { google: GoogleState; t: TrafficT; n: (value: number) => string }) {
  if (google.kind !== "data") {
    const text = google.kind === "error" ? t("google.error", { reason: google.reason }) : google.kind === "choose_site" ? t("google.chooseSite") : t("google.notConnected");
    return (
      <div className="mt-3 grid gap-3">
        <p className="m-0 text-[14px] leading-[1.5] text-app-ink-soft">{text}</p>
        <div><PillLink href="/home/connections#search-console" size="sm" icon="plug">{t("google.connect")}</PillLink></div>
      </div>
    );
  }
  const { totals, queries } = google.data;
  return (
    <>
      <dl className="m-0 mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          [t("google.clicks"), n(totals.clicks)],
          [t("google.impressions"), n(totals.impressions)],
          [t("google.ctr"), totals.ctr == null ? "–" : `${Math.round(totals.ctr * 1000) / 10}%`],
          [t("google.position"), totals.position == null ? "–" : String(totals.position)],
        ].map(([label, value]) => (
          <div key={label} className="min-w-0 rounded-[14px] bg-app-canvas px-3.5 py-2.5">
            <dt className="truncate text-[12.5px] text-app-ink-soft">{label}</dt>
            <dd className="m-0 mt-0.5 text-[17px] font-extrabold tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
      {queries.length ? (
        <>
          <h3 className="m-0 mt-4 text-[13.5px] font-bold">{t("google.queries")}</h3>
          <ul className="m-0 mt-2 grid list-none gap-1.5 p-0 text-[13.5px]">
            {queries.slice(0, 10).map((row) => (
              <li key={row.key} className="flex justify-between gap-3">
                <span className="min-w-0 truncate">{row.key}</span>
                <span className="shrink-0 tabular-nums text-app-ink-soft">{t("google.row", { clicks: n(row.clicks), shown: n(row.impressions), position: row.position })}</span>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="mb-0 mt-3 text-[14px] text-app-ink-soft">{t("google.empty")}</p>
      )}
      <p className="mb-0 mt-4 border-t border-app-line pt-3 text-[12.5px] text-app-ink-soft">{t("google.lag")}</p>
    </>
  );
}
