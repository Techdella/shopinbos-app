// Rewards rules for sellers, suppliers and delivery partners (phone app "Rewards"): the per-role catalogs (levels,
// weekly challenges, badges), what each event is worth, the level for an XP total, the Lagos week and day, and the
// streak. Pure and unit-tested (tests/rewards.test.mjs): no server-only imports, so node tests load it directly.
// The database side is rewards.server.ts. Points are never turned into cash: they only swap for free AI credits.

export type RewardRole = "seller" | "supplier" | "logistics_partner";
export const REWARD_ROLES: readonly RewardRole[] = ["seller", "supplier", "logistics_partner"];

export const REWARD_KINDS = [
  "order_paid", // seller: a shop order was paid (ref: retail order id)
  "order_accepted", // supplier: accepted a dropship order (ref: supplier order id)
  "order_accepted_fast", // supplier: ...within 2 hours of it arriving
  "shop_supplied", // supplier: a new shop's order (ref: seller user id), for "10 shops"
  "product_added", // seller or supplier: a new product (ref: product id)
  "quote_sent", // supplier: answered a quote request with a price (ref: quote id)
  "status_posted", // anyone: posted a Status (ref: post id), called by the Status backend
  "delivery_done", // partner: delivered a job (ref: booking id)
  "delivery_on_time", // partner: ...on time
  "job_accepted_fast", // partner: accepted a job within 30 minutes (ref: booking id)
  "chat_replied_fast", // seller: answered a customer within an hour (ref: the customer's message id)
  "partner_connected", // seller or supplier: connected a delivery partner (ref: partner id)
] as const;
export type RewardKind = (typeof REWARD_KINDS)[number];

export function isRewardKind(value: unknown): value is RewardKind {
  return typeof value === "string" && (REWARD_KINDS as readonly string[]).includes(value);
}

/**
 * What one event is worth. `perDay` caps the events that pay on one Lagos day (the rest are still counted for
 * challenges and badges, they just add no XP or points), so posting 50 statuses can't farm credits.
 */
export const EVENT_VALUES: Record<RewardKind, { xp: number; points: number; perDay: number | null }> = {
  order_paid: { xp: 20, points: 10, perDay: null },
  order_accepted: { xp: 10, points: 5, perDay: null },
  order_accepted_fast: { xp: 10, points: 5, perDay: null },
  shop_supplied: { xp: 20, points: 10, perDay: null },
  product_added: { xp: 10, points: 5, perDay: 5 },
  quote_sent: { xp: 10, points: 5, perDay: 10 },
  status_posted: { xp: 15, points: 15, perDay: 3 },
  delivery_done: { xp: 10, points: 5, perDay: null },
  delivery_on_time: { xp: 10, points: 5, perDay: null },
  job_accepted_fast: { xp: 5, points: 2, perDay: null },
  chat_replied_fast: { xp: 5, points: 2, perDay: 10 },
  partner_connected: { xp: 20, points: 10, perDay: 3 },
};

/** XP and points for an event, given how many of the same kind already happened today. */
export function eventReward(kind: RewardKind, alreadyToday: number): { xp: number; points: number } {
  const value = EVENT_VALUES[kind];
  if (value.perDay !== null && alreadyToday >= value.perDay) return { xp: 0, points: 0 };
  return { xp: value.xp, points: value.points };
}

// ─── Catalogs ────────────────────────────────────────────────────────────────

export interface LevelDef {
  level: number;
  name: string;
  /** XP needed to reach this level. */
  xp: number;
}
export interface ChallengeDef {
  key: string;
  title: string;
  /** Counted from this week's RewardEvents of this kind. */
  kind: RewardKind;
  target: number;
  /** Points (and the same XP) for claiming it. */
  points: number;
}
export type BadgeRule = { type: "count"; kind: RewardKind; target: number } | { type: "streak"; target: number } | { type: "verified" };
export interface BadgeDef {
  key: string;
  title: string;
  rule: BadgeRule;
}
export interface RoleCatalog {
  levels: LevelDef[];
  challenges: ChallengeDef[];
  badges: BadgeDef[];
}

