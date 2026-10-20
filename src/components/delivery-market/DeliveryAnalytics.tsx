import type { ReactNode } from "react";
import { Card, CardHead, FilterChips, Pill } from "@/components/app-kit";
import { Sparkline } from "@/components/ui/Sparkline";
import { naira, serviceWord, sizeWord } from "@/components/delivery-market/bits";
import { ISSUE_WORDS, type IssueKind } from "@shared/delivery-market";
import {
  ANALYTICS_RANGES,
  RANGE_LABELS,
  UNKNOWN,
  type BreakdownRow,
  type CountRow,
  type IssueRow,
  type PartnerComparisonRow,
  type WeekPoint,
} from "@/lib/delivery-market/analytics";

// Server-safe pieces of the delivery analytics pages: the partner's "Marketplace jobs" section
// (/logistics/analytics), the seller's /home/logistics/analytics and the supplier's /supplier/delivery/analytics.
// The numbers come from src/lib/delivery-market/analytics.ts.

export const rateText = (rate: number | null) => (rate === null ? "—" : `${rate}%`);

const weekWords = (week: Date) => week.toLocaleDateString("en-NG", { day: "numeric", month: "short", timeZone: "Africa/Lagos" });

/** 30 days · 90 days · 12 months, as links (works without JavaScript). */
export function RangeChips({ path, days, hash }: { path: string; days: number; hash?: string }) {
  return (
    <FilterChips
      items={ANALYTICS_RANGES.map((option) => ({
        label: RANGE_LABELS[option],
        href: `${path}${option === 30 ? "" : `?range=${option}`}${hash ? `#${hash}` : ""}`,
        active: option === days,
      }))}
    />
  );
}

const Empty = ({ children }: { children: ReactNode }) => <p className="m-0 mt-3 text-[14.5px] text-app-ink-soft">{children}</p>;

/** Deliveries per week as bars, with the on-time % and fees per week as small trend lines under them. */
export function WeeklyChart({ weeks, title = "Deliveries per week", feesLabel = "Fees" }: { weeks: readonly WeekPoint[]; title?: string; feesLabel?: string }) {
  const total = weeks.reduce((sum, week) => sum + week.delivered, 0);
  const peak = Math.max(1, ...weeks.map((week) => week.delivered));
  const fees = weeks.reduce((sum, week) => sum + week.fees, 0);
  const rated = weeks.filter((week) => week.onTimeRate !== null);
  const describe = (week: WeekPoint) =>
    `Week of ${weekWords(week.week)}: ${week.delivered} delivered${week.onTimeRate === null ? "" : `, ${week.onTimeRate}% on time`}, ${naira(week.fees)}`;
  return (
    <Card className="p-5">
      <CardHead title={title} sub={`${total} delivered · ${naira(fees)}`} />
      {total === 0 ? (
        <Empty>No deliveries in this period yet.</Empty>
      ) : (
        <>
          <ol aria-label={title} className="m-0 mt-5 flex h-[160px] list-none items-end gap-1 p-0 sm:gap-1.5">
            {weeks.map((week) => (
              <li key={week.week.toISOString()} className="group relative flex h-full min-w-0 flex-1 flex-col justify-end" title={describe(week)}>
                <span className="sr-only">{describe(week)}</span>
                <span
                  aria-hidden
                  className="block w-full rounded-t-[4px] bg-app-ink transition group-hover:bg-app-accent"
                  style={{ height: week.delivered ? `${Math.max(4, (week.delivered / peak) * 100)}%` : "2px", opacity: week.delivered ? 1 : 0.15 }}
                />
              </li>
            ))}
          </ol>
          <div aria-hidden className="mt-2 flex justify-between text-[12px] text-app-ink-soft">
            <span>{weeks.length ? weekWords(weeks[0].week) : ""}</span>
            <span>This week</span>
          </div>
          <div className="mt-4 grid gap-4 border-t border-app-line pt-4 sm:grid-cols-2">
            <div className="min-w-0">
              <div className="text-[13px] text-app-ink-soft">On time, week by week</div>
              {rated.length >= 2 ? (
                <div className="mt-2 overflow-hidden" aria-hidden>
                  <Sparkline data={rated.map((week) => week.onTimeRate ?? 0)} width={260} height={40} color="var(--color-teal)" fill="var(--color-teal)" />
                </div>
              ) : (
                <div className="mt-1 text-[13px] text-app-ink-faint">Needs deliveries with a promised time in two or more weeks.</div>
              )}
            </div>
            <div className="min-w-0">
              <div className="text-[13px] text-app-ink-soft">{feesLabel}, week by week</div>
              {weeks.length >= 2 ? (
                <div className="mt-2 overflow-hidden" aria-hidden>
                  <Sparkline data={weeks.map((week) => week.fees)} width={260} height={40} color="var(--color-amber)" fill="var(--color-amber)" />
                </div>
              ) : null}
            </div>
          </div>
        </>
      )}
    </Card>
  );
}

