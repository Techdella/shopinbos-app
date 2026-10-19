import type { ReactNode } from "react";
import { AppPage, Card, CardHead, FilterChips, Pill, StatTile } from "@/components/app-kit";
import { adminFrame } from "@/components/admin/AdminKit";
import { Bars, ShareBar } from "@/components/growth/kit";
import { KIND_LABELS } from "@/lib/website-leads/pure";
import { CHANNEL_LABELS, percent, type LeadChannel } from "@/lib/lead-growth/pure";
import { providerStatuses } from "@/lib/platform-analytics/config";
import { acquisitionStats, activeUsers, leadFunnel, messagingStats, retention, sellerFunnel, signupStats } from "@/lib/platform-analytics/native.server";
import { providerReports, type ProviderReport } from "@/lib/platform-analytics/reports.server";
import type { DayPoint } from "@/lib/platform-analytics/pure";
import { requireRole } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

// /admin/analytics: sign-ups, acquisition (where leads come from and how many become accounts), the seller funnel,
// active users and weekly retention from our own database, plus Mixpanel and PostHog numbers
// when they are connected (src/lib/platform-analytics).

const RANGES = [7, 30, 90] as const;
const ROLE_LABELS: Record<string, string> = { seller: "Sellers", supplier: "Suppliers", logistics_partner: "Delivery partners" };

const fmt = (n: number) => n.toLocaleString("en-NG");
const shortDay = (date: string) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));

function DayBars({ series, summary }: { series: DayPoint[]; summary: string }) {
  return <Bars values={series.map((p) => p.value)} labels={series.map((p, i) => (i === 0 || i === series.length - 1 || i === Math.floor(series.length / 2) ? shortDay(p.date) : ""))} summary={summary} height={150} highlightLast={false} />;
}

