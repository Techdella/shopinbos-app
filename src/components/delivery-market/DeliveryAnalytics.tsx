import type { ReactNode } from "react";
import { Card, CardHead, FilterChips, Pill } from "@/components/app-kit";
import { Sparkline } from "@/components/ui/Sparkline";
import { naira } from "@/components/delivery-market/bits";
import { declineReasonText, issueLabel, rangeLabel, serviceLabel, sizeLabel, type DeliveryWords } from "@/components/delivery-market/words";
import { getT } from "@/lib/i18n/server";
import { intlLocale } from "@shared/i18n";
import {
  ANALYTICS_RANGES,
  UNKNOWN,
  type BreakdownRow,
  type CountRow,
  type IssueRow,
  type PartnerComparisonRow,
  type WeekPoint,
} from "@/lib/delivery-market/analytics";

// Server-safe pieces of the delivery analytics pages: the partner's "Marketplace jobs" section
// (/logistics/analytics), the seller's /home/logistics/analytics and the supplier's /supplier/delivery/analytics.
// The numbers come from src/lib/delivery-market/analytics.ts. Words: the "delivery" catalog.

export const rateText = (rate: number | null) => (rate === null ? "—" : `${rate}%`);

const weekWords = (week: Date, t: DeliveryWords) => week.toLocaleDateString(intlLocale(t.locale), { day: "numeric", month: "short", timeZone: "Africa/Lagos" });

/** 30 days · 90 days · 12 months, as links (works without JavaScript). */
export async function RangeChips({ path, days, hash }: { path: string; days: number; hash?: string }) {
  const t = await getT("delivery");
  return (
    <FilterChips
      items={ANALYTICS_RANGES.map((option) => ({
        label: rangeLabel(t, option),
        href: `${path}${option === 30 ? "" : `?range=${option}`}${hash ? `#${hash}` : ""}`,
        active: option === days,
      }))}
    />
  );
}

const Empty = ({ children }: { children: ReactNode }) => <p className="m-0 mt-3 text-[14.5px] text-app-ink-soft">{children}</p>;

/** Deliveries per week as bars, with the on-time % and fees per week as small trend lines under them. */
export async function WeeklyChart({ weeks, title: titleProp, feesLabel: feesProp }: { weeks: readonly WeekPoint[]; title?: string; feesLabel?: string }) {
  const t = await getT("delivery");
  const title = titleProp ?? t("an.perWeek");
  const feesLabel = feesProp ?? t("an.fees");
  const total = weeks.reduce((sum, week) => sum + week.delivered, 0);
  const peak = Math.max(1, ...weeks.map((week) => week.delivered));
  const fees = weeks.reduce((sum, week) => sum + week.fees, 0);
  const rated = weeks.filter((week) => week.onTimeRate !== null);
  const describe = (week: WeekPoint) =>
    week.onTimeRate === null
      ? t("an.weekDescribe", { week: weekWords(week.week, t), delivered: week.delivered, fees: naira(week.fees) })
      : t("an.weekDescribeOnTime", { week: weekWords(week.week, t), delivered: week.delivered, rate: `${week.onTimeRate}`, fees: naira(week.fees) });
  return (
    <Card className="p-5">
      <CardHead title={title} sub={t("an.deliveredTotal", { count: total, fees: naira(fees) })} />
      {total === 0 ? (
        <Empty>{t("an.noDeliveries")}</Empty>
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
            <span>{weeks.length ? weekWords(weeks[0].week, t) : ""}</span>
            <span>{t("an.thisWeek")}</span>
          </div>
          <div className="mt-4 grid gap-4 border-t border-app-line pt-4 sm:grid-cols-2">
            <div className="min-w-0">
              <div className="text-[13px] text-app-ink-soft">{t("an.onTimeWeekly")}</div>
              {rated.length >= 2 ? (
                <div className="mt-2 overflow-hidden" aria-hidden>
                  <Sparkline data={rated.map((week) => week.onTimeRate ?? 0)} width={260} height={40} color="var(--color-teal)" fill="var(--color-teal)" />
                </div>
              ) : (
                <div className="mt-1 text-[13px] text-app-ink-faint">{t("an.onTimeNeeds")}</div>
              )}
            </div>
            <div className="min-w-0">
              <div className="text-[13px] text-app-ink-soft">{t("an.weekByWeek", { label: feesLabel })}</div>
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
export async function BreakdownCard({
  title,
  sub,
  rows,
  kind,
  limit = 8,
  empty: emptyProp,
}: {
  title: string;
  sub?: string;
  rows: readonly BreakdownRow[];
  kind: "state" | "service" | "size";
  limit?: number;
  empty?: string;
}) {
  const t = await getT("delivery");
  const empty = emptyProp ?? t("an.noJobs");
  const shown = rows.slice(0, limit);
  const peak = Math.max(1, ...shown.map((row) => row.jobs));
  const label = (key: string) => (key === UNKNOWN ? (kind === "state" ? t("an.stateUnknown") : t("an.notSet")) : kind === "service" ? serviceLabel(t, key) : kind === "size" ? sizeLabel(t, key) : key);
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
                <span className="shrink-0 text-[14px] font-extrabold">{t("an.jobs", { count: row.jobs })}</span>
              </div>
              <span aria-hidden className="block h-1.5 rounded-full bg-app-canvas">
                <span className="block h-full rounded-full bg-app-ink" style={{ width: `${Math.max(3, (row.jobs / peak) * 100)}%` }} />
              </span>
              <div className="text-[12.5px] text-app-ink-soft">
                {t("an.rowDelivered", { count: row.delivered })} · {t("an.rowOnTime", { rate: rateText(row.onTimeRate) })}{row.failed ? ` · ${t("an.rowProblems", { count: row.failed })}` : ""} · {naira(row.fees)}
              </div>
            </li>
          ))}
        </ul>
      )}
      {rows.length > shown.length && <div className="mt-2 text-[12.5px] text-app-ink-soft">{t("an.andMore", { count: rows.length - shown.length })}</div>}
    </Card>
  );
}

