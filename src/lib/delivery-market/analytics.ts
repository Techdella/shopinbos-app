// Delivery analytics for the logistics marketplace (spec Phase 3): a partner's marketplace jobs and a seller's or
// supplier's deliveries, worked out from plain job and issue rows over a date range. Pure: no server code and no
// "@/..." imports, so node tests import it directly (tests/delivery-analytics.test.mjs). The loaders that fetch the
// rows live in ./analytics.server.ts.
//
// The rules match the partner stats sellers see when choosing partners (partnerStats in shared/delivery-market.ts):
//   - on time: delivered no later than 12 hours after the estimated delivery time;
//   - failed: of the finished jobs (delivered, returned, returning, or failed with an attempt), the ones that weren't
//     delivered or needed more than one try.
// Unlike partnerStats these rates are shown from the first job (the page says how many jobs they're from).
import { canonicalState, placeOf, type IssueKind } from "../../../shared/delivery-market.ts";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
/** Same grace as partnerStats: delivered within 12 hours of the estimate still counts as on time. */
export const ON_TIME_GRACE_HOURS = 12;
/** Lagos is UTC+1 all year; weeks start on Monday, Lagos time. */
const LAGOS_OFFSET = HOUR;

export const ANALYTICS_RANGES = [30, 90, 365] as const;
export type AnalyticsRangeDays = (typeof ANALYTICS_RANGES)[number];
export const RANGE_LABELS: Record<AnalyticsRangeDays, string> = { 30: "Last 30 days", 90: "Last 90 days", 365: "Last 12 months" };

/** "?range=90" → 90; anything else → 30. */
export function readRangeDays(value: unknown): AnalyticsRangeDays {
  const n = Number(value);
  return (ANALYTICS_RANGES as readonly number[]).includes(n) ? (n as AnalyticsRangeDays) : 30;
}

export interface DateRange {
  from: Date;
  to: Date;
}

export function rangeFor(days: number, now: Date = new Date()): DateRange {
  return { from: new Date(now.getTime() - days * DAY), to: now };
}

type When = Date | string | null | undefined;

export interface AnalyticsJob {
  id?: string;
  status: string;
  createdAt: Date | string;
  deliveryFee: number;
  acceptBy?: When;
  acceptedAt?: When;
  declinedAt?: When;
  declineReason?: string | null;
  pickedUpAt?: When;
  deliveredAt?: When;
  estimatedDelivery?: When;
  failedAttempts?: number | null;
  feePaidAt?: When;
  replacedById?: string | null;
  service?: string | null;
  sizeBand?: string | null;
  /** The customer's state, worked out on the server (destinationState). */
  state?: string | null;
  logisticsPartnerId?: string | null;
}

export interface AnalyticsIssue {
  kind: string;
  status?: string | null;
  createdAt: Date | string;
  logisticsPartnerId?: string | null;
}

const ms = (value: When) => (value ? new Date(value).getTime() : null);
const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : null);

const ACCEPTED_STATUSES = new Set(["confirmed", "picked_up", "in_transit", "out_for_delivery", "at_pickup_point", "delivered", "failed", "returning", "returned"]);

export const isAccepted = (job: AnalyticsJob) => !!job.acceptedAt || ACCEPTED_STATUSES.has(job.status);
export const isDeclined = (job: AnalyticsJob) => job.status === "declined" || (!!job.declinedAt && !job.acceptedAt);

/**
 * The partner never answered in time: still waiting past its accept-by time, or the shop sent it to another partner
 * (cancelled and replaced) before it was ever accepted.
 */
export function isNotAcceptedInTime(job: AnalyticsJob, now: Date = new Date()) {
  if (isAccepted(job) || isDeclined(job)) return false;
  if (job.status === "pending") {
    const by = ms(job.acceptBy);
    return by !== null && by < now.getTime();
  }
  return job.status === "cancelled" && !!job.replacedById;
}

/** Delivered with a promised time, and no later than 12 hours after it (null: no promise to compare with). */
export function isOnTime(job: AnalyticsJob): boolean | null {
  if (job.status !== "delivered") return null;
  const delivered = ms(job.deliveredAt);
  const promised = ms(job.estimatedDelivery);
  if (delivered === null || promised === null) return null;
  return delivered <= promised + ON_TIME_GRACE_HOURS * HOUR;
}

const isFinished = (job: AnalyticsJob) => ["delivered", "returned", "returning"].includes(job.status) || (job.status === "failed" && (job.failedAttempts ?? 0) > 0);
const isFailedFinish = (job: AnalyticsJob) => isFinished(job) && (job.status !== "delivered" || (job.failedAttempts ?? 0) > 0);