export const CATALOGS: Record<RewardRole, RoleCatalog> = {
  seller: {
    levels: [
      { level: 1, name: "New seller", xp: 0 },
      { level: 2, name: "Growing seller", xp: 200 },
      { level: 3, name: "Rising seller", xp: 500 },
      { level: 4, name: "Star seller", xp: 1000 },
      { level: 5, name: "Top seller", xp: 2000 },
      { level: 6, name: "Legend seller", xp: 4000 },
    ],
    challenges: [
      { key: "seller_status_3", title: "Post 3 statuses", kind: "status_posted", target: 3, points: 30 },
      { key: "seller_fast_replies", title: "Answer chats within an hour", kind: "chat_replied_fast", target: 5, points: 20 },
      { key: "seller_orders_10", title: "Get 10 orders", kind: "order_paid", target: 10, points: 100 },
      { key: "seller_connect_partner", title: "Connect a delivery partner", kind: "partner_connected", target: 1, points: 50 },
    ],
    badges: [
      { key: "first_sale", title: "First sale", rule: { type: "count", kind: "order_paid", target: 1 } },
      { key: "streak_3", title: "3-day streak", rule: { type: "streak", target: 3 } },
      { key: "quick_replier", title: "Quick replier", rule: { type: "count", kind: "chat_replied_fast", target: 10 } },
      { key: "orders_50", title: "50 orders", rule: { type: "count", kind: "order_paid", target: 50 } },
    ],
  },
  supplier: {
    levels: [
      { level: 1, name: "New supplier", xp: 0 },
      { level: 2, name: "Trusted supplier", xp: 300 },
      { level: 3, name: "Top supplier", xp: 800 },
      { level: 4, name: "Star supplier", xp: 1600 },
      { level: 5, name: "Elite supplier", xp: 3000 },
      { level: 6, name: "Legend supplier", xp: 5000 },
    ],
    challenges: [
      { key: "supplier_fast_accept", title: "Accept new orders within 2 hours", kind: "order_accepted_fast", target: 5, points: 40 },
      { key: "supplier_status_2", title: "Post 2 statuses", kind: "status_posted", target: 2, points: 20 },
      { key: "supplier_products_3", title: "Add 3 new products", kind: "product_added", target: 3, points: 30 },
    ],
    badges: [
      { key: "first_order", title: "First order", rule: { type: "count", kind: "order_accepted", target: 1 } },
      { key: "fast_packer", title: "Fast packer", rule: { type: "count", kind: "order_accepted_fast", target: 10 } },
      { key: "orders_100", title: "100 orders", rule: { type: "count", kind: "order_accepted", target: 100 } },
      { key: "shops_10", title: "10 shops", rule: { type: "count", kind: "shop_supplied", target: 10 } },
    ],
  },
  logistics_partner: {
    levels: [
      { level: 1, name: "New partner", xp: 0 },
      { level: 2, name: "Steady partner", xp: 300 },
      { level: 3, name: "Fast partner", xp: 700 },
      { level: 4, name: "Reliable partner", xp: 1100 },
      { level: 5, name: "Top partner", xp: 1600 },
      { level: 6, name: "Elite partner", xp: 3000 },
    ],
    challenges: [
      { key: "partner_on_time_10", title: "Deliver 10 on time", kind: "delivery_on_time", target: 10, points: 60 },
      { key: "partner_fast_accept", title: "Accept jobs within 30 minutes", kind: "job_accepted_fast", target: 6, points: 40 },
      { key: "partner_status_1", title: "Post a status", kind: "status_posted", target: 1, points: 15 },
    ],
    badges: [
      { key: "verified", title: "Verified", rule: { type: "verified" } },
      { key: "on_time", title: "On time", rule: { type: "count", kind: "delivery_on_time", target: 25 } },
      { key: "streak_5", title: "5-day streak", rule: { type: "streak", target: 5 } },
      { key: "deliveries_500", title: "500 deliveries", rule: { type: "count", kind: "delivery_done", target: 500 } },
    ],
  },
};

export function asRewardRole(role: unknown): RewardRole | null {
  return typeof role === "string" && (REWARD_ROLES as readonly string[]).includes(role) ? (role as RewardRole) : null;
}

export function catalogFor(role: RewardRole): RoleCatalog {
  return CATALOGS[role];
}

/** The level for a lifetime XP total, the next one's name and the XP it starts at (null at the top). */
export function levelFor(role: RewardRole, xp: number): { level: number; levelName: string; nextLevelName: string | null; xpForNext: number | null } {
  const levels = CATALOGS[role].levels;
  let index = 0;
  for (let i = 0; i < levels.length; i++) if (xp >= levels[i].xp) index = i;
  const next = levels[index + 1] ?? null;
  return { level: levels[index].level, levelName: levels[index].name, nextLevelName: next?.name ?? null, xpForNext: next?.xp ?? null };
}

