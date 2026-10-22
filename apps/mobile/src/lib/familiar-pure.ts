// Pure helpers for the shared "Familiar app" screens (Rewards, Ask Peggy, Create with Rex, the posts calendar, a new
// status, the notification filters). No imports, so tests/mobile-familiar-shared.test.mjs loads this file directly.

export type FamiliarRole = "seller" | "supplier" | "logistics_partner";

/** The three business roles; anything else (admin, not known yet) is treated as a seller for wording. */
export function familiarRole(role: string | null | undefined): FamiliarRole {
  return role === "supplier" || role === "logistics_partner" ? role : "seller";
}

/** Create with Rex formats, in the order of the segments, and their words in m_familiar. */
export const FORMATS = ["status", "reel", "post", "flyer"] as const;
export type Format = (typeof FORMATS)[number];
export const FORMAT_KEY = { status: "cr.format.status", reel: "cr.format.reel", post: "cr.format.post", flyer: "cr.format.flyer" } as const;

export function asFormat(value: unknown): Format | null {
  return typeof value === "string" && (FORMATS as readonly string[]).includes(value) ? (value as Format) : null;
}

/** Midnight (phone time) of the day `date` falls on. */
export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** Monday to Sunday of the week `anchor` is in (the posts calendar's week strip). */
export function weekDays(anchor: Date): Date[] {
  const day = startOfDay(anchor);
  const fromMonday = (day.getDay() + 6) % 7;
  const monday = new Date(day.getFullYear(), day.getMonth(), day.getDate() - fromMonday);
  return Array.from({ length: 7 }, (_, index) => new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + index));
}

/** The week's range for GET /api/mobile/posts: Monday 00:00 up to the next Monday 00:00. */
export function weekRange(anchor: Date): { from: Date; to: Date } {
  const days = weekDays(anchor);
  const last = days[6];
  return { from: days[0], to: new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1) };
}

/** The day a post belongs to: when it's scheduled, else when it was posted. */
export function postDay(post: { scheduledAt: string | null; postedAt: string | null }): Date | null {
  const at = post.scheduledAt ?? post.postedAt;
  if (!at) return null;
  const date = new Date(at);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Times offered when scheduling ("8:00 am", "1:00 pm", "7:00 pm" in the prototype), as hours. */
export const SCHEDULE_HOURS = [8, 13, 19] as const;

/** Today and the next six days, for the day chips. */
export function scheduleDays(now: Date, count = 7): Date[] {
  const today = startOfDay(now);
  return Array.from({ length: count }, (_, index) => new Date(today.getFullYear(), today.getMonth(), today.getDate() + index));
}

/** That day at that hour (phone time). */
export function scheduleAt(day: Date, hour: number): Date {
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour, 0, 0, 0);
}

/** A time is offered only when it is still at least 10 minutes away. */
export function canSchedule(day: Date, hour: number, now: Date): boolean {
  return scheduleAt(day, hour).getTime() - now.getTime() >= 10 * 60 * 1000;
}

/** The first day and hour that can still be picked: today's next slot, else tomorrow morning. */
export function firstSlot(now: Date): { day: Date; hour: number } {
  const today = startOfDay(now);
  const hour = SCHEDULE_HOURS.find((h) => canSchedule(today, h, now));
  if (hour !== undefined) return { day: today, hour };
  return { day: new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1), hour: SCHEDULE_HOURS[0] };
}

export type PostPill = { key: "posted" | "scheduled" | "draft" | "attention" | "yourTurn"; tone: "ok" | "teal" | "gray" | "warn" | "org" };

/**
 * Posted (green), Scheduled (mint) or Draft (grey); a seller's post that didn't go out needs attention (amber), and
 * one waiting for their tap on WhatsApp, TikTok or X is "Your turn" (orange).
 */
export function postPill(status: string, yourTurn = false): PostPill {
  if (status === "attention") return { key: "attention", tone: "warn" };
  if (yourTurn && (status === "posted" || status === "scheduled")) return { key: "yourTurn", tone: "org" };
  if (status === "posted") return { key: "posted", tone: "ok" };
  if (status === "scheduled") return { key: "scheduled", tone: "teal" };
  return { key: "draft", tone: "gray" };
}