export function median(values: readonly number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** 45 min · 3.5 hours · 2 days. */
export function durationWords(millis: number | null): string {
  if (millis === null || !Number.isFinite(millis)) return "—";
  const minutes = Math.max(0, Math.round(millis / 60_000));
  if (minutes < 60) return `${minutes} min`;
  const hours = millis / HOUR;
  if (hours < 48) return `${Math.round(hours * 10) / 10} hours`;
  return `${Math.round((hours / 24) * 10) / 10} days`;
}

/** Jobs created inside the range. */
export function jobsInRange<T extends { createdAt: Date | string }>(rows: readonly T[], range: DateRange): T[] {
  const from = range.from.getTime();
  const to = range.to.getTime();
  return rows.filter((row) => {
    const at = new Date(row.createdAt).getTime();
    return at >= from && at <= to;
  });
}

// ─── Totals ──────────────────────────────────────────────────────────────────

export interface DeliveryTotals {
  offered: number;
  accepted: number;
  declined: number;
  notAcceptedInTime: number;
  delivered: number;
  /** Failed delivery attempts (a job can have several). */
  failedAttempts: number;
  /** Returned or on the way back to the sender. */
  returned: number;
  /** Cancelled, not counting jobs sent to another partner because they weren't accepted in time. */
  cancelled: number;
  /** Accepted of the jobs the partner answered or let run out (0–100), or null. */
  acceptanceRate: number | null;
  medianAcceptMs: number | null;
  medianPickupToDeliveryMs: number | null;
  onTimeRate: number | null;
  /** Delivered jobs with a promised time (what onTimeRate is from). */
  timed: number;
  failedRate: number | null;
  /** Finished jobs (what failedRate is from). */
  finished: number;
  /** Delivery fees of delivered jobs: earnings for a partner, spend for a shop. */
  fees: number;
  /** Paid in the app: split at checkout or paid by card in Shopinbos. */
  feesPaidInApp: number;
  /** Not paid in the app (pay on delivery, or still to pay). */
  feesNotInApp: number;
}

export function deliveryTotals(jobs: readonly AnalyticsJob[], now: Date = new Date()): DeliveryTotals {
  let accepted = 0, declined = 0, notAccepted = 0, delivered = 0, failedAttempts = 0, returned = 0, cancelled = 0;
  let fees = 0, paid = 0, timed = 0, onTime = 0, finished = 0, failed = 0;
  const acceptTimes: number[] = [];
  const rideTimes: number[] = [];
  for (const job of jobs) {
    const late = isNotAcceptedInTime(job, now);
    if (isAccepted(job)) accepted += 1;
    else if (isDeclined(job)) declined += 1;
    else if (late) notAccepted += 1;
    if (job.status === "delivered") {
      delivered += 1;
      fees += job.deliveryFee || 0;
      if (job.feePaidAt) paid += job.deliveryFee || 0;
    }
    failedAttempts += Math.max(job.failedAttempts ?? 0, job.status === "failed" ? 1 : 0);
    if (job.status === "returned" || job.status === "returning") returned += 1;
    if (job.status === "cancelled" && !late) cancelled += 1;
    const onTimeHere = isOnTime(job);
    if (onTimeHere !== null) {
      timed += 1;
      if (onTimeHere) onTime += 1;
    }
    if (isFinished(job)) {
      finished += 1;
      if (isFailedFinish(job)) failed += 1;
    }
    const created = ms(job.createdAt);
    const acceptedAt = ms(job.acceptedAt);
    if (created !== null && acceptedAt !== null && acceptedAt >= created) acceptTimes.push(acceptedAt - created);
    const picked = ms(job.pickedUpAt);
    const deliveredAt = ms(job.deliveredAt);
    if (job.status === "delivered" && picked !== null && deliveredAt !== null && deliveredAt >= picked) rideTimes.push(deliveredAt - picked);
  }
  return {
    offered: jobs.length,
    accepted,
    declined,
    notAcceptedInTime: notAccepted,
    delivered,
    failedAttempts,
    returned,
    cancelled,
    acceptanceRate: pct(accepted, accepted + declined + notAccepted),
    medianAcceptMs: median(acceptTimes),
    medianPickupToDeliveryMs: median(rideTimes),
    onTimeRate: pct(onTime, timed),
    timed,
    failedRate: pct(failed, finished),
    finished,
    fees,
    feesPaidInApp: paid,
    feesNotInApp: fees - paid,
  };
}

// ─── Weekly series ───────────────────────────────────────────────────────────

/** Monday 00:00 (Lagos time) of the week the moment falls in, as a UTC Date. */
export function weekStart(value: Date | string): Date {
  const local = new Date(new Date(value).getTime() + LAGOS_OFFSET);
  const day = (local.getUTCDay() + 6) % 7; // Monday = 0
  const monday = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() - day);
  return new Date(monday - LAGOS_OFFSET);
}

