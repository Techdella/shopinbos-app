// Price promotions (Admin › Pricing › Promotions, /admin/pricing/promotions): a Black Friday or seasonal price drop
// that sets some prices for a while, then switches off by itself. Live promotions override the saved prices in the
// price book (shared/platform-pricing.ts resolvePriceBook); the email, the in-app notice and the push go out when it
// starts (src/lib/pricing/promotions.server.ts). Pure, so pages, the server and tests/price-promotions.test.mjs share it.

import { PRICE_GROUPS, PRICE_SETTINGS, cleanPriceValue, formatPriceValue, isPriceKey, type PriceBook, type PriceGroup, type PriceKey } from "./platform-pricing.ts";

export const PROMO_AUDIENCES = [
  { key: "seller", label: "Sellers" },
  { key: "supplier", label: "Suppliers" },
  { key: "logistics_partner", label: "Delivery partners" },
] as const;
export type PromoAudience = (typeof PROMO_AUDIENCES)[number]["key"];

/** Longest a promotion can run: a season, not a permanent price (change the price itself for that). */
export const MAX_PROMO_DAYS = 92;

export type PromoState = "upcoming" | "live" | "ended" | "cancelled";

export interface PromotionWindow {
  status: string;
  startsAt: Date;
  endsAt: Date;
}

export function promotionState(promo: PromotionWindow, now = new Date()): PromoState {
  if (promo.status === "cancelled") return "cancelled";
  if (now < promo.startsAt) return "upcoming";
  if (now < promo.endsAt) return "live";
  return "ended";
}

/** Valid price overrides from a stored or submitted object (unknown keys and bad values dropped). */
export function readPromoPrices(raw: unknown): Partial<Record<PriceKey, number | string>> {
  const out: Partial<Record<PriceKey, number | string>> = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!isPriceKey(key)) continue;
    const clean = cleanPriceValue(key, value);
    if (clean !== null) out[key] = clean;
  }
  return out;
}

/**
 * The overrides of every live promotion. When two overlap on the same price (only possible for promotions saved
 * before the overlap check, or edited around it), the one that started last wins.
 */
export function livePromotionOverrides(promos: Array<PromotionWindow & { prices: unknown }>, now = new Date()) {
  const live = promos.filter((promo) => promotionState(promo, now) === "live").sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  return Object.assign({}, ...live.map((promo) => readPromoPrices(promo.prices))) as Partial<Record<PriceKey, number | string>>;
}

/** When the live prices next change (a promotion starts or ends), for the price book cache. */
export function nextPromotionBoundary(promos: PromotionWindow[], now = new Date()): Date | null {
  let next: Date | null = null;
  for (const promo of promos) {
    if (promo.status === "cancelled") continue;
    for (const at of [promo.startsAt, promo.endsAt]) if (at > now && (!next || at < next)) next = at;
  }
  return next;
}

export interface PromoInput {
  name: string;
  headline: string;
  message: string | null;
  startsAt: Date;
  endsAt: Date;
  audience: PromoAudience[];
  prices: Partial<Record<PriceKey, number | string>>;
  announceEmail: boolean;
  announceNotice: boolean;
}

/** Checks a promotion; returns the first problem in words an admin understands, or null. */
export function promotionProblem(input: PromoInput, base: PriceBook, now = new Date()): string | null {
  if (!input.name.trim()) return "Give it a name (only admins see it).";
  if (!input.headline.trim()) return "Add the headline sellers see, e.g. “Black Friday: launch your store for ₦5,000”.";
  if (Number.isNaN(input.startsAt.getTime()) || Number.isNaN(input.endsAt.getTime())) return "Pick when it starts and ends.";
  if (input.endsAt <= input.startsAt) return "It has to end after it starts.";
  if (input.endsAt <= now) return "That end time has already passed.";
  if (input.endsAt.getTime() - input.startsAt.getTime() > MAX_PROMO_DAYS * 86_400_000) return `A promotion can run for ${MAX_PROMO_DAYS} days at most. Change the price itself for longer.`;
  if (!input.audience.length) return "Pick who it's for.";
  const keys = Object.keys(input.prices) as PriceKey[];
  if (!keys.length) return "Change at least one price.";
  if (keys.every((key) => input.prices[key] === base[key])) return "Every price is the same as today's. Change at least one.";
  return null;
}

