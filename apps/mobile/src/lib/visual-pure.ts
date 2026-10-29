// Pure helpers behind the soft-card building blocks (components/visual.tsx): bar heights for the mini charts, the
// last days' weekdays and totals (Lagos time), and a ratings summary. No React Native imports, so the tests load this
// file directly (tests/mobile-visual.test.mjs).

const DAY_MS = 24 * 60 * 60 * 1000;
/** Lagos is UTC+1 all year (no daylight saving). */
const LAGOS_OFFSET_MS = 60 * 60 * 1000;

/**
 * Bar heights for a mini chart: the biggest value fills `max`, the rest in proportion; a day with nothing (or a
 * small value) still shows a short stub (`min` of the height) so the row of bars reads as a week. Negative and
 * missing values count as 0; all zeros gives all stubs.
 */
export function barHeights(values: readonly number[], max: number, min = 0.08): number[] {
  const clean = values.map((value) => (Number.isFinite(value) && value > 0 ? value : 0));
  const top = Math.max(0, ...clean);
  return clean.map((value) => Math.round(Math.max(min, top > 0 ? value / top : 0) * max));
}

/** The Lagos calendar day (YYYY-MM-DD) of a moment. */
export function lagosDayKey(at: string | number | Date): string {
  return new Date(new Date(at).getTime() + LAGOS_OFFSET_MS).toISOString().slice(0, 10);
}

/** Monday = 0 … Sunday = 6, in Lagos, for a moment. */
export function lagosWeekday(at: string | number | Date): number {
  return (new Date(new Date(at).getTime() + LAGOS_OFFSET_MS).getUTCDay() + 6) % 7;
}

/** The weekdays (Monday = 0) of the last `days` days, oldest first, ending today in Lagos. */
export function trailingWeekdays(days: number, now: Date = new Date()): number[] {
  return Array.from({ length: Math.max(0, days) }, (_, index) => lagosWeekday(now.getTime() - (days - 1 - index) * DAY_MS));
}

/**
 * Money per day for the last `days` days (oldest first, today last, Lagos days) from dated rows. `complete` says
 * whether the rows hold the whole period: their sum in the window equals `expectedTotal` (a list cut to the newest
 * few would draw a week that looks quieter than it was, so the chart is only shown when complete).
 */
export function trailingTotals<R extends { at: string | null | undefined; amount: number }>(rows: readonly R[], days: number, expectedTotal: number, now: Date = new Date()): { totals: number[]; complete: boolean } {
  const keys = Array.from({ length: Math.max(0, days) }, (_, index) => lagosDayKey(now.getTime() - (days - 1 - index) * DAY_MS));
  const totals = keys.map(() => 0);
  for (const row of rows) {
    if (!row.at) continue;
    const at = keys.indexOf(lagosDayKey(row.at));
    if (at >= 0) totals[at] += Number(row.amount) || 0;
  }
  const sum = totals.reduce((total, value) => total + value, 0);
  return { totals, complete: days > 0 && Math.round(sum) === Math.round(expectedTotal) };
}

export interface RatingSummary {
  /** One decimal ("4.4"), or null with no ratings. */
  average: string | null;
  count: number;
  /** 5 stars first: how many gave each, and their share of the ones counted here (0–1). Null when `ratings` is only
   * part of `count` (the newest few): bars from a sample would mislead. */
  bars: { stars: number; count: number; share: number }[] | null;
}

/** The big "4.4 ★ · 32 ratings" with 5→1 star bars when every rating is at hand. */
export function ratingSummary(average: number | null | undefined, count: number, ratings: readonly { rating: number }[]): RatingSummary {
  const total = Math.max(0, Math.floor(count || 0));
  const shown = average != null && Number.isFinite(average) && total > 0 ? (Math.round(average * 10) / 10).toFixed(1) : null;
  const whole = ratings.length > 0 && ratings.length === total;
  const bars = whole
    ? [5, 4, 3, 2, 1].map((stars) => {
        const n = ratings.filter((entry) => Math.round(entry.rating) === stars).length;
        return { stars, count: n, share: n / ratings.length };
      })
    : null;
  return { average: shown, count: total, bars };
}

/** Which dot is lit in a carousel from its scroll offset (snapped to the nearest page, kept in range). */
export function pageAt(offset: number, pageWidth: number, pages: number): number {
  if (!(pageWidth > 0) || pages <= 0) return 0;
  return Math.min(pages - 1, Math.max(0, Math.round(offset / pageWidth)));
}