/** Facebook and Instagram can post by themselves (when a seller connects their Page on Social posts). */
export const AUTO_PLATFORMS = ["facebook", "instagram"] as const;

/**
 * What happens at the time for the picked apps: `auto` post by themselves (a seller's connected Facebook and
 * Instagram), `remind` get a reminder (everything else, and every app for suppliers and delivery partners).
 */
export function scheduleSplit<P extends string>(platforms: readonly P[], accounts: ReadonlyArray<{ key: string; auto?: boolean }> | null | undefined): { auto: P[]; remind: P[] } {
  const auto = new Set((accounts ?? []).filter((account) => account.auto).map((account) => account.key));
  return { auto: platforms.filter((key) => auto.has(key)), remind: platforms.filter((key) => !auto.has(key)) };
}

/**
 * Whether an app can be picked when scheduling: a seller's Facebook and Instagram only post through the Page
 * connected on Social posts, so they need it connected first (`accounts` from the server say whether it's a
 * seller's: only theirs carry `auto`).
 */
export function needsConnecting(platform: string, accounts: ReadonlyArray<{ key: string; auto?: boolean; linked: boolean }> | null | undefined): boolean {
  if (!(AUTO_PLATFORMS as readonly string[]).includes(platform)) return false;
  const account = accounts?.find((item) => item.key === platform);
  return Boolean(account && account.auto !== undefined && !account.auto);
}

/** "WhatsApp", "WhatsApp and TikTok", "WhatsApp, TikTok and X" with the language's "and". */
export function joinNames(names: readonly string[], and: (a: string, b: string) => string): string {
  if (names.length <= 1) return names[0] ?? "";
  return and(names.slice(0, -1).join(", "), names[names.length - 1]);
}

/**
 * The notification filter chips from the prototype and the bell's server tab each one reads:
 * sellers and suppliers All / Orders / Money / Rex and Peggy, delivery partners All / Jobs / Money / Peggy.
 * Rex and Peggy's notes (types peggy and rexai) are in the "marketing" category (shared/notifications.ts).
 */
export type NotificationFilter = { key: "all" | "orders" | "jobs" | "money" | "ai" | "peggy"; tab: string };

export function notificationFilters(role: string | null | undefined): NotificationFilter[] {
  if (role === "logistics_partner") {
    return [
      { key: "all", tab: "all" },
      { key: "jobs", tab: "orders" },
      { key: "money", tab: "money" },
      { key: "peggy", tab: "marketing" },
    ];
  }
  return [
    { key: "all", tab: "all" },
    { key: "orders", tab: "orders" },
    { key: "money", tab: "money" },
    { key: "ai", tab: "marketing" },
  ];
}

/** What a status from this role is about, before the person adds their own words. */
export type StatusPick = { key: string; tone: "peach" | "mint" | "blue" | "warn" | "ink" };

export function statusPicks(role: FamiliarRole): StatusPick[] {
  if (role === "logistics_partner") {
    return [
      { key: "route", tone: "blue" },
      { key: "pickup", tone: "mint" },
      { key: "sameDay", tone: "peach" },
      { key: "interstate", tone: "ink" },
    ];
  }
  if (role === "seller") {
    return [
      { key: "partner", tone: "blue" },
      { key: "stock", tone: "peach" },
      { key: "packing", tone: "mint" },
      { key: "other", tone: "ink" },
    ];
  }
  return [];
}

/** A short answer is enough for a status headline; the server takes up to this many characters. */
export const STATUS_HEADLINE_MAX = 80;
export const STATUS_CAPTION_MAX = 280;

/** The headline sent with a status: the person's words, else the pick's words, trimmed to fit. */
export function statusHeadline(said: string, fallback: string): string {
  const text = (said.trim() || fallback.trim()).replace(/\s+/g, " ");
  return text.length > STATUS_HEADLINE_MAX ? `${text.slice(0, STATUS_HEADLINE_MAX - 1).trimEnd()}…` : text;
}

/** How long to wait before asking again whether Rex has finished (gentle back-off, capped). */
export function pollDelay(attempt: number): number {
  return Math.min(6000, 1500 + attempt * 500);
}

/** Stop polling after about four minutes; the job stays in "My posts" if it finishes later. */
export const POLL_LIMIT = 50;