// ─── Lagos days and weeks ────────────────────────────────────────────────────
// Africa/Lagos is UTC+1 all year (no daylight saving), so a fixed offset is exact.

const LAGOS_OFFSET_MS = 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** The Lagos calendar day, "YYYY-MM-DD". */
export function lagosDay(at: Date): string {
  return new Date(at.getTime() + LAGOS_OFFSET_MS).toISOString().slice(0, 10);
}

/** Midnight in Lagos at the start of that Lagos day. */
export function lagosDayStart(at: Date): Date {
  const shifted = new Date(at.getTime() + LAGOS_OFFSET_MS);
  return new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()) - LAGOS_OFFSET_MS);
}

/** Monday 00:00 Africa/Lagos of the week `at` is in (challenges reset then). */
export function weekStart(at: Date): Date {
  const shifted = new Date(at.getTime() + LAGOS_OFFSET_MS);
  const sinceMonday = (shifted.getUTCDay() + 6) % 7;
  return new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate() - sinceMonday) - LAGOS_OFFSET_MS);
}

/** When this week's challenges reset: next Monday 00:00 Lagos. */
export function weekResetsAt(at: Date): Date {
  return new Date(weekStart(at).getTime() + 7 * DAY_MS);
}

function dayBefore(day: string): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) - DAY_MS).toISOString().slice(0, 10);
}

// ─── Streak ──────────────────────────────────────────────────────────────────

/** The streak after a rewarded action on `today` ("YYYY-MM-DD", Lagos). Same day: unchanged; next day: +1; later: 1. */
export function updateStreak(account: { streak: number; lastActiveDay: string | null }, today: string): { streak: number; lastActiveDay: string } {
  const last = account.lastActiveDay;
  if (last === today) return { streak: Math.max(1, account.streak), lastActiveDay: today };
  // An event stamped earlier than the last active day (a late webhook) doesn't move the streak.
  if (last && last > today) return { streak: Math.max(1, account.streak), lastActiveDay: last };
  if (last && dayBefore(today) === last) return { streak: account.streak + 1, lastActiveDay: today };
  return { streak: 1, lastActiveDay: today };
}

/** The streak to show today: it still counts until the end of the day after the last active day, then it's 0. */
export function currentStreak(account: { streak: number; lastActiveDay: string | null } | null, today: string): number {
  if (!account?.lastActiveDay) return 0;
  if (account.lastActiveDay === today || account.lastActiveDay === dayBefore(today) || account.lastActiveDay > today) return account.streak;
  return 0;
}

// ─── Event rules ─────────────────────────────────────────────────────────────

export const FAST_SUPPLIER_ACCEPT_MS = 2 * 60 * 60 * 1000;
export const FAST_JOB_ACCEPT_MS = 30 * 60 * 1000;
export const FAST_CHAT_REPLY_MS = 60 * 60 * 1000;

/** True when `later` came less than `withinMs` after `earlier`. */
export function within(earlier: Date | null | undefined, later: Date | null | undefined, withinMs: number): boolean {
  if (!earlier || !later) return false;
  const gap = later.getTime() - earlier.getTime();
  return gap >= 0 && gap < withinMs;
}

/**
 * A delivery is on time when it arrived by the end of the promised Lagos day, or (no promised date) with no failed
 * attempt on the way.
 */
export function deliveredOnTime(job: { estimatedDelivery: Date | null; deliveredAt: Date | null; failedAttempts?: number | null }): boolean {
  if (!job.deliveredAt) return false;
  if (job.estimatedDelivery) return job.deliveredAt.getTime() < lagosDayStart(job.estimatedDelivery).getTime() + DAY_MS;
  return !job.failedAttempts;
}

// ─── Challenges, badges and the swap ─────────────────────────────────────────

export function challengeView(def: ChallengeDef, count: number, claimed: boolean) {
  const progress = Math.min(count, def.target);
  return { key: def.key, title: def.title, progress, target: def.target, points: def.points, claimable: !claimed && count >= def.target, claimed };
}

export function badgeEarned(rule: BadgeRule, stats: { counts: Partial<Record<RewardKind, number>>; streak: number; verified: boolean }): boolean {
  if (rule.type === "verified") return stats.verified;
  if (rule.type === "streak") return stats.streak >= rule.target;
  return (stats.counts[rule.kind] ?? 0) >= rule.target;
}

/** 100 points become 20 free AI credits. Points are never cash. */
export const SWAP = { points: 100, credits: 20 } as const;

export function canSwap(points: number): boolean {
  return points >= SWAP.points;
}