export interface WeekPoint {
  /** Monday 00:00 Lagos time. */
  week: Date;
  delivered: number;
  /** On-time % of that week's deliveries with a promised time, or null. */
  onTimeRate: number | null;
  fees: number;
}

/** Every week from the range's start to its end (empty weeks included), counted by delivery date. */
export function weeklySeries(jobs: readonly AnalyticsJob[], range: DateRange): WeekPoint[] {
  const weeks: WeekPoint[] = [];
  const index = new Map<number, { point: WeekPoint; timed: number; onTime: number }>();
  for (let at = weekStart(range.from).getTime(); at <= range.to.getTime(); at += 7 * DAY) {
    const point: WeekPoint = { week: new Date(at), delivered: 0, onTimeRate: null, fees: 0 };
    weeks.push(point);
    index.set(at, { point, timed: 0, onTime: 0 });
  }
  for (const job of jobs) {
    if (job.status !== "delivered") continue;
    const entry = index.get(weekStart(job.deliveredAt ?? job.createdAt).getTime());
    if (!entry) continue;
    entry.point.delivered += 1;
    entry.point.fees += job.deliveryFee || 0;
    const onTime = isOnTime(job);
    if (onTime !== null) {
      entry.timed += 1;
      if (onTime) entry.onTime += 1;
    }
  }
  for (const entry of index.values()) entry.point.onTimeRate = pct(entry.onTime, entry.timed);
  return weeks;
}

// ─── Breakdowns ──────────────────────────────────────────────────────────────

export interface BreakdownRow {
  key: string;
  jobs: number;
  delivered: number;
  /** Jobs that had a failed attempt or came back. */
  failed: number;
  onTimeRate: number | null;
  fees: number;
}

export const UNKNOWN = "Unknown";

/** Jobs grouped by a key (most jobs first; "Unknown" last). */
export function breakdownBy(jobs: readonly AnalyticsJob[], keyOf: (job: AnalyticsJob) => string | null | undefined): BreakdownRow[] {
  const groups = new Map<string, { row: BreakdownRow; timed: number; onTime: number }>();
  for (const job of jobs) {
    const key = keyOf(job)?.trim() || UNKNOWN;
    const entry = groups.get(key) ?? { row: { key, jobs: 0, delivered: 0, failed: 0, onTimeRate: null, fees: 0 }, timed: 0, onTime: 0 };
    entry.row.jobs += 1;
    if (job.status === "delivered") {
      entry.row.delivered += 1;
      entry.row.fees += job.deliveryFee || 0;
    }
    if (isFailedFinish(job) || job.status === "failed") entry.row.failed += 1;
    const onTime = isOnTime(job);
    if (onTime !== null) {
      entry.timed += 1;
      if (onTime) entry.onTime += 1;
    }
    groups.set(key, entry);
  }
  return [...groups.values()]
    .map((entry) => ({ ...entry.row, onTimeRate: pct(entry.onTime, entry.timed) }))
    .sort((a, b) => Number(a.key === UNKNOWN) - Number(b.key === UNKNOWN) || b.jobs - a.jobs || b.fees - a.fees || a.key.localeCompare(b.key));
}

export const byState = (jobs: readonly AnalyticsJob[]) => breakdownBy(jobs, (job) => job.state);
export const byService = (jobs: readonly AnalyticsJob[]) => breakdownBy(jobs, (job) => job.service);
export const bySizeBand = (jobs: readonly AnalyticsJob[]) => breakdownBy(jobs, (job) => job.sizeBand);

export interface CountRow {
  key: string;
  count: number;
}

/** Most common decline reasons ("No reason given" for blanks). */
export function topDeclineReasons(jobs: readonly AnalyticsJob[], limit = 5): CountRow[] {
  const counts = new Map<string, number>();
  for (const job of jobs) {
    if (!isDeclined(job)) continue;
    const reason = job.declineReason?.trim() || "No reason given";
    counts.set(reason, (counts.get(reason) ?? 0) + 1);
  }
  return [...counts.entries()].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count || a.key.localeCompare(b.key)).slice(0, limit);
}

export interface IssueRow {
  kind: IssueKind | string;
  count: number;
  open: number;
}

/** Customer problems reported in the range, by kind (most first). */
export function issuesByKind(issues: readonly AnalyticsIssue[], range?: DateRange): IssueRow[] {
  const counts = new Map<string, IssueRow>();
  for (const issue of range ? jobsInRange(issues, range) : issues) {
    const row = counts.get(issue.kind) ?? { kind: issue.kind, count: 0, open: 0 };
    row.count += 1;
    if ((issue.status ?? "open") === "open") row.open += 1;
    counts.set(issue.kind, row);
  }
  return [...counts.values()].sort((a, b) => b.count - a.count || String(a.kind).localeCompare(String(b.kind)));
}

