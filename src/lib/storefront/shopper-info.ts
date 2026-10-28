// What a shopper sees around the products on a public storefront: the announcement bar, delivery promises,
// pay-on-delivery badge, WhatsApp help, collections and real review highlights. Everything here is derived
// from the seller's own settings (shipping zones, payment methods, live chat), never invented.
//
// Pure (no imports), so the storefront, the product page and the behaviour tests all agree.

export interface ShopperDeliveryZone {
  name: string;
  regions: string[];
  /** Cheapest standard fee for a small order; null when the zone has no priced rate. */
  fee: number | null;
  /** Free delivery from this order value (naira); null when the zone never delivers free. */
  freeOver: number | null;
  /** Always free in this zone. */
  alwaysFree: boolean;
  /** Seller-entered estimate, e.g. "1-2 days". */
  estimatedDays: string | null;
  pickupOnly: boolean;
}

export interface ShopperReviewHighlight {
  id: string;
  buyerName: string;
  rating: number;
  body: string;
  productName: string | null;
}

export interface ShopperCollection {
  id: string;
  name: string;
  slug: string;
  imageUrl: string | null;
  productIds: string[];
}

export interface StorefrontShopperInfo {
  /** Derived announcement ("Free delivery in Lekki over ₦40,000 · Pay on delivery available"), or null to hide. */
  announcement: string | null;
  delivery: ShopperDeliveryZone[];
  /** The store's flat delivery fee when it has no zones (brandSettings.shippingConfig.flatRate). */
  flatRate: number | null;
  payOnDelivery: boolean;
  /** Highest order total for pay on delivery; null means no cap. */
  payOnDeliveryLimit: number | null;
  /** Buyer-facing labels for the footer ("Card", "Transfer", "Pay on delivery"). */
  paymentLabels: string[];
  /** Digits only, international format without "+", ready for wa.me. */
  whatsappNumber: string | null;
  collections: ShopperCollection[];
  rating: { average: number; count: number } | null;
  reviews: ShopperReviewHighlight[];
}

