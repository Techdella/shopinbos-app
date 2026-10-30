// Pay small small (pilot "pay_small_small"): a shopper pays for one product in 4, 6 or 8 weekly parts. Pure rules
// (no imports) shared by the server, the storefront, the apps and tests/pay-small-small.test.mjs.
//
// This is instalments TO THE SELLER, not savings: each part is its own Paystack payment, split at the moment it's
// paid so the seller's share settles straight to the seller's own bank (Shopinbos keeps only its fee, in the same
// split). Shopinbos never holds the money. The order is created (paid) when the last part is in.
//
// Money is in kobo everywhere here. Parts are whole naira: each part is the total divided by the weeks, rounded UP
// to the naira; the last part takes what's left (so it can be a little smaller). Dates are Lagos days (UTC+1, no
// daylight saving): part 1 is paid at sign-up, part k is due by the end of the Lagos day 7×(k−1) days later.

export const PAY_SMALL_FEATURE = "pay_small_small";

export const PAY_SMALL_WEEKS = [4, 6, 8] as const;
export type PlanWeeks = (typeof PAY_SMALL_WEEKS)[number];

/** The refund rule sellers can pick with one tap. */
export const REFUND_PRESET = "Money back within 7 days, minus ₦1,000";
export const REFUND_RULE_MAX = 500;

/** Days after a due date before an unpaid plan counts as defaulted. */
export const GRACE_DAYS = 2;

/** The smallest part we take (a Paystack split needs at least ₦100 for the seller after Shopinbos's fee). */
export const MIN_PART_KOBO = 50_000;

/** Paystack references of the parts start with this (the webhook routes them here). */
export const INSTALMENT_REF_PREFIX = "PSS-";

export const PLAN_STATUSES = ["pending", "active", "completed", "cancelled", "defaulted"] as const;
export type PlanStatus = (typeof PLAN_STATUSES)[number];

/** A plan nobody paid the first part of is cancelled after this long. */
export const PENDING_PLAN_TTL_MS = 24 * 60 * 60 * 1000;

// ─── Amounts ───────────────────────────────────────────────────────────────────

export function isPlanWeeks(value: unknown): value is PlanWeeks {
  return typeof value === "number" && (PAY_SMALL_WEEKS as readonly number[]).includes(value);
}

/** The lengths a seller allows: some of 4, 6, 8 (sorted, no repeats). Null when none is valid. */
export function cleanWeeksList(value: unknown): PlanWeeks[] | null {
  if (!Array.isArray(value)) return null;
  const weeks = [...new Set(value.map(Number).filter(isPlanWeeks))].sort((a, b) => a - b) as PlanWeeks[];
  return weeks.length ? weeks : null;
}

/** The seller's refund rule as saved: trimmed, at most 500 characters; empty → the preset. */
export function cleanRefundRule(value: unknown): string {
  const text = typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, REFUND_RULE_MAX) : "";
  return text || REFUND_PRESET;
}

/**
 * Splits `totalKobo` into `parts` payments of whole naira: each is the total ÷ parts rounded up to the naira, the
 * last takes what's left. Null when that leaves nothing (or less) for the last part, or the input is unusable.
 */
export function splitIntoParts(totalKobo: number, parts: number): number[] | null {
  const total = Math.round(totalKobo);
  if (!Number.isInteger(parts) || parts < 1 || !(total > 0)) return null;
  if (parts === 1) return [total];
  const each = Math.ceil(total / parts / 100) * 100;
  const last = total - each * (parts - 1);
  if (last <= 0) return null;
  return [...Array.from({ length: parts - 1 }, () => each), last];
}

/** Why a plan of this total can't be offered over `weeks` (each part must be at least ₦500), or null. */
export function planProblem(totalKobo: number, weeks: number): string | null {
  if (!isPlanWeeks(weeks)) return "Choose 4, 6 or 8 weeks.";
  const parts = splitIntoParts(totalKobo, weeks);
  if (!parts) return "This price is too small to pay in parts.";
  if (Math.min(...parts) < MIN_PART_KOBO) return `Each part must be at least ₦${MIN_PART_KOBO / 100}. Choose fewer weeks.`;
  return null;
}

