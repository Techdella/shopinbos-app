// Domains sellers buy through Shopinbos (Vercel's registrar, paid by the seller through Paystack first): the naira
// price, the one-domain-per-store rule, which renewal reminders are due, when to try the saved card, and when an
// unrenewed domain is taken off the store. No imports, so tests/domain-billing.test.mjs runs it directly; the
// server side is src/lib/domains/billing.server.ts.

export const DOMAIN_PURCHASE_STATUSES = [
  "pending_payment", // Paystack checkout started, not paid yet
  "payment_failed", // a saved-card renewal charge was declined (no money taken)
  "paid", // payment verified, not yet sent to the registrar
  "buying", // claimed by one caller; the registrar order is placed or being placed
  "bought", // the registrar order completed
  "failed", // the registrar refused; the refund is being sent (stays here only if refunding crashed)
  "refunded",
  "refund_failed", // the registrar refused and the refund failed too: the team must refund by hand
  "expired", // not renewed in time; taken off the store
] as const;
export type DomainPurchaseStatus = (typeof DOMAIN_PURCHASE_STATUSES)[number];
export type DomainPurchaseKind = "new" | "renewal";

/** Statuses the admin page highlights: money was taken and no domain came of it. */
export const NEEDS_ATTENTION_STATUSES: readonly string[] = ["failed", "refund_failed"];

export const DEFAULT_USD_NGN_RATE = 1650;
export const DEFAULT_MARKUP_NGN = 3000;
export const DEFAULT_MAX_USD = 20;
export const ROUND_TO_NGN = 500;
export const REMINDER_DAYS = [30, 7, 1] as const;
export const AUTO_CHARGE_DAYS = 7;
export const GRACE_DAYS = 3;
export const TRANSFER_LOCK_DAYS = 60;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface DomainPricingConfig {
  usdNgnRate: number;
  markupNgn: number;
  maxUsd: number;
}