export const EMPTY_SHOPPER_INFO: StorefrontShopperInfo = {
  announcement: null,
  delivery: [],
  flatRate: null,
  payOnDelivery: false,
  payOnDeliveryLimit: null,
  paymentLabels: [],
  whatsappNumber: null,
  collections: [],
  rating: null,
  reviews: [],
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function formatNaira(amount: number) {
  return `₦${Math.round(amount).toLocaleString("en-NG")}`;
}

/** Money in the store currency, falling back to a plain code when Intl does not know it. */
export function formatStoreMoney(amount: number, currency = "NGN") {
  if (currency === "NGN") return formatNaira(amount);
  try {
    return new Intl.NumberFormat("en-NG", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
  } catch {
    return `${currency} ${Math.round(amount).toLocaleString("en-NG")}`;
  }
}

/** Same rule as checkout: a zone whose name and rate names all say pickup/collect has no rider. */
function isPickupOnly(name: string, rates: unknown[]) {
  const names = [name, ...rates.map((rate) => record(rate).name)].filter((entry): entry is string => typeof entry === "string");
  return names.length > 0 && names.every((entry) => /pick\s*-?\s*up|collect/i.test(entry));
}

export interface RawShippingZone {
  name: string;
  type?: string | null;
  regions: string[];
  rates: unknown;
}

/** Summarises active shipping zones (already in checkout order) into what a shopper needs to know. */
export function summariseDeliveryZones(zones: RawShippingZone[]): ShopperDeliveryZone[] {
  return zones.map((zone) => {
    const rates = Array.isArray(zone.rates) ? zone.rates.map(record) : [];
    const priced = rates
      .map((rate) => ({ min: num(rate.minValue) ?? num(rate.min) ?? 0, price: num(rate.price), days: typeof rate.estimatedDays === "string" ? rate.estimatedDays.trim() : "" }))
      .filter((rate) => rate.price !== null) as Array<{ min: number; price: number; days: string }>;
    const base = priced.filter((rate) => rate.min <= 0);
    const paid = (base.length ? base : priced).filter((rate) => rate.price > 0);
    const fee = paid.length ? Math.min(...paid.map((rate) => rate.price)) : null;
    const freeTiers = priced.filter((rate) => rate.price === 0 && rate.min > 0);
    const alwaysFree = zone.type === "free_shipping" || (priced.length > 0 && priced.every((rate) => rate.price === 0));
    const days = priced.find((rate) => rate.days)?.days ?? null;
    return {
      name: zone.name,
      regions: zone.regions,
      fee: alwaysFree ? 0 : fee,
      freeOver: alwaysFree ? null : freeTiers.length ? Math.min(...freeTiers.map((rate) => rate.min)) : null,
      alwaysFree,
      estimatedDays: days,
      pickupOnly: isPickupOnly(zone.name, Array.isArray(zone.rates) ? zone.rates : []),
    };
  });
}

/** "Lekki" when the zone covers one place, otherwise the zone name the seller chose. */
export function zonePlace(zone: Pick<ShopperDeliveryZone, "name" | "regions">) {
  return zone.regions.length === 1 ? zone.regions[0]! : zone.name;
}

/** The free-delivery promise to lead with: the lowest threshold any delivering zone offers. */
export function freeDeliveryPromise(zones: ShopperDeliveryZone[]) {
  const delivering = zones.filter((zone) => !zone.pickupOnly);
  const always = delivering.find((zone) => zone.alwaysFree && zone.regions.length > 0);
  if (always) return `Free delivery in ${zonePlace(always)}`;
  const tiers = delivering.filter((zone) => zone.freeOver !== null).sort((a, b) => a.freeOver! - b.freeOver!);
  const best = tiers[0];
  if (!best) return delivering.some((zone) => zone.alwaysFree) ? "Free delivery" : null;
  const everywhere = best.regions.length === 0;
  return `Free delivery${everywhere ? "" : ` in ${zonePlace(best)}`} over ${formatNaira(best.freeOver!)}`;
}

/** Order value above which delivery is free wherever the shopper lives; null unless every delivering zone offers it. */
export function freeDeliveryEverywhereOver(zones: ShopperDeliveryZone[]) {
  const delivering = zones.filter((zone) => !zone.pickupOnly);
  if (!delivering.length || !delivering.every((zone) => zone.alwaysFree || zone.freeOver !== null)) return null;
  const thresholds = delivering.map((zone) => (zone.alwaysFree ? 0 : zone.freeOver!));
  const max = Math.max(...thresholds);
  return max > 0 ? max : null;
}

/** Buyer-facing announcement built only from settings the seller saved. Null hides the bar. */
export function deriveAnnouncement(zones: ShopperDeliveryZone[], payOnDelivery: boolean) {
  const parts = [freeDeliveryPromise(zones), payOnDelivery ? "Pay on delivery available" : null].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}

/** Seller's saved payment choices; pay on delivery only counts when they explicitly turned it on. */
export function readPaymentChoices(brandSettings: unknown) {
  const config = record(record(brandSettings).paymentConfig);
  const methods = record(config.methods);
  const on = (key: string) => methods[key] === true;
  const limit = config.codLimit;
  const codLimit = limit === null ? null : typeof limit === "number" && Number.isFinite(limit) ? (limit > 0 ? limit : null) : 50_000;
  // Korapay is a card (and bank) checkout too, so it reads as "Card"; USSD only comes with Paystack.
  const labels = [on("card") || on("korapay") ? "Card" : null, on("transfer") ? "Transfer" : null, on("card") ? "USSD" : null, on("cod") ? "Pay on delivery" : null].filter(
    (entry): entry is string => Boolean(entry),
  );
  return { payOnDelivery: on("cod"), payOnDeliveryLimit: on("cod") ? codLimit : null, labels };
}

/** "+234 803 412 7790" / "08034127790" → "2348034127790"; null when it cannot be a phone number. */
export function whatsappDigits(raw: unknown, defaultDial = "234") {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  let digits = trimmed.replace(/\D/g, "");
  if (!trimmed.startsWith("+") && digits.startsWith("0")) digits = `${defaultDial}${digits.slice(1)}`;
  return digits.length >= 8 && digits.length <= 15 ? digits : null;
}

export function whatsappLink(digits: string, message: string) {
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

/** Weighted store rating from per-product review stats. */
export function storeRating(products: Array<{ avgRating?: number | null; reviewCount?: number | null }>) {
  let count = 0;
  let sum = 0;
  for (const product of products) {
    const n = product.reviewCount ?? 0;
    const avg = product.avgRating ?? 0;
    if (n > 0 && avg > 0) {
      count += n;
      sum += avg * n;
    }
  }
  return count > 0 ? { average: Math.round((sum / count) * 10) / 10, count } : null;
}

/** The seller card on the product page: who sells it, from where, where they deliver, and their WhatsApp. */
export interface StoreSellerCard {
  name: string;
  /** "Lekki, Lagos · delivers nationwide"; null when the shop has said neither where it is nor where it delivers. */
  line: string | null;
  /** Digits for wa.me, or null. */
  whatsappNumber: string | null;
  /** Checkout offers the delivery partners' doorstep and pickup point options. */
  partnerDelivery: boolean;
  /**
   * The product page's trust lines (shared/storefront-trust.ts): verified supplier, verified delivery and
   * paid-at-checkout protection, each only when true. Never names the supplier (blind dropship).
   */
  trust?: import("../../../shared/storefront-trust.ts").StorefrontTrust | null;
}

/**
 * Where a shop delivers, from its delivery settings (sellArea / sellStates): "delivers nationwide", "delivers
 * within Lagos", "delivers within Lagos, Ogun and Oyo", or "delivers within Lagos, Ogun, Oyo and 2 more states".
 * Null when it isn't known.
 */
export function sellerReach(settings: { sellArea?: string | null; sellStates?: readonly string[] | null; originState?: string | null } | null | undefined): string | null {
  if (!settings) return null;
  if (settings.sellArea === "nationwide") return "delivers nationwide";
  const states = [...new Set((settings.sellStates ?? []).map((state) => state.trim()).filter(Boolean))];
  if (!states.length && settings.sellArea === "one_state" && settings.originState?.trim()) states.push(settings.originState.trim());
  if (!states.length) return null;
  if (states.length === 1) return `delivers within ${states[0]}`;
  if (states.length <= 3) return `delivers within ${states.slice(0, -1).join(", ")} and ${states.at(-1)}`;
  return `delivers within ${states.slice(0, 3).join(", ")} and ${states.length - 3} more ${states.length - 3 === 1 ? "state" : "states"}`;
}

/** The seller card's line: "{city} · delivers nationwide/within {states}" (either part may be missing). */
export function sellerCardLine(input: { place?: string | null; reach?: string | null }) {
  const parts = [input.place?.trim(), input.reach?.trim()].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}

/** One line of delivery estimate for the product page ("Lagos ₦2,000 · 1-2 days"). */
export function deliveryLines(info: Pick<StorefrontShopperInfo, "delivery" | "flatRate">, currency = "NGN") {
  if (info.delivery.length === 0) {
    return info.flatRate !== null ? [{ place: "Delivery", detail: info.flatRate > 0 ? formatStoreMoney(info.flatRate, currency) : "Free" }] : [];
  }
  return info.delivery.slice(0, 4).map((zone) => {
    const price = zone.pickupOnly ? "Pickup" : zone.alwaysFree || zone.fee === 0 ? "Free" : zone.fee !== null ? formatStoreMoney(zone.fee, currency) : "Fee at checkout";
    const extras = [zone.freeOver !== null ? `free over ${formatStoreMoney(zone.freeOver, currency)}` : null, zone.estimatedDays].filter(Boolean);
    return { place: zone.regions.length === 0 ? "Everywhere else" : zonePlace(zone), detail: [price, ...extras].join(" · ") };
  });
}

export function buildShopperInfo(input: {
  brandSettings: unknown;
  zones: RawShippingZone[];
  flatRate?: unknown;
  whatsappNumber?: string | null;
  collections?: ShopperCollection[];
  rating?: { average: number; count: number } | null;
  reviews?: ShopperReviewHighlight[];
}): StorefrontShopperInfo {
  const delivery = summariseDeliveryZones(input.zones);
  const payments = readPaymentChoices(input.brandSettings);
  const flatRate = input.zones.length === 0 ? num(input.flatRate ?? record(record(input.brandSettings).shippingConfig).flatRate) : null;
  return {
    announcement: deriveAnnouncement(delivery, payments.payOnDelivery),
    delivery,
    flatRate,
    payOnDelivery: payments.payOnDelivery,
    payOnDeliveryLimit: payments.payOnDeliveryLimit,
    paymentLabels: payments.labels,
    whatsappNumber: whatsappDigits(input.whatsappNumber ?? null),
    collections: input.collections ?? [],
    rating: input.rating ?? null,
    reviews: input.reviews ?? [],
  };
}

/** Accepts whatever came over the wire (or nothing, for stores loaded without it) as shopper info. */
export function readShopperInfo(value: unknown): StorefrontShopperInfo {
  const raw = record(value);
  if (!Object.keys(raw).length) return EMPTY_SHOPPER_INFO;
  return { ...EMPTY_SHOPPER_INFO, ...(raw as Partial<StorefrontShopperInfo>) };
}

// ─── Payday countdown (Noir) ──────────────────────────────────────────────────

export type PaydayRule = "day-of-month" | "last-friday" | "last-weekday";

export interface PaydaySettings {
  rule: PaydayRule;
  /** Day of the month for "day-of-month" (clamped to the month's length). */
  day: number;
  /** When payday falls on a weekend, use the Friday before (how most Nigerian payrolls run). */
  weekendToFriday: boolean;
  /** "sunday": the edit runs until the end of the first Sunday on/after payday. "days": for `days` days. */
  ends: "sunday" | "days";
  days: number;
}

export const DEFAULT_PAYDAY: PaydaySettings = { rule: "day-of-month", day: 25, weekendToFriday: true, ends: "sunday", days: 3 };

/** Lagos is UTC+1 all year (no daylight saving). */
const LAGOS_OFFSET_MS = 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export function readPaydaySettings(settings: unknown): PaydaySettings {
  const raw = record(settings);
  const rule = raw.paydayRule === "last-friday" || raw.paydayRule === "last-weekday" ? raw.paydayRule : "day-of-month";
  const day = Math.min(31, Math.max(1, Math.round(num(Number(raw.paydayDay)) ?? DEFAULT_PAYDAY.day)));
  const days = Math.min(14, Math.max(1, Math.round(num(Number(raw.saleDays)) ?? DEFAULT_PAYDAY.days)));
  return {
    rule,
    day,
    weekendToFriday: raw.weekendToFriday !== false,
    ends: raw.saleEnds === "days" ? "days" : "sunday",
    days,
  };
}

/** Lagos midnight of a calendar date, as a real instant. */
function lagosMidnight(year: number, month: number, day: number) {
  return new Date(Date.UTC(year, month, day) - LAGOS_OFFSET_MS);
}

function weekdayOf(year: number, month: number, day: number) {
  return new Date(Date.UTC(year, month, day)).getUTCDay();
}

/** Payday (Lagos midnight) for a calendar month. */
export function paydayInMonth(year: number, month: number, settings: PaydaySettings = DEFAULT_PAYDAY) {
  const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  let day: number;
  if (settings.rule === "last-friday") {
    day = last;
    while (weekdayOf(year, month, day) !== 5) day -= 1;
  } else if (settings.rule === "last-weekday") {
    day = last;
    while ([0, 6].includes(weekdayOf(year, month, day))) day -= 1;
  } else {
    day = Math.min(settings.day, last);
    if (settings.weekendToFriday) {
      const weekday = weekdayOf(year, month, day);
      if (weekday === 6) day -= 1;
      if (weekday === 0) day -= 2;
    }
  }
  return lagosMidnight(year, month, day);
}

/** When the payday edit that starts at `start` ends (exclusive). */
export function paydayEditEnd(start: Date, settings: PaydaySettings = DEFAULT_PAYDAY) {
  if (settings.ends === "days") return new Date(start.getTime() + settings.days * DAY_MS);
  const weekday = new Date(start.getTime() + LAGOS_OFFSET_MS).getUTCDay();
  const toSunday = (7 - weekday) % 7;
  return new Date(start.getTime() + (toSunday + 1) * DAY_MS);
}

export interface PaydayWindow {
  /** "live": the edit is running and ends at `end`; "upcoming": it starts at `start`. */
  phase: "live" | "upcoming";
  start: Date;
  end: Date;
}

export function paydayWindow(now: Date, settings: PaydaySettings = DEFAULT_PAYDAY): PaydayWindow {
  const lagos = new Date(now.getTime() + LAGOS_OFFSET_MS);
  const year = lagos.getUTCFullYear();
  const month = lagos.getUTCMonth();
  for (const offset of [-1, 0, 1, 2]) {
    const start = paydayInMonth(year, month + offset, settings);
    const end = paydayEditEnd(start, settings);
    if (now < start) return { phase: "upcoming", start, end };
    if (now < end) return { phase: "live", start, end };
  }
  const start = paydayInMonth(year, month + 3, settings);
  return { phase: "upcoming", start, end: paydayEditEnd(start, settings) };
}

export function countdownParts(target: Date, now: Date) {
  const ms = Math.max(0, target.getTime() - now.getTime());
  const seconds = Math.floor(ms / 1000);
  return {
    days: Math.floor(seconds / 86400),
    hours: Math.floor((seconds % 86400) / 3600),
    minutes: Math.floor((seconds % 3600) / 60),
    seconds: seconds % 60,
  };
}

/** "Sunday" / "Fri 25 Oct" in Lagos time, for honest banner copy. */
export function lagosDayLabel(date: Date, style: "weekday" | "short") {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Lagos",
    ...(style === "weekday" ? { weekday: "long" } : { weekday: "short", day: "numeric", month: "short" }),
  }).format(date);
}

/** The last day the edit runs (end is exclusive), for "ends Sunday". */
export function paydayLastDay(window: PaydayWindow) {
  return new Date(window.end.getTime() - 1);
}