/** The weekly amount shown to shoppers: the first part (all parts but the last are the same). */
export function weeklyKobo(totalKobo: number, weeks: number): number | null {
  return splitIntoParts(totalKobo, weeks)?.[0] ?? null;
}

/**
 * Spreads `totalKobo` (e.g. Shopinbos's fee on the whole sale) over the parts in proportion to their amounts, in
 * whole kobo; the last part takes the rounding, so they add up exactly.
 */
export function spreadKobo(totalKobo: number, amounts: readonly number[]): number[] {
  const total = Math.max(0, Math.round(totalKobo));
  const sum = amounts.reduce((acc, amount) => acc + Math.max(0, amount), 0);
  if (!amounts.length) return [];
  if (sum <= 0) return amounts.map((_, index) => (index === amounts.length - 1 ? total : 0));
  const shares = amounts.map((amount) => Math.floor((total * Math.max(0, amount)) / sum));
  shares[shares.length - 1] = total - shares.slice(0, -1).reduce((acc, share) => acc + share, 0);
  return shares;
}

/**
 * Price lock OFF: the parts still to pay follow a new total (the product's price changed). Paid parts stay; what's
 * left is spread over the remaining parts the same way (rounded up to the naira, the last takes the rest). If the
 * new total is at or below what's been paid, every remaining part is 0 (the plan is complete).
 */
export function repriceRemaining(amounts: readonly number[], paidCount: number, newTotalKobo: number): number[] {
  const paid = amounts.slice(0, paidCount);
  const remainingCount = amounts.length - paid.length;
  if (remainingCount <= 0) return [...amounts];
  const left = Math.round(newTotalKobo) - paid.reduce((acc, amount) => acc + amount, 0);
  if (left <= 0) return [...paid, ...Array.from({ length: remainingCount }, () => 0)];
  const rest = splitIntoParts(left, remainingCount) ?? [...Array.from({ length: remainingCount - 1 }, () => 0), left];
  return [...paid, ...rest];
}

// ─── Lagos days ────────────────────────────────────────────────────────────────

const LAGOS_OFFSET_MS = 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** The Lagos calendar day of a moment, "YYYY-MM-DD". */
export function lagosDay(date: Date | number): string {
  return new Date(new Date(date).getTime() + LAGOS_OFFSET_MS).toISOString().slice(0, 10);
}

/** The Lagos hour (0–23) of a moment. */
export function lagosHour(date: Date | number): number {
  return new Date(new Date(date).getTime() + LAGOS_OFFSET_MS).getUTCHours();
}

/** "YYYY-MM-DD" plus `days`. */
export function addDays(day: string, days: number): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d! + days)).toISOString().slice(0, 10);
}

/** The last moment of a Lagos day (23:59:59.999 Lagos = 22:59:59.999 UTC). */
export function endOfLagosDay(day: string): Date {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!, 23, 59, 59, 999) - LAGOS_OFFSET_MS);
}

/** Whole Lagos days from `a` to `b` (b − a). */
export function daysBetween(a: string, b: string): number {
  const toUtc = (day: string) => {
    const [y, m, d] = day.split("-").map(Number);
    return Date.UTC(y!, m! - 1, d!);
  };
  return Math.round((toUtc(b) - toUtc(a)) / DAY_MS);
}

/** When part `n` (1-based) is due: the end of the Lagos day 7×(n−1) days after the plan started. */
export function partDueAt(startedAt: Date | number, n: number): Date {
  return endOfLagosDay(addDays(lagosDay(startedAt), 7 * (Math.max(1, n) - 1)));
}

