// Product ajo (pilot "ajo"): a seller runs a group of N members for one product over N weeks. Every week each
// member pays item price ÷ N (rounded up to the naira), so each week's round pays for one item, and that week's
// collector gets theirs. Pure rules (no imports) for the server, the apps and tests/ajo.test.mjs.
//
// Every contribution is its own Paystack payment split straight to the seller's own bank (Shopinbos keeps only its
// fee, in the same split): Shopinbos never holds anyone's money. Weeks are Lagos days (UTC+1): week 1 is due on the
// start day (paid when joining), week w by the end of the Lagos day 7×(w−1) days after the start.

export const AJO_FEATURE = "ajo";
export const AJO_MIN_SIZE = 2;
export const AJO_MAX_SIZE = 20;
export const AJO_GRACE_DAYS = 2;
export const AJO_REF_PREFIX = "AJO-";
/** Each contribution must leave at least ₦100 for the seller after Shopinbos's fee. */
export const AJO_MIN_WEEKLY_KOBO = 20_000;
export const AJO_RULES_MAX = 2000;

export const AJO_GROUP_STATUSES = ["forming", "running", "completed", "cancelled"] as const;
export type AjoGroupStatus = (typeof AJO_GROUP_STATUSES)[number];
/** pending: started joining, first payment not in yet. */
export const AJO_MEMBER_STATUSES = ["pending", "active", "collected", "removed", "left"] as const;
export type AjoMemberStatus = (typeof AJO_MEMBER_STATUSES)[number];

export const DEFAULT_AJO_RULES = [
  "1. Pay your contribution every week by the due day. You get a reminder the day before.",
  "2. If you miss a payment, you have 2 days to pay. After that you are removed from the group and lose your turn.",
  "3. What happens to the weeks you already paid if you are removed is decided by the seller, as written here.",
  "4. New members (first time buying from this shop) collect later in the order.",
  "5. The collection order is drawn at random when the group is full. The seller may change it before the start.",
  "6. Each week, once everyone has paid, the seller sends the item to that week's collector.",
].join("\n");

const LAGOS_OFFSET_MS = 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

function lagosDay(date: Date | number): string {
  return new Date(new Date(date).getTime() + LAGOS_OFFSET_MS).toISOString().slice(0, 10);
}

function addDays(day: string, days: number): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d! + days)).toISOString().slice(0, 10);
}

function endOfLagosDay(day: string): Date {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!, 23, 59, 59, 999) - LAGOS_OFFSET_MS);
}

export function isDayKey(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y!, m! - 1, d!));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m! - 1 && date.getUTCDate() === d;
}

// ─── Amounts ───────────────────────────────────────────────────────────────────

/** Each member's weekly contribution: the item price ÷ members, rounded up to the naira. */
export function ajoWeeklyKobo(itemPriceKobo: number, size: number): number {
  if (!(itemPriceKobo > 0) || !Number.isInteger(size) || size < 1) return 0;
  return Math.ceil(Math.round(itemPriceKobo) / size / 100) * 100;
}

/** What a full week collects (≥ the item price because of the rounding up). */
export function ajoWeekTotalKobo(weeklyKobo: number, size: number): number {
  return Math.round(weeklyKobo) * size;
}

/** The rules as saved: trimmed, at most 2000 characters; empty → the default rules. */
export function cleanAjoRules(value: unknown): string {
  const text = typeof value === "string" ? value.replace(/\r\n/g, "\n").trim().slice(0, AJO_RULES_MAX) : "";
  return text || DEFAULT_AJO_RULES;
}

