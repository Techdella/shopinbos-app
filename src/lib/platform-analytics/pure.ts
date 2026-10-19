// Admin › Analytics helpers: day series with no gaps, the weekly retention grid. Pure so tests can use them.

export type DayPoint = { date: string; value: number };

/** Every day from `from` to `to` (YYYY-MM-DD, inclusive), with 0 where a day had nothing. */
export function fillDays(points: DayPoint[], from: string, to: string): DayPoint[] {
  const byDate = new Map<string, number>();
  for (const point of points) byDate.set(point.date, (byDate.get(point.date) ?? 0) + point.value);
  const out: DayPoint[] = [];
  const end = Date.parse(`${to}T00:00:00Z`);
  for (let t = Date.parse(`${from}T00:00:00Z`); t <= end && out.length < 1000; t += 86_400_000) {
    const date = new Date(t).toISOString().slice(0, 10);
    out.push({ date, value: byDate.get(date) ?? 0 });
  }
  return out;
}

export type CohortRow = { week: string; size: number; /** Share of the cohort active in week 0, 1, 2… (null = in the future). */ weeks: Array<number | null> };

/**
 * Weekly retention: `sizes` is sign-ups per cohort week (Monday, YYYY-MM-DD), `active` how many of them used the app
 * k weeks later. Week k of a cohort that hasn't happened yet is null, so the grid shows a triangle.
 */
export function retentionGrid(sizes: Array<{ week: string; size: number }>, active: Array<{ week: string; k: number; n: number }>, weeks: number, today: string): CohortRow[] {
  const now = Date.parse(`${today}T00:00:00Z`);
  return sizes
    .slice()
    .sort((a, b) => a.week.localeCompare(b.week))
    .map(({ week, size }) => {
      const start = Date.parse(`${week}T00:00:00Z`);
      return {
        week,
        size,
        weeks: Array.from({ length: weeks }, (_, k) => {
          if (start + k * 7 * 86_400_000 > now) return null;
          const n = active.find((row) => row.week === week && row.k === k)?.n ?? 0;
          return size ? n / size : 0;
        }),
      };
    });
}

/** "12 → 18": the change against the previous period as a signed percent, or null when there was nothing before. */
export function change(current: number, previous: number) {
  if (!previous) return null;
  return Math.round(((current - previous) / previous) * 100);
}

/** Monday of the week a day falls in (UTC), YYYY-MM-DD. */
export function weekStart(date: Date) {
  const day = (date.getUTCDay() + 6) % 7;
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() - day)).toISOString().slice(0, 10);
}