/** Every part's due date (part 1 is the sign-up day). */
export function planSchedule(startedAt: Date | number, weeks: number): Date[] {
  return Array.from({ length: weeks }, (_, index) => partDueAt(startedAt, index + 1));
}

/** The moment a missed part makes the plan defaulted: GRACE_DAYS after its due date. */
export function graceEndsAt(dueAt: Date | number, graceDays = GRACE_DAYS): Date {
  return new Date(new Date(dueAt).getTime() + graceDays * DAY_MS);
}

export function pastGrace(now: Date | number, dueAt: Date | number, graceDays = GRACE_DAYS): boolean {
  return new Date(now).getTime() > graceEndsAt(dueAt, graceDays).getTime();
}

/** Messages and card charges go out between 8am and 9pm Lagos time. */
export function sendingHours(now: Date | number): boolean {
  const hour = lagosHour(now);
  return hour >= 8 && hour < 21;
}

/**
 * Remind about part `n` now? On the Lagos day before it's due, in sending hours, once (`remindedN` is the last part
 * reminded).
 */
export function reminderDue(now: Date | number, dueAt: Date | number, n: number, remindedN: number): boolean {
  if (remindedN >= n || !sendingHours(now)) return false;
  return lagosDay(now) === addDays(lagosDay(dueAt), -1);
}

/**
 * Charge the saved card for part `n` now? From the due day (sending hours) until the grace period ends, once per
 * part (`triedN` is the last part tried).
 */
export function autopayDue(now: Date | number, dueAt: Date | number, n: number, triedN: number): boolean {
  if (triedN >= n || !sendingHours(now) || pastGrace(now, dueAt)) return false;
  return lagosDay(now) >= lagosDay(dueAt);
}

// ─── Progress ─────────────────────────────────────────────────────────────────

export interface PlanFacts {
  weeks: number;
  paidCount: number;
  paidKobo: number;
  totalKobo: number;
  amountsKobo: readonly number[];
  startedAt: Date | string | null;
}

/** 0–100, by money paid. */
export function planPercent(plan: Pick<PlanFacts, "paidKobo" | "totalKobo">): number {
  if (!(plan.totalKobo > 0)) return 0;
  return Math.max(0, Math.min(100, Math.floor((plan.paidKobo / plan.totalKobo) * 100)));
}

/** The next part's number and amount, or null when every part is paid. */
export function nextPart(plan: Pick<PlanFacts, "weeks" | "paidCount" | "amountsKobo">): { n: number; amountKobo: number } | null {
  if (plan.paidCount >= plan.weeks) return null;
  const amount = plan.amountsKobo[plan.paidCount];
  return amount === undefined ? null : { n: plan.paidCount + 1, amountKobo: amount };
}

/** When the next part is due (null when done or not started). */
export function nextDueAt(plan: Pick<PlanFacts, "weeks" | "paidCount" | "startedAt">): Date | null {
  if (!plan.startedAt || plan.paidCount >= plan.weeks) return null;
  return partDueAt(new Date(plan.startedAt), plan.paidCount + 1);
}

/**
 * What a confirmed payment of part `n` does to a plan: the new counts, and whether it's now complete. Null when the
 * payment isn't the next part (already paid, or out of order): the caller records nothing.
 */
export function applyPartPaid(plan: Pick<PlanFacts, "weeks" | "paidCount" | "paidKobo">, n: number, amountKobo: number): { paidCount: number; paidKobo: number; completed: boolean } | null {
  if (n !== plan.paidCount + 1 || n > plan.weeks) return null;
  const paidCount = plan.paidCount + 1;
  return { paidCount, paidKobo: plan.paidKobo + Math.round(amountKobo), completed: paidCount >= plan.weeks };
}

/** "Pay automatically each week" is only kept when Paystack says the card can be charged again. */
export function canAutopay(authorization: { reusable?: unknown; authorization_code?: unknown } | null | undefined): boolean {
  return Boolean(authorization && authorization.reusable === true && typeof authorization.authorization_code === "string" && authorization.authorization_code);
}