function Table({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  if (!rows.length) return <p className="m-0 text-[13.5px] text-app-ink-soft">Nothing yet.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left text-[13.5px]">
        <thead>
          <tr className="border-b border-app-line text-[12px] text-app-ink-soft">
            {head.map((h, i) => <th key={h} className={`py-2 pr-3 font-bold ${i ? "text-right" : ""}`}>{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, r) => (
            <tr key={r} className="border-b border-app-line last:border-0">
              {row.map((cell, i) => <td key={i} className={`py-2 pr-3 ${i ? "text-right font-mono" : "max-w-[260px] truncate"}`}>{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Funnel({ steps }: { steps: Array<{ label: string; value: number }> }) {
  const top = steps[0]?.value ?? 0;
  return (
    <div className="flex flex-col gap-3">
      {steps.map((step, i) => (
        <ShareBar key={step.label} label={step.label} value={`${fmt(step.value)}${i ? ` · ${percent(step.value, top)}` : ""}`} share={top ? step.value / top : 0} tone={i === steps.length - 1 ? "success" : "ink"} />
      ))}
    </div>
  );
}

function Unavailable({ children }: { children: ReactNode }) {
  return <p className="m-0 rounded-[14px] bg-app-canvas px-4 py-3 text-[13.5px] text-app-ink-soft">{children}</p>;
}

function ProviderCard({ report }: { report: ProviderReport }) {
  if (!report.ok) {
    return (
      <Card className="p-5">
        <CardHead title={report.label} />
        <Unavailable>{report.error}</Unavailable>
      </Card>
    );
  }
  return (
    <Card className="p-5">
      <CardHead title={report.label} />
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        {report.totals.map((t) => <StatTile key={t.label} label={t.label} value={fmt(t.value)} />)}
      </div>
      {report.series.points.length > 0 && (
        <div className="mb-4">
          <p className="mb-2 mt-0 text-[13px] font-bold">{report.series.name}</p>
          <DayBars series={report.series.points} summary={`${report.label}: ${report.series.name} per day`} />
        </div>
      )}
      <div className="grid gap-5 lg:grid-cols-2">
        {report.tables.map((table) => (
          <div key={table.title}>
            <p className="mb-2 mt-0 text-[13px] font-bold">{table.title}</p>
            <Table head={["", ""]} rows={table.rows.map((row) => [row.label, fmt(row.value)])} />
          </div>
        ))}
      </div>
    </Card>
  );
}

export default async function AdminAnalyticsPage(props: { searchParams?: Promise<{ days?: string }> }) {
  const user = await requireRole(["admin"], "/admin/login");
  const search = (await props.searchParams) ?? {};
  const days = (RANGES as readonly number[]).includes(Number(search.days)) ? Number(search.days) : 30;

  const [signups, acquisition, sellers, leads, messaging, active, cohorts, reports] = await Promise.all([
    signupStats(days),
    acquisitionStats(days),
    sellerFunnel(days),
    leadFunnel(days),
    messagingStats(days),
    activeUsers(days),
    retention(8),
    providerReports(days),
  ]);
  const statuses = providerStatuses();
  const notReady = "Run docs/migrations/2026-11-05-lead-growth.sql to see this.";

  return (
    <AppPage frame={adminFrame(user, "Search")} title="Analytics" sub="Sign-ups, acquisition, activation and retention across Shopinbos, with Mixpanel and PostHog alongside.">
      <FilterChips className="mb-5" items={RANGES.map((r) => ({ label: `Last ${r} days`, href: r === 30 ? "/admin/analytics" : `/admin/analytics?days=${r}`, active: r === days }))} />

      <section aria-label="Headlines" className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatTile tone="card" label="Sign-ups" value={fmt(signups.total)} hint={signups.change === null ? `${fmt(signups.previous)} the ${days} days before` : `${signups.change >= 0 ? "+" : ""}${signups.change}% vs the ${days} days before`} />
        <StatTile tone="card" label="From leads" value={signups.fromLeads === null ? "–" : fmt(signups.fromLeads)} hint="Leads who made an account" />
        <StatTile tone="card" label="New leads" value={acquisition ? fmt(acquisition.leads) : "–"} hint={acquisition ? `${percent(acquisition.converted, acquisition.leads)} signed up` : undefined} />
        <StatTile tone="card" label="Active today" value={active ? fmt(active.dau) : "–"} hint={active?.stickiness !== null && active ? `${active.stickiness}% of monthly users` : "DAU"} />
        <StatTile tone="card" label="Active this week" value={active ? fmt(active.wau) : "–"} hint="WAU" />
        <StatTile tone="card" label="Active this month" value={active ? fmt(active.mau) : "–"} hint="MAU" />
      </section>

      <div className="mb-5 grid gap-5 xl:grid-cols-2">
        <Card className="p-5">
          <CardHead title="Sign-ups per day" sub={Object.entries(signups.byRole).map(([role, n]) => `${ROLE_LABELS[role] ?? role}: ${fmt(n)}`).join(" · ") || "No sign-ups in this period."} />
          <DayBars series={signups.series} summary={`Sign-ups per day over the last ${days} days, ${signups.total} in total`} />
        </Card>
        <Card className="p-5">
          <CardHead title="Active users per day" sub="Accounts that opened the app or used the API that day." />
          {active ? <DayBars series={active.series} summary={`Daily active users over the last ${days} days`} /> : <Unavailable>{notReady}</Unavailable>}
        </Card>
      </div>

      <div className="mb-5 grid gap-5 xl:grid-cols-2">
        <Card className="p-5">
          <CardHead title="Lead to account" sub={`Leads that came in during the last ${days} days.${acquisition?.medianDaysToSignUp != null ? ` Median time to sign up: ${acquisition.medianDaysToSignUp.toFixed(1)} days.` : ""}`} />
          {leads ? <Funnel steps={leads} /> : <Unavailable>{notReady}</Unavailable>}
        </Card>
        <Card className="p-5">
          <CardHead title="New seller activation" sub={`Sellers who signed up in the last ${days} days, and how far they've got.`} />
          {sellers ? <Funnel steps={sellers} /> : <Unavailable>Couldn't load the seller funnel.</Unavailable>}
        </Card>
      </div>

      <Card className="mb-5 p-5">
        <CardHead title="Acquisition" sub="Where leads come from and how many of them made an account." />
        {acquisition ? (
          <div className="flex flex-col gap-6">
            <div>
              <p className="mb-2 mt-0 text-[13px] font-bold">New leads per day</p>
              <DayBars series={acquisition.series} summary={`New leads per day over the last ${days} days`} />
            </div>
            <div className="grid gap-6 xl:grid-cols-3">
              <div>
                <p className="mb-2 mt-0 text-[13px] font-bold">By form</p>
                <Table head={["Form", "Leads", "Signed up", "Rate"]} rows={acquisition.kinds.map((r) => [KIND_LABELS[r.label] ?? r.label, fmt(r.leads), fmt(r.converted), percent(r.converted, r.leads)])} />
              </div>
              <div>
                <p className="mb-2 mt-0 text-[13px] font-bold">By source</p>
                <Table head={["Source", "Leads", "Signed up", "Rate"]} rows={acquisition.sources.map((r) => [r.label, fmt(r.leads), fmt(r.converted), percent(r.converted, r.leads)])} />
              </div>
              <div>
                <p className="mb-2 mt-0 text-[13px] font-bold">By UTM source / medium</p>
                <Table head={["utm", "Leads", "Signed up", "Rate"]} rows={acquisition.utm.map((r) => [r.label, fmt(r.leads), fmt(r.converted), percent(r.converted, r.leads)])} />
              </div>
            </div>
          </div>
        ) : (
          <Unavailable>{notReady}</Unavailable>
        )}
      </Card>

      <Card className="mb-5 p-5">
        <CardHead title="Retention" sub="Weekly sign-up cohorts: the share who used the app again 1, 2, 3… weeks later. Activity is recorded from the day the lead-growth update went live." />
        {cohorts ? (
          cohorts.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse text-[13px]">
                <thead>
                  <tr className="text-[12px] text-app-ink-soft">
                    <th className="py-2 pr-3 text-left font-bold">Week of</th>
                    <th className="py-2 pr-3 text-right font-bold">Sign-ups</th>
                    {cohorts[0].weeks.map((_, k) => <th key={k} className="px-1 py-2 text-center font-bold">W{k}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {cohorts.map((row) => (
                    <tr key={row.week}>
                      <td className="py-1 pr-3">{shortDay(row.week)}</td>
                      <td className="py-1 pr-3 text-right font-mono">{fmt(row.size)}</td>
                      {row.weeks.map((share, k) => (
                        <td key={k} className="p-[2px]">
                          {share === null ? null : (
                            <div className="relative rounded-[6px] bg-app-canvas" title={`Week of ${shortDay(row.week)}, week ${k}: ${Math.round(share * 100)}%`}>
                              <div className="absolute inset-0 rounded-[6px] bg-app-success" style={{ opacity: Math.min(1, share) * 0.85 }} />
                              <div className={`relative py-1.5 text-center font-mono ${share > 0.5 ? "text-white" : "text-app-ink"}`}>{Math.round(share * 100)}%</div>
                            </div>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Unavailable>No sign-ups in the last 8 weeks.</Unavailable>
          )
        ) : (
          <Unavailable>{notReady}</Unavailable>
        )}
      </Card>

      <Card className="mb-5 p-5">
        <CardHead title="Lead messages" sub={`Campaign and automation messages in the last ${days} days.`} />
        {messaging ? (
          <Table
            head={["Channel", "Sent", "Failed", "Skipped"]}
            rows={Object.entries(messaging).map(([channel, m]) => [CHANNEL_LABELS[channel as LeadChannel] ?? channel, fmt(m.sent), fmt(m.failed), fmt(m.skipped)])}
          />
        ) : (
          <Unavailable>{notReady}</Unavailable>
        )}
      </Card>

      <Card className="mb-5 p-5">
        <CardHead title="Connected tools" sub="Tracking runs on the app and portals (never on sellers' stores). Sign-ups and leads are also sent from the server, so ad blockers don't hide them." />
        <ul className="m-0 flex list-none flex-col divide-y divide-app-line p-0">
          {statuses.map((s) => (
            <li key={s.provider} className="flex flex-wrap items-start justify-between gap-3 py-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <b className="text-[15px]">{s.label}</b>
                  <Pill tone={s.tracking ? "success" : "muted"} dot>{s.tracking ? "Tracking on" : "Tracking off"}</Pill>
                  <Pill tone={s.serverEvents ? "success" : "muted"}>{s.serverEvents ? "Server events on" : "No server events"}</Pill>
                  <Pill tone={s.reporting ? "success" : "muted"}>{s.reporting ? "Reports here" : "No reports here"}</Pill>
                </div>
                {s.missing.length > 0 && <p className="mb-0 mt-1.5 text-[12.5px] text-app-ink-soft">To finish connecting, set in Vercel: <span className="font-mono">{s.missing.join(", ")}</span></p>}
              </div>
              <a href={s.dashboardUrl} target="_blank" rel="noreferrer" className="text-[13.5px] font-bold underline">Open {s.label}</a>
            </li>
          ))}
        </ul>
      </Card>

      <div className="flex flex-col gap-5">
        {reports.map((report) => <ProviderCard key={report.provider} report={report} />)}
      </div>
    </AppPage>
  );
}