/** Why this group can't be created, or null. `today` is the Lagos day it's created on. */
export function ajoProblem(input: { itemPriceKobo: number; size: number; depositKobo: number; startDay: string; today: string }): string | null {
  if (!Number.isInteger(input.size) || input.size < AJO_MIN_SIZE || input.size > AJO_MAX_SIZE) return `A group has ${AJO_MIN_SIZE} to ${AJO_MAX_SIZE} members.`;
  if (!(input.itemPriceKobo > 0)) return "This product has no price.";
  if (ajoWeeklyKobo(input.itemPriceKobo, input.size) < AJO_MIN_WEEKLY_KOBO) return `Each weekly payment must be at least ₦${AJO_MIN_WEEKLY_KOBO / 100}. Choose fewer members.`;
  if (!(input.depositKobo >= 0) || !Number.isInteger(input.depositKobo)) return "Enter a joining deposit of ₦0 or more.";
  if (input.depositKobo > input.itemPriceKobo) return "The joining deposit can't be more than the item price.";
  if (!isDayKey(input.startDay)) return "Choose a start date.";
  if (input.startDay < input.today) return "The start date can't be in the past.";
  if (input.startDay > addDays(input.today, 90)) return "Start within the next 90 days.";
  return null;
}

// ─── Weeks ─────────────────────────────────────────────────────────────────────

/** When week `w` (1-based) is due: the end of the Lagos day 7×(w−1) days after the start day. */
export function ajoWeekDueAt(startDay: string, week: number): Date {
  return endOfLagosDay(addDays(startDay, 7 * (Math.max(1, week) - 1)));
}

/** The week the group is in (1 from the start day; 0 before it; capped at `size`). */
export function currentAjoWeek(startDay: string, size: number, now: Date | number): number {
  const today = lagosDay(now);
  if (today < startDay) return 0;
  const [ys, ms, ds] = startDay.split("-").map(Number);
  const [yt, mt, dt] = today.split("-").map(Number);
  const days = Math.round((Date.UTC(yt!, mt! - 1, dt!) - Date.UTC(ys!, ms! - 1, ds!)) / DAY_MS);
  return Math.min(size, Math.floor(days / 7) + 1);
}

/** Every week's due date. */
export function ajoSchedule(startDay: string, size: number): Array<{ week: number; dueAt: Date; day: string }> {
  return Array.from({ length: size }, (_, index) => ({ week: index + 1, dueAt: ajoWeekDueAt(startDay, index + 1), day: addDays(startDay, 7 * index) }));
}

/** The moment a member who hasn't paid week `week` is removed (2 days after its due date). */
export function ajoRemoveAt(startDay: string, week: number, graceDays = AJO_GRACE_DAYS): Date {
  return new Date(ajoWeekDueAt(startDay, week).getTime() + graceDays * DAY_MS);
}

/** Remind about week `week` now? On the Lagos day before it's due, 8am–9pm, once (`remindedWeek` = last reminded). */
export function ajoReminderDue(now: Date | number, startDay: string, week: number, remindedWeek: number): boolean {
  if (remindedWeek >= week) return false;
  const hour = new Date(new Date(now).getTime() + LAGOS_OFFSET_MS).getUTCHours();
  if (hour < 8 || hour >= 21) return false;
  return lagosDay(now) === addDays(lagosDay(ajoWeekDueAt(startDay, week)), -1);
}

/** Charge a saved card for week `week` now? From its due day (8am–9pm) until grace ends, once per week. */
export function ajoAutopayDue(now: Date | number, startDay: string, week: number, triedWeek: number): boolean {
  if (triedWeek >= week) return false;
  const time = new Date(now).getTime();
  const hour = new Date(time + LAGOS_OFFSET_MS).getUTCHours();
  if (hour < 8 || hour >= 21) return false;
  if (time > ajoRemoveAt(startDay, week).getTime()) return false;
  return lagosDay(now) >= addDays(startDay, 7 * (week - 1));
}

// ─── Collection order ──────────────────────────────────────────────────────────