/** Rows with a proportional bar: jobs (and delivered, on-time %, fees) per state, service or size. */
export function BreakdownCard({
  title,
  sub,
  rows,
  kind,
  limit = 8,
  empty = "No jobs in this period yet.",
}: {
  title: string;
  sub?: string;
  rows: readonly BreakdownRow[];
  kind: "state" | "service" | "size";
  limit?: number;
  empty?: string;
}) {
  const shown = rows.slice(0, limit);
  const peak = Math.max(1, ...shown.map((row) => row.jobs));
  const label = (key: string) => (key === UNKNOWN ? (kind === "state" ? "State not known" : "Not set") : kind === "service" ? serviceWord(key) : kind === "size" ? sizeWord(key) : key);
  return (
    <Card className="p-5">
      <CardHead title={title} sub={sub} />
      {shown.length === 0 ? (
        <Empty>{empty}</Empty>
      ) : (
        <ul className="m-0 mt-3 list-none divide-y divide-app-line p-0">
          {shown.map((row) => (
            <li key={row.key} className="grid gap-1.5 py-2.5">
              <div className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 truncate text-[14.5px] font-bold">{label(row.key)}</span>
                <span className="shrink-0 text-[14px] font-extrabold">{row.jobs} {row.jobs === 1 ? "job" : "jobs"}</span>
              </div>
              <span aria-hidden className="block h-1.5 rounded-full bg-app-canvas">
                <span className="block h-full rounded-full bg-app-ink" style={{ width: `${Math.max(3, (row.jobs / peak) * 100)}%` }} />
              </span>
              <div className="text-[12.5px] text-app-ink-soft">
                {row.delivered} delivered · {rateText(row.onTimeRate)} on time{row.failed ? ` · ${row.failed} with problems` : ""} · {naira(row.fees)}
              </div>
            </li>
          ))}
        </ul>
      )}
      {rows.length > shown.length && <div className="mt-2 text-[12.5px] text-app-ink-soft">And {rows.length - shown.length} more</div>}
    </Card>
  );
}

/** Simple "reason · count" list (decline reasons). */
export function CountCard({ title, sub, rows, empty }: { title: string; sub?: string; rows: readonly CountRow[]; empty: string }) {
  return (
    <Card className="p-5">
      <CardHead title={title} sub={sub} />
      {rows.length === 0 ? (
        <Empty>{empty}</Empty>
      ) : (
        <ul className="m-0 mt-3 list-none divide-y divide-app-line p-0">
          {rows.map((row) => (
            <li key={row.key} className="flex items-center justify-between gap-3 py-2.5">
              <span className="min-w-0 text-[14.5px] font-bold">{row.key}</span>
              <span className="shrink-0 text-[14.5px] font-extrabold">{row.count}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/** Customer problems reported in the period, by kind, with how many are still open. */
export function IssuesCard({ rows, sub, empty = "No customer has reported a problem in this period." }: { rows: readonly IssueRow[]; sub?: string; empty?: string }) {
  return (
    <Card className="p-5">
      <CardHead title="Customer problems" sub={sub} />
      {rows.length === 0 ? (
        <Empty>{empty}</Empty>
      ) : (
        <ul className="m-0 mt-3 list-none divide-y divide-app-line p-0">
          {rows.map((row) => (
            <li key={row.kind} className="flex items-center justify-between gap-3 py-2.5">
              <span className="min-w-0 text-[14.5px] font-bold">{ISSUE_WORDS[row.kind as IssueKind] ?? row.kind}</span>
              <span className="flex shrink-0 items-center gap-2">
                {row.open > 0 && <Pill tone="danger">{row.open} open</Pill>}
                <span className="text-[14.5px] font-extrabold">{row.count}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/** A shop's partners side by side: jobs, on-time %, failed %, declines and average fee. */
export function PartnerComparison({ rows }: { rows: readonly PartnerComparisonRow[] }) {
  return (
    <Card className="overflow-hidden">
      <CardHead title="Your partners compared" sub="On time and failed rates are from this period's finished deliveries." className="px-5 pb-3 pt-5" />
      {rows.length === 0 ? (
        <p className="m-0 border-t border-app-line px-5 py-6 text-[14.5px] text-app-ink-soft">No delivery partners yet. Connect partners to compare them here.</p>
      ) : (
        <div className="overflow-x-auto border-t border-app-line">
          <table className="w-full min-w-[640px] border-collapse text-left text-[14px]">
            <thead>
              <tr className="text-[12.5px] text-app-ink-soft">
                <th scope="col" className="px-5 py-2.5 font-semibold">Partner</th>
                <th scope="col" className="px-3 py-2.5 text-right font-semibold">Jobs</th>
                <th scope="col" className="px-3 py-2.5 text-right font-semibold">Delivered</th>
                <th scope="col" className="px-3 py-2.5 text-right font-semibold">On time</th>
                <th scope="col" className="px-3 py-2.5 text-right font-semibold">Failed</th>
                <th scope="col" className="px-3 py-2.5 text-right font-semibold">Declined</th>
                <th scope="col" className="px-5 py-2.5 text-right font-semibold">Average fee</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-app-line border-t border-app-line">
              {rows.map((row) => (
                <tr key={row.partnerId}>
                  <th scope="row" className="px-5 py-3 font-bold">
                    <span className="flex flex-wrap items-center gap-2">
                      {row.name}
                      {!row.connected && <Pill>Not connected</Pill>}
                    </span>
                  </th>
                  <td className="px-3 py-3 text-right font-extrabold">{row.jobs}</td>
                  <td className="px-3 py-3 text-right">{row.delivered}</td>
                  <td className="px-3 py-3 text-right" title={row.timed ? `From ${row.timed} deliveries with a promised time` : undefined}>{rateText(row.onTimeRate)}</td>
                  <td className="px-3 py-3 text-right" title={row.finished ? `From ${row.finished} finished deliveries` : undefined}>{rateText(row.failedRate)}</td>
                  <td className="px-3 py-3 text-right">{row.declines + row.notAcceptedInTime > 0 ? `${row.declines}${row.notAcceptedInTime ? ` + ${row.notAcceptedInTime} late` : ""}` : "0"}</td>
                  <td className="px-5 py-3 text-right">{row.averageFee === null ? "—" : naira(row.averageFee)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