/** Promotions that change one of the same prices at an overlapping time (they can't both run). */
export function overlappingPromotions<T extends PromotionWindow & { id: string; name: string; prices: unknown }>(input: Pick<PromoInput, "startsAt" | "endsAt" | "prices">, others: T[], now = new Date()) {
  const keys = new Set(Object.keys(input.prices));
  return others.filter((other) => {
    const state = promotionState(other, now);
    if (state === "cancelled" || state === "ended") return false;
    if (!(other.startsAt < input.endsAt && input.startsAt < other.endsAt)) return false;
    return Object.keys(readPromoPrices(other.prices)).some((key) => keys.has(key));
  });
}

export interface PromoChange {
  key: PriceKey;
  group: PriceGroup;
  label: string;
  from: string;
  to: string;
  /** "drop" when the new number is lower (a cheaper fee, or fewer credits per pack), "rise", or "change" for choices. */
  direction: "drop" | "rise" | "change";
}

/** What a promotion changes against the normal prices, in display words. */
export function promotionChanges(prices: unknown, base: PriceBook): PromoChange[] {
  const clean = readPromoPrices(prices);
  return (Object.keys(clean) as PriceKey[])
    .filter((key) => clean[key] !== base[key])
    .map((key) => {
      const to = clean[key]!;
      const from = base[key];
      return {
        key,
        group: PRICE_SETTINGS[key].group,
        label: PRICE_SETTINGS[key].label,
        from: formatPriceValue(key, from),
        to: formatPriceValue(key, to),
        direction: typeof to === "number" && typeof from === "number" ? (to < from ? "drop" : "rise") : "change",
      };
    });
}

/** Who a promotion is for by default, from the prices it changes. */
export function suggestedAudience(keys: readonly string[]): PromoAudience[] {
  const out = new Set<PromoAudience>();
  for (const key of keys) {
    if (!isPriceKey(key)) continue;
    const group = PRICE_SETTINGS[key].group;
    if (group === "credits") {
      out.add("seller");
      out.add("supplier");
      out.add("logistics_partner");
    } else if (key === "join.supplier_months") out.add("supplier");
    else if (key === "join.logistics_months") out.add("logistics_partner");
    else if (group === "delivery" || key === "boosts.logistics_state_week") out.add("logistics_partner");
    else if (group === "supplier_fee" || key === "boosts.supplier_week" || key === "boosts.product_week") out.add("supplier");
    else out.add("seller");
  }
  return [...out];
}

/** "Ad campaigns, setup fee: ₦20,000 → ₦15,000" lines, for the email and the notice. */
export function changeLines(changes: PromoChange[]) {
  return changes.map((change) => `${PRICE_GROUPS[change.group].title}, ${change.label.charAt(0).toLowerCase()}${change.label.slice(1)}: ${change.from} → ${change.to}`);
}

const lagos = (date: Date) => new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Lagos" }).format(date);

/** "Until 1 Dec 2026, 23:59" (Lagos time). */
export function untilText(endsAt: Date) {
  return `Until ${lagos(endsAt)}`;
}

/** The announcement email's text (simple markdown for product news). */
export function announcementBody(promo: Pick<PromoInput, "headline" | "message" | "startsAt" | "endsAt">, changes: PromoChange[]) {
  return [
    promo.message?.trim() || null,
    changeLines(changes).map((line) => `- ${line}`).join("\n"),
    `From ${lagos(promo.startsAt)} to ${lagos(promo.endsAt)} (Lagos time). Prices go back to normal after that.`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

/** Lagos wall-clock "YYYY-MM-DDTHH:mm" (a datetime-local input) to a Date. Lagos has no daylight saving: +01:00. */
export function fromLagosInput(value: string | null | undefined): Date {
  if (!value || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return new Date(NaN);
  return new Date(`${value}:00+01:00`);
}

/** A Date as a datetime-local value in Lagos time. */
export function toLagosInput(date: Date) {
  return new Date(date.getTime() + 60 * 60_000).toISOString().slice(0, 16);
}
