// Date ranges for /home/analytics, in Lagos time (Africa/Lagos is UTC+1 all year, no daylight saving).
// Pure: no server imports, so tests/behaviour.test.mjs can run it directly.

export const LAGOS_OFFSET_MS = 60 * 60 * 1000;
export const DAY_MS = 24 * 60 * 60 * 1000;

export const RANGE_PRESETS = [
  { key: "today", label: "Today", days: 1 },
  { key: "7d", label: "Last 7 days", days: 7 },
  { key: "30d", label: "Last 30 days", days: 30 },
  { key: "90d", label: "Last 90 days", days: 90 },
] as const;

export type RangePreset = (typeof RANGE_PRESETS)[number]["key"];
export type RangeKey = RangePreset | "custom";
export type Bucket = "hour" | "day" | "week";

/** Longest custom range we aggregate in one request. */
export const MAX_RANGE_DAYS = 366;

export interface ResolvedRange {
  key: RangeKey;
  label: string;
  /** Inclusive start (Lagos midnight). */
  start: Date;
  /** Exclusive end (the Lagos midnight after the last day). */
  end: Date;
  days: number;
  bucket: Bucket;
  /** The same length of time immediately before, cut to the same elapsed time when this range is still running. */
  previous: { start: Date; end: Date };
  /** YYYY-MM-DD of the first and last day (Lagos), for inputs and CSV names. */
  fromDay: string;
  toDay: string;
}

export function lagosDayKey(date: Date) {
  return new Date(date.getTime() + LAGOS_OFFSET_MS).toISOString().slice(0, 10);
}

export function lagosHour(date: Date) {
  return new Date(date.getTime() + LAGOS_OFFSET_MS).getUTCHours();
}

/** Lagos midnight at the start of the given YYYY-MM-DD, or null when it isn't a real date. */
export function lagosMidnight(day: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day.trim());
  if (!match) return null;
  const [year, month, date] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const utc = Date.UTC(year, month - 1, date);
  const check = new Date(utc);
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== date) return null;
  return new Date(utc - LAGOS_OFFSET_MS);
}

export function startOfLagosDay(date: Date) {
  return lagosMidnight(lagosDayKey(date)) as Date;
}

const DAY_LABEL = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Lagos", day: "numeric", month: "short" });
const DAY_LABEL_YEAR = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Lagos", day: "numeric", month: "short", year: "numeric" });

export function formatDay(date: Date, withYear = false) {
  return (withYear ? DAY_LABEL_YEAR : DAY_LABEL).format(date);
}

/**
 * Turns ?range=7d (or ?range=custom&from=2026-09-01&to=2026-09-30) into concrete dates. Anything invalid falls back
 * to the last 30 days, and `error` says why so the page can tell the seller.
 */
export function resolveRange(
  params: { range?: string | null; from?: string | null; to?: string | null },
  now = new Date(),
): ResolvedRange & { error?: string } {
  const today = startOfLagosDay(now);
  let key: RangeKey = "30d";
  let start: Date;
  let end: Date;
  let error: string | undefined;

  const preset = RANGE_PRESETS.find((item) => item.key === params.range);
  if (params.range === "custom") {
    const from = lagosMidnight(params.from ?? "");
    const to = lagosMidnight(params.to ?? "");
    if (!from || !to) {
      error = "Pick both a start and an end date.";
    } else if (from.getTime() > to.getTime()) {
      error = "The start date is after the end date.";
    } else if (from.getTime() > today.getTime()) {
      error = "That range is in the future.";
    } else if ((to.getTime() - from.getTime()) / DAY_MS + 1 > MAX_RANGE_DAYS) {
      error = `Pick a range of ${MAX_RANGE_DAYS} days or fewer.`;
    } else {
      key = "custom";
      start = from;
      end = new Date(Math.min(to.getTime(), today.getTime()) + DAY_MS);
    }
  } else if (preset) {
    key = preset.key;
  }

  if (key !== "custom") {
    const days = RANGE_PRESETS.find((item) => item.key === key)!.days;
    start = new Date(today.getTime() - (days - 1) * DAY_MS);
    end = new Date(today.getTime() + DAY_MS);
  }

  const days = Math.round((end!.getTime() - start!.getTime()) / DAY_MS);
  const length = end!.getTime() - start!.getTime();
  const elapsed = Math.min(length, Math.max(0, now.getTime() - start!.getTime()));
  const previousStart = new Date(start!.getTime() - length);
  const fromDay = lagosDayKey(start!);
  const toDay = lagosDayKey(new Date(end!.getTime() - DAY_MS));
  const label =
    key === "custom"
      ? fromDay === toDay
        ? formatDay(start!, true)
        : `${formatDay(start!)} to ${formatDay(new Date(end!.getTime() - DAY_MS), true)}`
      : RANGE_PRESETS.find((item) => item.key === key)!.label;

  return {
    key,
    label,
    start: start!,
    end: end!,
    days,
    bucket: days <= 1 ? "hour" : days <= 92 ? "day" : "week",
    previous: { start: previousStart, end: new Date(previousStart.getTime() + elapsed) },
    fromDay,
    toDay,
    ...(error ? { error } : {}),
  };
}

/** Bucket boundaries for a range: one per hour (today), day, or 7-day block (counted from the range start). */
export function rangeBuckets(range: Pick<ResolvedRange, "start" | "end" | "bucket">): Array<{ start: Date; end: Date; label: string }> {
  const step = range.bucket === "hour" ? 60 * 60 * 1000 : range.bucket === "day" ? DAY_MS : 7 * DAY_MS;
  const buckets: Array<{ start: Date; end: Date; label: string }> = [];
  for (let at = range.start.getTime(); at < range.end.getTime(); at += step) {
    const start = new Date(at);
    const end = new Date(Math.min(at + step, range.end.getTime()));
    const label =
      range.bucket === "hour"
        ? (() => {
            const hour = lagosHour(start);
            return `${hour % 12 === 0 ? 12 : hour % 12}${hour < 12 ? "am" : "pm"}`;
          })()
        : range.bucket === "day"
          ? formatDay(start)
          : `Week of ${formatDay(start)}`;
    buckets.push({ start, end, label });
  }
  return buckets;
}
