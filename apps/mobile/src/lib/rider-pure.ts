// Pure helpers for the Riders app (apps/mobile/src/app/rider): which delivery is in focus, which jobs one pickup
// moves, the "Yaba → Lekki" line, initials and this week's deliveries grouped by day. No imports, so
// tests/rider-app.test.mjs loads this file directly.

export interface PureDrop {
  id: string;
  status: string;
  area: string;
  areaShort?: string | null;
  hasPickupCode?: boolean;
}

export interface PureRun<D extends PureDrop = PureDrop> {
  pickupName: string;
  pickupArea?: string | null;
  drops: D[];
}

/** On the road with the parcel: picked up, in transit or out for delivery. */
export function isCarrying(status: string) {
  return status === "picked_up" || status === "in_transit" || status === "out_for_delivery";
}

/**
 * The delivery the rider works on: the one asked for (a notification, an old link), else the one in hand, else the
 * next one waiting to be picked up. null when there's nothing.
 */
export function riderFocus<D extends PureDrop, R extends PureRun<D>>(runs: R[], dropId?: string | null): { run: R; drop: D } | null {
  const all = runs.flatMap((run) => run.drops.map((drop) => ({ run, drop })));
  return (
    (dropId ? all.find((item) => item.drop.id === dropId) : undefined) ??
    all.find((item) => isCarrying(item.drop.status)) ??
    all.find((item) => item.drop.status === "confirmed") ??
    null
  );
}

/** A job the partner gave the rider that they haven't taken on yet ("New job"): waiting, and not taken on this phone. */
export function waitingOffer<D extends PureDrop, R extends PureRun<D>>(runs: R[], taken: readonly string[] = []): { run: R; drop: D } | null {
  for (const run of runs) for (const drop of run.drops) if (drop.status === "confirmed" && !taken.includes(drop.id)) return { run, drop };
  return null;
}

/** The job in hand ("On a job"): one being carried, else one the rider took but hasn't picked up yet. */
export function activeJob<D extends PureDrop, R extends PureRun<D>>(runs: R[], taken: readonly string[] = []): { run: R; drop: D } | null {
  const all = runs.flatMap((run) => run.drops.map((drop) => ({ run, drop })));
  return all.find((item) => isCarrying(item.drop.status)) ?? all.find((item) => item.drop.status === "confirmed" && taken.includes(item.drop.id)) ?? null;
}

/**
 * The jobs one pickup moves to "picked up": the one whose code the rider typed, plus the run's other waiting
 * parcels that have no pickup code (each coded parcel needs its own code).
 */
export function pickupJobIds(run: PureRun, focusId: string) {
  const others = run.drops.filter((drop) => drop.id !== focusId && drop.status === "confirmed" && !drop.hasPickupCode).map((drop) => drop.id);
  return [focusId, ...others];
}

/** "Yaba → Lekki": known areas when the addresses name one, else the shop's name and the drop's area. */
export function routeLine(run: PureRun, drop: PureDrop) {
  return `${run.pickupArea || run.pickupName} → ${drop.areaShort || drop.area}`;
}

export function initials(name: string) {
  return name.trim().split(/\s+/).filter(Boolean).map((part) => part[0]).join("").toUpperCase().slice(0, 2) || "R";
}

export function firstName(name: string | null | undefined) {
  return name ? name.trim().split(/\s+/)[0] ?? null : null;
}

const LAGOS_OFFSET_MS = 60 * 60 * 1000; // Africa/Lagos is UTC+1 all year.

/** The Lagos calendar day of an instant, "2026-10-20". */
export function lagosDay(at: string | Date) {
  return new Date(new Date(at).getTime() + LAGOS_OFFSET_MS).toISOString().slice(0, 10);
}

/** Lagos clock time, "10:40". */
export function lagosTime(at: string | Date) {
  return new Date(new Date(at).getTime() + LAGOS_OFFSET_MS).toISOString().slice(11, 16);
}

export type DayGroup = "today" | "yesterday" | "earlier";

/** This week's deliveries under "Today", "Yesterday" and "Earlier this week", newest first, empty groups left out. */
export function groupByDay<T extends { deliveredAt: string }>(items: T[], now = new Date()): { group: DayGroup; items: T[] }[] {
  const today = lagosDay(now);
  const yesterday = lagosDay(new Date(now.getTime() - 24 * 60 * 60 * 1000));
  const groups: Record<DayGroup, T[]> = { today: [], yesterday: [], earlier: [] };
  const sorted = [...items].sort((a, b) => new Date(b.deliveredAt).getTime() - new Date(a.deliveredAt).getTime());
  for (const item of sorted) {
    const day = lagosDay(item.deliveredAt);
    groups[day === today ? "today" : day === yesterday ? "yesterday" : "earlier"].push(item);
  }
  return (["today", "yesterday", "earlier"] as const).filter((group) => groups[group].length).map((group) => ({ group, items: groups[group] }));
}