/** Simple "reason · count" list (decline reasons). */
export async function CountCard({ title, sub, rows, empty }: { title: string; sub?: string; rows: readonly CountRow[]; empty: string }) {
  const t = await getT("delivery");
  return (
    <Card className="p-5">
      <CardHead title={title} sub={sub} />
      {rows.length === 0 ? (
        <Empty>{empty}</Empty>
      ) : (
        <ul className="m-0 mt-3 list-none divide-y divide-app-line p-0">
          {rows.map((row) => (
            <li key={row.key} className="flex items-center justify-between gap-3 py-2.5">
              <span className="min-w-0 text-[14.5px] font-bold">{declineReasonText(t, row.key)}</span>
              <span className="shrink-0 text-[14.5px] font-extrabold">{row.count}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/** Customer problems reported in the period, by kind, with how many are still open. */
export async function IssuesCard({ rows, sub, empty: emptyProp }: { rows: readonly IssueRow[]; sub?: string; empty?: string }) {
  const t = await getT("delivery");
  const empty = emptyProp ?? t("an.noIssues");
  return (
    <Card className="p-5">
      <CardHead title={t("an.customerProblems")} sub={sub} />
      {rows.length === 0 ? (
        <Empty>{empty}</Empty>
      ) : (
        <ul className="m-0 mt-3 list-none divide-y divide-app-line p-0">
          {rows.map((row) => (
            <li key={row.kind} className="flex items-center justify-between gap-3 py-2.5">
              <span className="min-w-0 text-[14.5px] font-bold">{issueLabel(t, row.kind)}</span>
              <span className="flex shrink-0 items-center gap-2">
                {row.open > 0 && <Pill tone="danger">{t("an.open", { count: row.open })}</Pill>}
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
export async function PartnerComparison({ rows }: { rows: readonly PartnerComparisonRow[] }) {
  const t = await getT("delivery");
  return (
    <Card className="overflow-hidden">
      <CardHead title={t("an.compareTitle")} sub={t("an.compareSub")} className="px-5 pb-3 pt-5" />
      {rows.length === 0 ? (
        <p className="m-0 border-t border-app-line px-5 py-6 text-[14.5px] text-app-ink-soft">{t("an.compareEmpty")}</p>
      ) : (
        <div className="overflow-x-auto border-t border-app-line">
          <table className="w-full min-w-[640px] border-collapse text-left text-[14px]">
            <thead>
              <tr className="text-[12.5px] text-app-ink-soft">
                <th scope="col" className="px-5 py-2.5 font-semibold">{t("an.colPartner")}</th>
                <th scope="col" className="px-3 py-2.5 text-right font-semibold">{t("an.colJobs")}</th>
                <th scope="col" className="px-3 py-2.5 text-right font-semibold">{t("an.colDelivered")}</th>
                <th scope="col" className="px-3 py-2.5 text-right font-semibold">{t("onTime")}</th>
                <th scope="col" className="px-3 py-2.5 text-right font-semibold">{t("an.colFailed")}</th>
                <th scope="col" className="px-3 py-2.5 text-right font-semibold">{t("an.colDeclined")}</th>
                <th scope="col" className="px-5 py-2.5 text-right font-semibold">{t("an.colAverageFee")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-app-line border-t border-app-line">
              {rows.map((row) => (
                <tr key={row.partnerId}>
                  <th scope="row" className="px-5 py-3 font-bold">
                    <span className="flex flex-wrap items-center gap-2">
                      {row.name}
                      {!row.connected && <Pill>{t("an.notConnected")}</Pill>}
                    </span>
                  </th>
                  <td className="px-3 py-3 text-right font-extrabold">{row.jobs}</td>
                  <td className="px-3 py-3 text-right">{row.delivered}</td>
                  <td className="px-3 py-3 text-right" title={row.timed ? t("an.fromTimed", { count: row.timed }) : undefined}>{rateText(row.onTimeRate)}</td>
                  <td className="px-3 py-3 text-right" title={row.finished ? t("an.fromFinished", { count: row.finished }) : undefined}>{rateText(row.failedRate)}</td>
                  <td className="px-3 py-3 text-right">{row.declines + row.notAcceptedInTime > 0 ? `${row.declines}${row.notAcceptedInTime ? ` + ${t("an.late", { count: row.notAcceptedInTime })}` : ""}` : "0"}</td>
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