// ─── Per-partner comparison (a shop's partners) ─────────────────────────────

export interface PartnerComparisonRow {
  partnerId: string;
  name: string;
  jobs: number;
  delivered: number;
  onTimeRate: number | null;
  timed: number;
  failedRate: number | null;
  finished: number;
  declines: number;
  notAcceptedInTime: number;
  /** Average fee of delivered jobs, or of all jobs offered when none were delivered yet. */
  averageFee: number | null;
  fees: number;
  connected: boolean;
}

/** One row per partner: every connected partner (even with no jobs yet), plus any other partner that had jobs. */
export function comparePartners(
  jobs: readonly AnalyticsJob[],
  partners: ReadonlyArray<{ id: string; name: string; connected?: boolean }>,
  now: Date = new Date(),
): PartnerComparisonRow[] {
  const ids = new Set(partners.map((partner) => partner.id));
  const extra = [...new Set(jobs.map((job) => job.logisticsPartnerId).filter((id): id is string => !!id && !ids.has(id)))];
  const all = [...partners.map((partner) => ({ ...partner, connected: partner.connected ?? true })), ...extra.map((id) => ({ id, name: "Other partner", connected: false }))];
  return all
    .map((partner) => {
      const mine = jobs.filter((job) => job.logisticsPartnerId === partner.id);
      const totals = deliveryTotals(mine, now);
      const priced = totals.delivered ? mine.filter((job) => job.status === "delivered") : mine;
      return {
        partnerId: partner.id,
        name: partner.name,
        jobs: mine.length,
        delivered: totals.delivered,
        onTimeRate: totals.onTimeRate,
        timed: totals.timed,
        failedRate: totals.failedRate,
        finished: totals.finished,
        declines: totals.declined,
        notAcceptedInTime: totals.notAcceptedInTime,
        averageFee: priced.length ? Math.round(priced.reduce((sum, job) => sum + (job.deliveryFee || 0), 0) / priced.length) : null,
        fees: totals.fees,
        connected: partner.connected,
      };
    })
    .sort((a, b) => b.jobs - a.jobs || Number(b.connected) - Number(a.connected) || a.name.localeCompare(b.name));
}

// ─── Places ──────────────────────────────────────────────────────────────────

/**
 * The customer's state for a job: from the order's delivery address when there is one, else from the job's
 * destination text ("12 Allen Avenue, Ikeja, Lagos (landmark: …)"), reading the parts from the end.
 */
export function destinationState(address: unknown, destination?: string | null): string | null {
  if (address && typeof address === "object") {
    const a = address as Record<string, unknown>;
    const text = (key: string) => (typeof a[key] === "string" ? (a[key] as string) : null);
    const place = placeOf({ state: text("state"), city: text("city"), area: text("area") });
    if (place.state) return place.state;
  }
  const plain = String(destination ?? "").replace(/\(.*?\)/g, " ").trim();
  if (!plain) return null;
  const parts = plain.split(/[,\n]/).map((part) => part.trim()).filter(Boolean);
  for (let i = parts.length - 1; i >= 0; i -= 1) {
    const state = canonicalState(parts[i]);
    if (state) return state;
  }
  return null;
}

// ─── Everything for a page ───────────────────────────────────────────────────

export interface DeliveryAnalytics {
  range: DateRange;
  totals: DeliveryTotals;
  weeks: WeekPoint[];
  states: BreakdownRow[];
  services: BreakdownRow[];
  sizes: BreakdownRow[];
  declineReasons: CountRow[];
  issues: IssueRow[];
  issueCount: number;
  openIssues: number;
}

export function deliveryAnalytics(input: { jobs: readonly AnalyticsJob[]; issues?: readonly AnalyticsIssue[]; range: DateRange; now?: Date }): DeliveryAnalytics {
  const now = input.now ?? input.range.to;
  const jobs = jobsInRange(input.jobs, input.range);
  const issues = issuesByKind(input.issues ?? [], input.range);
  return {
    range: input.range,
    totals: deliveryTotals(jobs, now),
    weeks: weeklySeries(jobs, input.range),
    states: byState(jobs),
    services: byService(jobs),
    sizes: bySizeBand(jobs),
    declineReasons: topDeclineReasons(jobs),
    issues,
    issueCount: issues.reduce((sum, row) => sum + row.count, 0),
    openIssues: issues.reduce((sum, row) => sum + row.open, 0),
  };
}