function positive(value: string | undefined, fallback: number) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function nonNegative(value: string | undefined, fallback: number) {
  if (value === undefined || value.trim() === "") return fallback;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

/** DOMAIN_USD_NGN_RATE (default 1650), DOMAIN_MARKUP_NGN (default 3000), DOMAIN_PURCHASE_MAX_USD (default 20). */
export function domainPricingConfig(env: Record<string, string | undefined>): DomainPricingConfig {
  return {
    usdNgnRate: positive(env.DOMAIN_USD_NGN_RATE, DEFAULT_USD_NGN_RATE),
    markupNgn: nonNegative(env.DOMAIN_MARKUP_NGN, DEFAULT_MARKUP_NGN),
    maxUsd: positive(env.DOMAIN_PURCHASE_MAX_USD, DEFAULT_MAX_USD),
  };
}

/** What the seller pays (naira): USD cost × rate + markup, rounded up to the next ₦500. Null for a missing price. */
export function nairaPriceForUsd(usd: number | null | undefined, config: Pick<DomainPricingConfig, "usdNgnRate" | "markupNgn">): number | null {
  if (typeof usd !== "number" || !Number.isFinite(usd) || usd <= 0) return null;
  // Work in kobo-free whole naira; the small epsilon keeps 10 × 1650 = 16500 from becoming 16500.0000001 → 17000.
  const raw = usd * config.usdNgnRate + config.markupNgn;
  return Math.ceil(raw / ROUND_TO_NGN - 1e-9) * ROUND_TO_NGN;
}

/** Whether we sell this domain at all (DOMAIN_PURCHASE_MAX_USD guard). */
export function withinMaxUsd(usd: number | null | undefined, config: Pick<DomainPricingConfig, "maxUsd">) {
  return typeof usd === "number" && Number.isFinite(usd) && usd > 0 && usd <= config.maxUsd;
}

/** The most we let the registrar charge us when buying after payment: the quoted cost plus 3% (at least $0.50). */
export function maxBuyUsd(quotedUsd: number) {
  return Math.round((quotedUsd + Math.max(0.5, quotedUsd * 0.03)) * 100) / 100;
}

export interface PurchaseLike {
  id?: string;
  storeId?: string;
  domain: string;
  kind: string;
  status: string;
  expiresAt?: Date | string | null;
  createdAt?: Date | string | null;
}

/**
 * One domain per store: a bought domain, or a purchase that is paid and being bought, uses the store's one.
 * Unpaid checkouts, declined cards, failed, refunded and expired purchases don't count (a second checkout that
 * gets paid anyway is refunded before anything is bought).
 */
export function countsTowardStoreLimit(row: Pick<PurchaseLike, "kind" | "status">) {
  return row.kind === "new" && (row.status === "bought" || row.status === "paid" || row.status === "buying");
}

export function storeHasDomainPurchase(rows: readonly Pick<PurchaseLike, "kind" | "status" | "id">[], exceptId?: string) {
  return rows.some((row) => row.id !== exceptId && countsTowardStoreLimit(row));
}

function time(value: Date | string | null | undefined) {
  if (!value) return null;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

/** For each domain, its bought purchase that runs longest (the original or its latest renewal). */
export function latestBoughtPerDomain<T extends PurchaseLike>(rows: readonly T[]): T[] {
  const best = new Map<string, T>();
  for (const row of rows) {
    if (row.status !== "bought") continue;
    const key = `${row.storeId ?? ""}|${row.domain.toLowerCase()}`;
    const current = best.get(key);
    if (!current || (time(row.expiresAt) ?? 0) > (time(current.expiresAt) ?? 0)) best.set(key, row);
  }
  return [...best.values()];
}

/** Whole days left until expiry, rounded up (23 hours left = 1 day). Negative once expired. */
export function daysLeft(expiresAt: Date | string, now: Date) {
  return Math.ceil(((time(expiresAt) ?? 0) - now.getTime()) / DAY_MS);
}

export type ReminderKey = "r30" | "r7" | "r1";

/**
 * The renewal reminder to send now, if any. Only the nearest one is sent (a cron that missed days doesn't send
 * "30 days" and "7 days" together), and the earlier ones are recorded as sent so they never go out late.
 */
export function dueReminder(expiresAt: Date | string, sent: readonly string[], now: Date): { send: ReminderKey | null; markSent: ReminderKey[] } {
  const left = daysLeft(expiresAt, now);
  if (left <= 0) return { send: null, markSent: [] };
  const reached = REMINDER_DAYS.filter((days) => left <= days).map((days) => `r${days}` as ReminderKey);
  if (!reached.length) return { send: null, markSent: [] };
  const nearest = reached[reached.length - 1]!;
  const markSent = reached.filter((key) => !sent.includes(key));
  return { send: sent.includes(nearest) ? null : nearest, markSent };
}

/** Try the saved card once, 7 days (or fewer) before expiry, while the domain is still active. */
export function shouldAutoCharge(expiresAt: Date | string, sent: readonly string[], now: Date, hasReusableCard: boolean) {
  const left = daysLeft(expiresAt, now);
  return hasReusableCard && left > 0 && left <= AUTO_CHARGE_DAYS && !sent.includes("charge");
}

/** active: not expired; grace: expired less than 3 days ago (renewing still works); expire: take it off the store. */
export function expiryDecision(expiresAt: Date | string, now: Date, graceDays = GRACE_DAYS): "active" | "grace" | "expire" {
  const ends = time(expiresAt) ?? 0;
  if (now.getTime() < ends) return "active";
  if (now.getTime() < ends + graceDays * DAY_MS) return "grace";
  return "expire";
}

/** Registrars lock a new domain for 60 days: it can't move to another company until then. */
export function transferLock(boughtAt: Date | string, now: Date) {
  const availableAt = new Date((time(boughtAt) ?? now.getTime()) + TRANSFER_LOCK_DAYS * DAY_MS);
  return { locked: now.getTime() < availableAt.getTime(), availableAt };
}

/** One year on: renewals extend from the current expiry, a new domain from today. */
export function addOneYear(from: Date | string) {
  const date = new Date(time(from) ?? Date.now());
  date.setUTCFullYear(date.getUTCFullYear() + 1);
  return date;
}

/** Keeps only what Paystack returns as a card authorization (for a renewal charge later), plus the customer email. */
export function savedAuthorization(authorization: unknown, email: string | null | undefined) {
  if (!authorization || typeof authorization !== "object") return null;
  const source = authorization as Record<string, unknown>;
  const code = typeof source.authorization_code === "string" ? source.authorization_code : null;
  if (!code) return null;
  const text = (value: unknown) => (typeof value === "string" ? value : null);
  return {
    authorization_code: code,
    reusable: source.reusable === true,
    last4: text(source.last4),
    brand: text(source.brand),
    exp_month: text(source.exp_month),
    exp_year: text(source.exp_year),
    email: email ? email.toLowerCase() : null,
  };
}

export type SavedAuthorization = NonNullable<ReturnType<typeof savedAuthorization>>;

export function readSavedAuthorization(value: unknown): SavedAuthorization | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Record<string, unknown>;
  if (typeof source.authorization_code !== "string" || !source.authorization_code) return null;
  return savedAuthorization(source, typeof source.email === "string" ? source.email : null);
}

export function remindersOf(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}