/** A 32-bit hash of a string (FNV-1a), the seed for the draw. */
export function hashSeed(seed: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/** mulberry32: a small deterministic random number generator (same seed → same numbers). */
function randomFrom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The items shuffled with a seed (Fisher–Yates): the same seed always gives the same order. */
export function seededShuffle<T>(items: readonly T[], seed: string): T[] {
  const out = [...items];
  const random = randomFrom(hashSeed(seed));
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/**
 * The collection order, drawn with `seed` (saved, so anyone can re-run the draw and get the same answer): members
 * who bought from this shop before go first, in a random order; new members after them, in a random order. Ties in
 * the input order don't matter: members are sorted by id before shuffling.
 */
export function drawOrder(members: ReadonlyArray<{ id: string; isNew: boolean }>, seed: string): string[] {
  const sorted = [...members].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const returning = seededShuffle(sorted.filter((member) => !member.isNew).map((member) => member.id), `${seed}:returning`);
  const fresh = seededShuffle(sorted.filter((member) => member.isNew).map((member) => member.id), `${seed}:new`);
  return [...returning, ...fresh];
}

/** The seller's own order: accepted only when it's exactly the same members (no one added, dropped or repeated). */
export function manualOrder(current: readonly string[], requested: readonly string[]): string[] | null {
  if (requested.length !== current.length) return null;
  const wanted = new Set(requested);
  if (wanted.size !== requested.length) return null;
  return current.every((id) => wanted.has(id)) ? [...requested] : null;
}

// ─── Each week ─────────────────────────────────────────────────────────────────

export interface AjoMemberFacts {
  id: string;
  status: string;
  position: number | null;
}

/** Members still in the group (paying): active, or already collected (they keep paying until the end). */
export function payingMembers<T extends AjoMemberFacts>(members: readonly T[]): T[] {
  return members.filter((member) => member.status === "active" || member.status === "collected");
}

/** Who has paid week `week` and who hasn't, among the paying members. Complete when nobody is missing. */
export function weekStatus(members: readonly AjoMemberFacts[], paidMemberIds: Iterable<string>): { paid: string[]; missing: string[]; complete: boolean } {
  const paidSet = new Set(paidMemberIds);
  const paying = payingMembers(members);
  const paid = paying.filter((member) => paidSet.has(member.id)).map((member) => member.id);
  const missing = paying.filter((member) => !paidSet.has(member.id)).map((member) => member.id);
  return { paid, missing, complete: paying.length > 0 && missing.length === 0 };
}

/**
 * Who collects next: the first active member (not yet collected, not removed) in the collection order. A removed
 * member loses their turn, so everyone after them moves up. Null when nobody is left to collect.
 */
export function nextCollector(members: readonly AjoMemberFacts[]): string | null {
  const waiting = members
    .filter((member) => member.status === "active" && member.position !== null)
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  return waiting[0]?.id ?? null;
}

/**
 * Can the seller ship this week's item? Only when everyone paying has paid this week, and the week's item hasn't been
 * shipped yet (`shippedWeeks` = the weeks an item went out), and there is someone to collect.
 */
export function canShipWeek(input: { week: number; members: readonly AjoMemberFacts[]; paidMemberIds: Iterable<string>; shippedWeeks: Iterable<number> }): { ok: true; memberId: string } | { ok: false; reason: "not_started" | "not_all_paid" | "already_shipped" | "nobody_left" } {
  if (input.week < 1) return { ok: false, reason: "not_started" };
  if (new Set(input.shippedWeeks).has(input.week)) return { ok: false, reason: "already_shipped" };
  if (!weekStatus(input.members, input.paidMemberIds).complete) return { ok: false, reason: "not_all_paid" };
  const memberId = nextCollector(input.members);
  return memberId ? { ok: true, memberId } : { ok: false, reason: "nobody_left" };
}

/** A running group is finished when nobody is left waiting to collect (everyone collected, or was removed). */
export function groupFinished(members: readonly AjoMemberFacts[]): boolean {
  return members.length > 0 && !nextCollector(members);
}

/** First name only, for the public member list ("Ada O." → "Ada"). */
export function publicFirstName(name: string | null | undefined): string {
  const first = String(name ?? "").trim().split(/\s+/)[0] ?? "";
  return first.slice(0, 24) || "Member";
}
