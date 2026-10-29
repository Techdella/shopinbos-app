// Supplier & dropship rules (the owner's "Shopinbos Supplier & Dropship Rules", Oct 2026). Pure, no "@/" imports,
// shared by the web portals, the phone app, the API and checkout; unit-tested in tests/dropship-rules.test.mjs.
//
// The one rule behind all of it: the customer pays everything up front into Shopinbos, and each party is paid only
// after delivery is confirmed. The seller never pays the supplier up front, and the supplier never pays for delivery.
//
//   Prices per channel   one switch per product: the same price for every channel, or a dropship price, wholesale
//                        quantity breaks and a pre-order price; plus a suggested and an optional lowest retail price.
//   Dropship options     single pieces or a minimum per order, how fast they pack (1–3 days), samples.
//   Delivery rate card   size class per product × zone from the supplier (same city, same state, nearby states,
//                        rest of Nigeria). Sellers and customers never type a delivery price.
//   Who pays delivery    never the supplier: the customer (default), the seller (free delivery) or a flat fee the
//                        seller charges and tops up. A price that would lose the seller money can't be saved.
//   Seller branding      blind packing and the seller's name on tracking are always on; packing slips, the seller's
//                        stickers and custom packaging are extras the supplier offers.
//   Supplier levels      New → Trusted → Established, from the delivery record. Pre-orders open at Established.
//   Partner tiers        1 Verified → 2 Trusted → 3 Top partner, from the delivery record. They control reach
//                        (interstate, place in shops' lists, high-value parcels, featured: shared/partner-reach.ts), not
//                        cash: riders never hold cash (shared/pay-at-door.ts), so pay on delivery is open from Tier 1.

import { NG_REGIONS, SIZE_BANDS, type Place, type SizeBand } from "./delivery-market.ts";
import { PAY_ON_DELIVERY_ON } from "./checkout-payments.ts";
import { levelPerks } from "./partner-reach.ts";

const num = (value: unknown) => {
  const n = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : NaN;
  return Number.isFinite(n) ? n : NaN;
};
const money = (value: number) => Math.round(value * 100) / 100;
const naira = (value: number) => `₦${Math.round(value).toLocaleString("en-NG")}`;

// ─── Prices per channel ──────────────────────────────────────────────────────

export const PRICE_MODES = ["same", "per_channel"] as const;
export type PriceMode = (typeof PRICE_MODES)[number];
export const isPriceMode = (value: unknown): value is PriceMode => value === "same" || value === "per_channel";

export interface PriceBreak {
  minQty: number;
  maxQty?: number;
  price: number;
}

/** The price fields of a supplier product (SupplierProduct). wholesalePrice is the base: "Same price for all" uses it everywhere. */
export interface ChannelPrices {
  priceMode?: string | null;
  wholesalePrice: number;
  dropshipPrice?: number | null;
  preorderPrice?: number | null;
  pricingTiers?: unknown;
  suggestedRetailPrice?: number | null;
  minRetailPrice?: number | null;
}

export function readPriceBreaks(value: unknown): PriceBreak[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((tier) => (tier && typeof tier === "object" ? (tier as Record<string, unknown>) : {}))
    .filter((tier) => num(tier.minQty) >= 1 && num(tier.price) > 0)
    .map((tier) => ({
      minQty: Math.floor(num(tier.minQty)),
      ...(num(tier.maxQty) >= num(tier.minQty) ? { maxQty: Math.floor(num(tier.maxQty)) } : {}),
      price: num(tier.price),
    }))
    .sort((a, b) => a.minQty - b.minQty);
}

const perChannel = (product: ChannelPrices) => product.priceMode === "per_channel";

/** What a seller pays the supplier for one piece sent to their customer. */
export function dropshipUnitPrice(product: ChannelPrices): number {
  const own = num(product.dropshipPrice);
  return perChannel(product) && own > 0 ? own : product.wholesalePrice;
}

/** What a shop pays per piece for a bulk order of this many (the best quantity break it reaches). */
export function wholesaleUnitPrice(product: ChannelPrices, quantity: number): number {
  if (!perChannel(product)) return product.wholesalePrice;
  const match = [...readPriceBreaks(product.pricingTiers)]
    .sort((a, b) => b.minQty - a.minQty)
    .find((tier) => quantity >= tier.minQty && (tier.maxQty === undefined || quantity <= tier.maxQty));
  return match?.price ?? product.wholesalePrice;
}

/** What a shop pays per piece for a pre-order. */
export function preorderUnitPrice(product: ChannelPrices): number {
  const own = num(product.preorderPrice);
  return perChannel(product) && own > 0 ? own : product.wholesalePrice;
}

/** The lowest price a seller may list it at: the supplier's lowest retail price, and never below what they pay. */
export function retailFloor(product: ChannelPrices): number {
  return Math.max(num(product.minRetailPrice) > 0 ? num(product.minRetailPrice) : 0, dropshipUnitPrice(product));
}

/** Why these channel prices can't be saved, in the supplier's words, or null. */
export function channelPriceProblem(product: ChannelPrices): string | null {
  if (!(product.wholesalePrice > 0)) return "Add your price per piece.";
  if (perChannel(product)) {
    if (product.dropshipPrice != null && !(num(product.dropshipPrice) > 0)) return "Add a dropship price, or switch to the same price for all.";
    if (product.preorderPrice != null && !(num(product.preorderPrice) > 0)) return "Add a pre-order price, or leave it empty.";
    const breaks = readPriceBreaks(product.pricingTiers);
    for (let i = 1; i < breaks.length; i++) {
      if (breaks[i].minQty === breaks[i - 1].minQty) return `Two quantity breaks start at ${breaks[i].minQty} pieces.`;
      if (breaks[i].price > breaks[i - 1].price) return "Bigger quantities should cost the same or less per piece.";
    }
  }
  const suggested = num(product.suggestedRetailPrice);
  const lowest = num(product.minRetailPrice);
  const cost = dropshipUnitPrice(product);
  if (suggested > 0 && suggested <= cost) return `The suggested price should be above your dropship price (${naira(cost)}), so sellers can earn.`;
  if (lowest > 0) {
    if (lowest < cost) return `The lowest allowed price can't be below your dropship price (${naira(cost)}).`;
    if (suggested > 0 && lowest > suggested) return "The lowest allowed price can't be above the suggested price.";
  }
  return null;
}

// ─── Dropship options ────────────────────────────────────────────────────────

export const HANDLING_DAYS = [1, 2, 3] as const;
export const DROPSHIP_MIN_MAX = 1000;

export function cleanHandlingDays(value: unknown): number {
  const n = Math.round(num(value));
  return (HANDLING_DAYS as readonly number[]).includes(n) ? n : 1;
}

/** Smallest dropship order: 1 when single pieces are fine. */
export function cleanDropshipMinQty(value: unknown): number {
  const n = Math.floor(num(value));
  return n >= 1 ? Math.min(n, DROPSHIP_MIN_MAX) : 1;
}

/** Why a customer can't buy this many of a dropship product, or null. */
export function dropshipQuantityProblem(minQty: number | null | undefined, quantity: number, name = "This product"): string | null {
  const min = cleanDropshipMinQty(minQty);
  return quantity < min ? `${name} ships in ${min} pieces or more. Add ${min - quantity} more to order it.` : null;
}

/** "Ships 1 piece" · "Minimum 3 pieces" · "Packs in 1 day" for sellers' product cards. */
export function dropshipOptionWords(product: { dropshipMinQty?: number | null; handlingDays?: number | null; sampleAvailable?: boolean | null }): string[] {
  const min = cleanDropshipMinQty(product.dropshipMinQty);
  const days = cleanHandlingDays(product.handlingDays);
  return [
    min === 1 ? "Ships 1 piece" : `Minimum ${min} pieces`,
    `Packs in ${days} day${days === 1 ? "" : "s"}`,
    ...(product.sampleAvailable ? ["1 sample at the dropship price"] : []),
  ];
}

export const LOW_STOCK_WARNING = 5;

/** Stock as sellers see it: hidden on every store at 0, a warning below 5. */
export function supplierStockState(stock: number | null | undefined): "out" | "low" | "ok" {
  const n = Math.max(0, Math.floor(num(stock) || 0));
  return n === 0 ? "out" : n < LOW_STOCK_WARNING ? "low" : "ok";
}

// ─── Delivery rate card by zone ──────────────────────────────────────────────

export const DELIVERY_ZONES = ["same_city", "same_state", "nearby", "rest"] as const;
export type DeliveryZone = (typeof DELIVERY_ZONES)[number];

export const ZONE_LABELS: Record<DeliveryZone, string> = {
  same_city: "Same city",
  same_state: "Same state",
  nearby: "Nearby states",
  rest: "Rest of Nigeria",
};

/** Size classes as Nigerian suppliers say them (the delivery market's small | medium | bulky). */
export const SIZE_CLASS_LABELS: Record<SizeBand, string> = {
  small: "Small (fits in a nylon)",
  medium: "Medium (shoe box)",
  bulky: "Large (Ghana Must Go, carton or bale)",
};

/** How long each zone takes on the road, before the supplier's packing time. */
export const ZONE_DAYS: Record<DeliveryZone, readonly [number, number]> = {
  same_city: [1, 2],
  same_state: [1, 3],
  nearby: [2, 4],
  rest: [3, 6],
};

export type ZoneRates = Record<DeliveryZone, Partial<Record<SizeBand, number>>>;

/** Starting prices for a supplier's own card (the doc's example table). The supplier changes them before saving. */
export const DEFAULT_ZONE_RATES: ZoneRates = {
  same_city: { small: 1500, medium: 2500, bulky: 4000 },
  same_state: { small: 2500, medium: 3500, bulky: 5500 },
  nearby: { small: 3500, medium: 5000, bulky: 8000 },
  rest: { small: 4500, medium: 6500, bulky: 10000 },
};

export const RATE_SOURCES = ["partners", "own"] as const;
export type RateSource = (typeof RATE_SOURCES)[number];
export const isRateSource = (value: unknown): value is RateSource => value === "partners" || value === "own";

export const ZONE_RATE_MAX = 500_000;

/** A stored card, keeping only real prices (an empty cell means "I don't deliver that size there"). */
export function readZoneRates(value: unknown): ZoneRates {
  const source = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const out = { same_city: {}, same_state: {}, nearby: {}, rest: {} } as ZoneRates;
  for (const zone of DELIVERY_ZONES) {
    const row = source[zone] && typeof source[zone] === "object" ? (source[zone] as Record<string, unknown>) : {};
    for (const band of SIZE_BANDS) {
      const price = num(row[band]);
      if (price > 0 && price <= ZONE_RATE_MAX) out[zone][band] = money(price);
    }
  }
  return out;
}

export function zoneRatesEmpty(rates: ZoneRates): boolean {
  return DELIVERY_ZONES.every((zone) => !Object.keys(rates[zone]).length);
}

/** Checks a card the supplier sent: prices are numbers in range, and farther never costs less than nearer. */
export function cleanZoneRates(value: unknown): { ok: true; value: ZoneRates } | { ok: false; message: string } {
  const source = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  for (const zone of DELIVERY_ZONES) {
    const row = source[zone] && typeof source[zone] === "object" ? (source[zone] as Record<string, unknown>) : {};
    for (const band of SIZE_BANDS) {
      const raw = row[band];
      if (raw === undefined || raw === null || raw === "") continue;
      const price = num(raw);
      if (!(price > 0) || price > ZONE_RATE_MAX) return { ok: false, message: `${ZONE_LABELS[zone]}, ${SIZE_CLASS_LABELS[band]}: enter a price between ₦1 and ${naira(ZONE_RATE_MAX)}.` };
    }
  }
  const rates = readZoneRates(source);
  if (zoneRatesEmpty(rates)) return { ok: false, message: "Add at least one delivery price." };
  for (const band of SIZE_BANDS) {
    let last = 0;
    for (const zone of DELIVERY_ZONES) {
      const price = rates[zone][band];
      if (price === undefined) continue;
      if (price < last) return { ok: false, message: `${ZONE_LABELS[zone]} costs less than a nearer zone for ${SIZE_CLASS_LABELS[band].toLowerCase()}. Farther should cost the same or more.` };
      last = price;
    }
  }
  return { ok: true, value: rates };
}

const sameText = (a: string | null, b: string | null) => !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();
const regionNamed = (state: string) => Object.entries(NG_REGIONS).find(([, states]) => (states as readonly string[]).includes(state))?.[0] ?? null;

/** Which zone of the supplier's card a delivery falls in, or null when either end has no state. */
export function deliveryZone(origin: Place, destination: Place): DeliveryZone | null {
  if (!origin.state || !destination.state) return null;
  if (origin.state === destination.state) return sameText(origin.area, destination.area) ? "same_city" : "same_state";
  const region = regionNamed(origin.state);
  return region && region === regionNamed(destination.state) ? "nearby" : "rest";
}

export interface ZoneQuote {
  zone: DeliveryZone;
  price: number;
  minDays: number;
  maxDays: number;
}

/**
 * The delivery price and arrival window for one parcel from the supplier's own card: the zone's price for the size
 * (a bigger size's price when the exact one is empty), plus the supplier's packing days. Null: not delivered there.
 */
export function zoneQuote(rates: ZoneRates, origin: Place, destination: Place, band: SizeBand, handlingDays = 1): ZoneQuote | null {
  const zone = deliveryZone(origin, destination);
  if (!zone) return null;
  const row = rates[zone];
  const order = SIZE_BANDS.slice(SIZE_BANDS.indexOf(band));
  const size = order.find((each) => row[each] !== undefined);
  if (!size) return null;
  const handling = cleanHandlingDays(handlingDays);
  const [min, max] = ZONE_DAYS[zone];
  return { zone, price: row[size]!, minDays: min + handling - 1, maxDays: max + handling };
}

/** "Arrives Mon 3 – Thu 6 Nov" from today. */
export function arrivalWords(minDays: number, maxDays: number, now: Date = new Date(), locale = "en-NG"): string {
  const day = (offset: number) => new Date(now.getTime() + offset * 86_400_000);
  const fmt = (date: Date) => date.toLocaleDateString(locale, { weekday: "short", day: "numeric", timeZone: "Africa/Lagos" });
  const month = day(maxDays).toLocaleDateString(locale, { month: "short", timeZone: "Africa/Lagos" });
  if (maxDays <= 1) return "Arrives tomorrow";
  return minDays === maxDays ? `Arrives ${fmt(day(maxDays))} ${month}` : `Arrives ${fmt(day(minDays))} – ${fmt(day(maxDays))} ${month}`;
}

// ─── Who pays delivery (never the supplier) ──────────────────────────────────

export const DELIVERY_PAYERS = ["customer", "seller", "flat"] as const;
export type DeliveryPayer = (typeof DELIVERY_PAYERS)[number];
export const isDeliveryPayer = (value: unknown): value is DeliveryPayer => (DELIVERY_PAYERS as readonly string[]).includes(String(value));

export const DELIVERY_PAYER_LABELS: Record<DeliveryPayer, string> = {
  customer: "Customer pays delivery",
  seller: "Free delivery (I pay it)",
  flat: "Flat fee (I cover the rest)",
};

/** What the customer sees for delivery of one parcel. A flat fee never charges more than the delivery costs. */
export function customerDeliveryCharge(payer: string | null | undefined, actualFee: number, flatFee?: number | null): number {
  const fee = Math.max(0, actualFee);
  if (payer === "seller") return 0;
  if (payer === "flat") return money(Math.min(fee, Math.max(0, num(flatFee) || 0)));
  return money(fee);
}

/** What the seller covers from their margin for one parcel. */
export function sellerDeliveryShare(payer: string | null | undefined, actualFee: number, flatFee?: number | null): number {
  return money(Math.max(0, actualFee) - customerDeliveryCharge(payer, actualFee, flatFee));
}

export interface MarginInput {
  retailPrice: number;
  quantity?: number;
  /** What the seller pays the supplier per piece (dropshipUnitPrice). */
  unitCost: number;
  payer: string | null | undefined;
  flatFee?: number | null;
  /** The dearest delivery the seller could have to cover (worst zone), when they pay any of it. */
  deliveryFee: number;
  /** Per-parcel branding fee the supplier charges (stickers). */
  brandingFee?: number;
  /** Shopinbos's fee on the seller's share, as a fraction (0 while undecided). */
  sellerFeeRate?: number;
}

/** "You earn" on one order: price minus supplier price, the seller's part of delivery, branding and fees. */
export function dropshipMargin(input: MarginInput): number {
  const quantity = Math.max(1, Math.floor(input.quantity ?? 1));
  const gross = (input.retailPrice - input.unitCost) * quantity;
  const fee = Math.max(0, gross) * Math.max(0, input.sellerFeeRate ?? 0);
  return money(gross - fee - sellerDeliveryShare(input.payer, input.deliveryFee, input.flatFee) - Math.max(0, input.brandingFee ?? 0));
}

/** Why the seller can't save this price, or null (below the supplier's floor, or it would lose money). */
export function sellerPriceProblem(input: MarginInput & { floor: number }): string | null {
  if (input.retailPrice < input.floor) return `The supplier's lowest price for this is ${naira(input.floor)}.`;
  const earn = dropshipMargin(input);
  if (earn < 0) return `At ${naira(input.retailPrice)} you'd lose ${naira(-earn)} on some orders. Raise your price or let the customer pay delivery.`;
  return null;
}

// ─── Seller branding on dropship parcels ─────────────────────────────────────

export interface BrandingOffer {
  packingSlip: boolean;
  packingSlipFee: number;
  stickers: boolean;
  stickerFee: number;
  custom: boolean;
}

export const BRANDING_FEE_MAX = 5000;
export const NO_BRANDING_OFFER: BrandingOffer = { packingSlip: false, packingSlipFee: 0, stickers: false, stickerFee: 0, custom: false };

export function readBrandingOffer(value: unknown): BrandingOffer {
  const source = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const fee = (raw: unknown) => {
    const n = num(raw);
    return n > 0 ? Math.min(BRANDING_FEE_MAX, money(n)) : 0;
  };
  return {
    packingSlip: source.packingSlip === true,
    packingSlipFee: source.packingSlip === true ? fee(source.packingSlipFee) : 0,
    stickers: source.stickers === true,
    stickerFee: source.stickers === true ? fee(source.stickerFee) : 0,
    custom: source.custom === true,
  };
}

/** What the seller picks per product. Blind packing and their name on tracking are always on. */
export const BRANDING_CHOICES = ["blind", "packing_slip", "stickers"] as const;
export type BrandingChoice = (typeof BRANDING_CHOICES)[number];
export const isBrandingChoice = (value: unknown): value is BrandingChoice => (BRANDING_CHOICES as readonly string[]).includes(String(value));

export const BRANDING_CHOICE_LABELS: Record<BrandingChoice, string> = {
  blind: "Blind + my name on tracking",
  packing_slip: "My packing slip",
  stickers: "My stickers or bags",
};

/** The choices this supplier offers (blind always), and the per-parcel fee of each. */
export function brandingChoicesFor(offer: BrandingOffer): Array<{ choice: BrandingChoice; fee: number }> {
  return [
    { choice: "blind", fee: 0 },
    ...(offer.packingSlip ? [{ choice: "packing_slip" as const, fee: offer.packingSlipFee }] : []),
    ...(offer.stickers ? [{ choice: "stickers" as const, fee: offer.stickerFee }] : []),
  ];
}

/** A seller's choice, falling back to blind when the supplier stopped offering it. */
export function effectiveBranding(choice: string | null | undefined, offer: BrandingOffer): { choice: BrandingChoice; fee: number } {
  const options = brandingChoicesFor(offer);
  return options.find((option) => option.choice === choice) ?? options[0];
}

export interface PackStep {
  id: "contents" | "plain" | "slip" | "sticker" | "code" | "photo";
  text: string;
  detail: string;
}

/** The two packing photos (shared/fault-matrix.ts: they decide most disputes). */
export const PACK_PHOTO_STEPS = ["contents", "photo"] as const;

/**
 * The supplier's checklist on a dropship order: pack it the seller's way. It starts with a photo of the item in the
 * open box and ends with the sealed parcel: the two photos that decide most disputes.
 */
export function packChecklist(input: { sellerName: string; choice: string | null | undefined; orderCode: string; stickersLeft?: number | null; skus?: readonly string[] }): PackStep[] {
  const skus = (input.skus ?? []).filter(Boolean);
  return [
    { id: "contents", text: "Snap the item in the open box", detail: "Shows exactly what you sent, before you seal it" },
    { id: "plain", text: "Pack plain, no price tag", detail: "Nothing with your name, price or receipt inside" },
    ...(input.choice === "packing_slip" ? [{ id: "slip" as const, text: `Print ${input.sellerName}'s packing slip`, detail: skus.length ? `Shows ${skus.join(", ")}` : "Their logo and a thank-you note" }] : []),
    ...(input.choice === "stickers"
      ? [{ id: "sticker" as const, text: `Use ${input.sellerName}'s sticker or bag`, detail: typeof input.stickersLeft === "number" ? `${Math.max(0, input.stickersLeft)} left in their pack` : "From the pack they sent you" }]
      : []),
    { id: "code", text: `Write ${input.orderCode} on the parcel`, detail: "The rider reads it at pickup" },
    { id: "photo", text: "Snap the sealed parcel", detail: "Protects you if there's a dispute" },
  ];
}

/**
 * The order can be marked ready only with every step ticked and both photos taken: the item in the open box
 * (`contentsUrl`, when the checklist asks for it) and the sealed parcel.
 */
export function packReadyProblem(steps: readonly PackStep[], done: readonly string[], photoUrl: string | null | undefined, contentsUrl?: string | null): string | null {
  if (steps.some((step) => step.id === "contents") && !contentsUrl) return "Snap a photo of the item in the open box first.";
  if (!photoUrl) return "Snap a photo of the sealed parcel first.";
  const left = steps.filter((step) => step.id !== "photo" && step.id !== "contents" && !done.includes(step.id));
  return left.length ? `${left.length} step${left.length === 1 ? "" : "s"} left: ${left[0].text}.` : null;
}

export const STICKERS_LOW = 10;

/** The seller's sticker pack at a supplier after one parcel used one. */
export function stickersAfterUse(left: number | null | undefined): { left: number | null; low: boolean } {
  if (typeof left !== "number") return { left: null, low: false };
  const next = Math.max(0, left - 1);
  return { left: next, low: next <= STICKERS_LOW };
}

// ─── Supplier levels: pre-orders unlock at Established ───────────────────────

export const SUPPLIER_LEVELS = ["new", "trusted", "established"] as const;
export type SupplierLevel = (typeof SUPPLIER_LEVELS)[number];
export const SUPPLIER_LEVEL_LABELS: Record<SupplierLevel, string> = { new: "New", trusted: "Trusted", established: "Established" };
export const isSupplierLevel = (value: unknown): value is SupplierLevel => (SUPPLIER_LEVELS as readonly string[]).includes(String(value));

/** A starting proposal from the rules doc, to tune after launch. */
export const SUPPLIER_LEVEL_RULES = {
  trusted: { delivered: 25, rating: 4.3, disputeRate: 0.05 },
  established: { delivered: 100, reviews: 30, rating: 4.5, disputeRate: 0.03, days: 60 },
  /** Missing this many pre-order ready dates drops an Established supplier back to Trusted. */
  missedReadyDatesDrop: 2,
  /** Late shipments still counting (strikes, 90 days, shared/fault-matrix.ts) that keep a supplier off Established. */
  lateStrikesDrop: 3,
} as const;

export interface SupplierRecord {
  /** ID + selfie passed (or the team verified them). */
  verified: boolean;
  /** Dropship and wholesale orders delivered. */
  delivered: number;
  /** Reviews from sellers, and their average. */
  reviews: number;
  rating: number;
  /** Orders that went wrong on the supplier's side (rejected, expired, not sent). */
  disputes: number;
  /** A pickup location pinned on the map. */
  addressVerified: boolean;
  createdAt: Date | string;
  missedReadyDates?: number;
  /** Parcels sent after their ship-by date, still counting (late strikes within 90 days). Each is a problem too. */
  lateStrikes?: number;
  now?: Date;
}

const daysSince = (from: Date | string, now: Date) => Math.max(0, Math.floor((now.getTime() - new Date(from).getTime()) / 86_400_000));
// Late handling counts against the supplier's level: each late shipment still counting is a problem, like a rejected
// order (the owner's table: "late handling counts against the supplier's tier").
const disputeRate = (record: { delivered: number; disputes: number; lateStrikes?: number }) => {
  const problems = record.disputes + (record.lateStrikes ?? 0);
  const total = record.delivered + problems;
  return total ? problems / total : 0;
};

export function supplierLevel(record: SupplierRecord): SupplierLevel {
  const now = record.now ?? new Date();
  const t = SUPPLIER_LEVEL_RULES.trusted;
  const e = SUPPLIER_LEVEL_RULES.established;
  const rate = disputeRate(record);
  const trusted = record.verified && record.delivered >= t.delivered && record.rating >= t.rating && rate < t.disputeRate && record.addressVerified;
  if (!trusted) return "new";
  const established =
    record.delivered >= e.delivered && record.reviews >= e.reviews && record.rating >= e.rating && rate < e.disputeRate && daysSince(record.createdAt, now) >= e.days &&
    (record.missedReadyDates ?? 0) < SUPPLIER_LEVEL_RULES.missedReadyDatesDrop &&
    (record.lateStrikes ?? 0) < SUPPLIER_LEVEL_RULES.lateStrikesDrop;
  return established ? "established" : "trusted";
}

export interface LevelGoal {
  key: string;
  label: string;
  /** What they have, for a meter ("62 / 100"), or the shown value ("4.7"). */
  have: number;
  need: number;
  done: boolean;
  /** Counts fill a meter; checks are just done or not. */
  kind: "count" | "check";
}

/** What's left to reach the next level, for the "Your level" screen and the locked pre-order card. */
export function supplierLevelGoals(record: SupplierRecord): { level: SupplierLevel; next: SupplierLevel | null; goals: LevelGoal[] } {
  const now = record.now ?? new Date();
  const level = supplierLevel(record);
  const rate = disputeRate(record);
  const pct = (value: number) => Math.round(value * 1000) / 10;
  if (level === "new") {
    const t = SUPPLIER_LEVEL_RULES.trusted;
    return {
      level,
      next: "trusted",
      goals: [
        { key: "verified", label: "ID and selfie checked", have: record.verified ? 1 : 0, need: 1, done: record.verified, kind: "check" },
        { key: "delivered", label: "Delivered orders", have: record.delivered, need: t.delivered, done: record.delivered >= t.delivered, kind: "count" },
        { key: "rating", label: `Rating ${t.rating} or more`, have: record.rating, need: t.rating, done: record.rating >= t.rating, kind: "check" },
        { key: "disputes", label: `Problems under ${pct(t.disputeRate)}%`, have: pct(rate), need: pct(t.disputeRate), done: rate < t.disputeRate, kind: "check" },
        { key: "address", label: "Pickup location on the map", have: record.addressVerified ? 1 : 0, need: 1, done: record.addressVerified, kind: "check" },
      ],
    };
  }
  const e = SUPPLIER_LEVEL_RULES.established;
  const days = daysSince(record.createdAt, now);
  const goals: LevelGoal[] = [
    { key: "delivered", label: "Delivered orders", have: record.delivered, need: e.delivered, done: record.delivered >= e.delivered, kind: "count" },
    { key: "reviews", label: "Reviews from sellers", have: record.reviews, need: e.reviews, done: record.reviews >= e.reviews, kind: "count" },
    { key: "days", label: "Days on Shopinbos", have: days, need: e.days, done: days >= e.days, kind: "count" },
    { key: "rating", label: `Rating ${e.rating} or more`, have: record.rating, need: e.rating, done: record.rating >= e.rating, kind: "check" },
    { key: "disputes", label: `Problems under ${pct(e.disputeRate)}%`, have: pct(rate), need: pct(e.disputeRate), done: rate < e.disputeRate, kind: "check" },
    { key: "late", label: `Fewer than ${SUPPLIER_LEVEL_RULES.lateStrikesDrop} late parcels in 90 days`, have: record.lateStrikes ?? 0, need: SUPPLIER_LEVEL_RULES.lateStrikesDrop, done: (record.lateStrikes ?? 0) < SUPPLIER_LEVEL_RULES.lateStrikesDrop, kind: "check" },
  ];
  return { level, next: level === "established" ? null : "established", goals };
}

export interface SupplierPerks {
  preorders: boolean;
  /** Open orders at once; null = no limit. */
  openOrderLimit: number | null;
  /** Days after delivery before the supplier is paid (the return window). */
  payoutDelayDays: number;
  /** Packing slips and stickers for sellers. */
  branding: boolean;
  /** Share of a pre-order deposit paid to the supplier at the start, to buy materials. */
  preorderAdvancePct: number;
}

export function supplierPerks(level: string | null | undefined): SupplierPerks {
  if (level === "established") return { preorders: true, openOrderLimit: null, payoutDelayDays: 1, branding: true, preorderAdvancePct: 30 };
  if (level === "trusted") return { preorders: false, openOrderLimit: null, payoutDelayDays: 2, branding: true, preorderAdvancePct: 0 };
  return { preorders: false, openOrderLimit: 20, payoutDelayDays: 3, branding: false, preorderAdvancePct: 0 };
}

export const canTakePreorders = (level: string | null | undefined) => supplierPerks(level).preorders;

export const PREORDER_LOCKED_MESSAGE =
  "Pre-orders open when you reach Established: 100 delivered orders, 30 reviews and 60 days on Shopinbos. Keep delivering well to unlock them.";

/** Why this supplier can't take another order right now (Tier 1 open-order limit), or null. */
export function openOrderProblem(level: string | null | undefined, openOrders: number): string | null {
  const limit = supplierPerks(level).openOrderLimit;
  return limit !== null && openOrders >= limit ? `New suppliers can have ${limit} open orders at once. Ship some to take more.` : null;
}

/** The branding a supplier at this level can offer (New suppliers offer blind packing only). */
export function brandingOfferFor(level: string | null | undefined, offer: BrandingOffer): BrandingOffer {
  return supplierPerks(level).branding ? offer : { ...NO_BRANDING_OFFER, custom: offer.custom };
}

// ─── Delivery partner tiers: reach, not cash ─────────────────────────────────
//
//   1 · Verified     ID and selfie passed            prepaid and pay on delivery jobs in their areas
//   2 · Trusted      50 delivered, rating 4.3+,      interstate jobs, a higher place in shops' partner lists
//                    under 2% failed drops, base
//                    address verified
//   3 · Top partner  150 delivered, 60+ days on     high-value parcels (over ₦150,000, or phones, jewellery,
//                    Shopinbos, CAC or a guarantor   laptops), can apply to be featured, a higher place still
//
// Pay on delivery is paid in the app at the door and the rider types the code the customer gets once it's paid
// (shared/pay-at-door.ts), so riders never hold cash and every verified partner can take it. The stored value of
// Tier 3 is still "cash_trusted" (LogisticsPartner.level), so nothing in the database moves; it reads "Top partner".
//
// What each tier unlocks, the high-value rule (₦150,000, phones / jewellery / laptops, admin-editable) and featured
// live in shared/partner-reach.ts. These are separate from the verification tiers in shared/partner-tiers.ts
// (Verified Individual / Registered Business), whose order-value and open-jobs limits are the "safety limits".

export const PARTNER_LEVELS = ["verified", "trusted", "cash_trusted"] as const;
export type PartnerLevel = (typeof PARTNER_LEVELS)[number];
export const PARTNER_LEVEL_LABELS: Record<PartnerLevel, string> = { verified: "Verified", trusted: "Trusted", cash_trusted: "Top partner" };
/** The tier number shown with the name: "Tier 1 · Verified". */
export const PARTNER_LEVEL_TIER: Record<PartnerLevel, 1 | 2 | 3> = { verified: 1, trusted: 2, cash_trusted: 3 };
export const isPartnerLevel = (value: unknown): value is PartnerLevel => (PARTNER_LEVELS as readonly string[]).includes(String(value));
/** A stored level, anything unknown or missing read as Tier 1. */
export const partnerLevelOf = (value: unknown): PartnerLevel => (isPartnerLevel(value) ? value : "verified");
/** "Tier 2 · Trusted". */
export function partnerTierName(level: unknown) {
  const key = partnerLevelOf(level);
  return `Tier ${PARTNER_LEVEL_TIER[key]} · ${PARTNER_LEVEL_LABELS[key]}`;
}
/** Tier 1, 2 or 3. */
export const partnerTierNumber = (level: string | null | undefined) => PARTNER_LEVEL_TIER[partnerLevelOf(level)];

/** `cashTrusted` is Tier 3 (Top partner); the key keeps its old name because pay-on-delivery code reads it. */
export const PARTNER_LEVEL_RULES = {
  trusted: { delivered: 50, rating: 4.3, failedRate: 0.02 },
  /** Tier 3, Top partner (stored as cash_trusted). */
  cashTrusted: { delivered: 150, days: 60 },
} as const;

/** The cash a Cash trusted partner may hold at once to start, rising with their record (older cash jobs only). */
export const POD_CASH_CAP_START = 100_000;
export const POD_CASH_CAP_MAX = 1_000_000;
/** Hours to pay collected cash into their Shopinbos account (older cash jobs only). */
export const POD_REMIT_HOURS = 24;

export interface PartnerRecord {
  verified: boolean;
  delivered: number;
  failed: number;
  rating: number;
  /** Their base pinned and checked. */
  baseVerified: boolean;
  createdAt: Date | string;
  /** Late cash pay-ins on older cash jobs (LogisticsPartner.payInStrikes). No longer part of the tiers. */
  lateRemittances?: number;
  /** A CAC registration or a confirmed guarantor. */
  cacOrGuarantor: boolean;
  now?: Date;
}

const failRate = (record: { delivered: number; failed: number }) => {
  const total = record.delivered + record.failed;
  return total ? record.failed / total : 0;
};

export function partnerLevel(record: PartnerRecord): PartnerLevel {
  const now = record.now ?? new Date();
  const t = PARTNER_LEVEL_RULES.trusted;
  const c = PARTNER_LEVEL_RULES.cashTrusted;
  const trusted = record.verified && record.delivered >= t.delivered && record.rating >= t.rating && failRate(record) < t.failedRate && record.baseVerified;
  if (!trusted) return "verified";
  const top = record.delivered >= c.delivered && daysSince(record.createdAt, now) >= c.days && record.cacOrGuarantor;
  return top ? "cash_trusted" : "trusted";
}

export function partnerLevelGoals(record: PartnerRecord): { level: PartnerLevel; next: PartnerLevel | null; goals: LevelGoal[] } {
  const now = record.now ?? new Date();
  const level = partnerLevel(record);
  if (level === "verified") {
    const t = PARTNER_LEVEL_RULES.trusted;
    const rate = Math.round(failRate(record) * 1000) / 10;
    return {
      level,
      next: "trusted",
      goals: [
        { key: "delivered", label: "Delivered jobs", have: record.delivered, need: t.delivered, done: record.delivered >= t.delivered, kind: "count" },
        { key: "rating", label: `Rating ${t.rating} or more`, have: record.rating, need: t.rating, done: record.rating >= t.rating, kind: "check" },
        { key: "failed", label: `Failed drops under ${t.failedRate * 100}%`, have: rate, need: t.failedRate * 100, done: failRate(record) < t.failedRate, kind: "check" },
        { key: "base", label: "Base address verified", have: record.baseVerified ? 1 : 0, need: 1, done: record.baseVerified, kind: "check" },
      ],
    };
  }
  const c = PARTNER_LEVEL_RULES.cashTrusted;
  const days = daysSince(record.createdAt, now);
  return {
    level,
    next: level === "cash_trusted" ? null : "cash_trusted",
    goals: [
      { key: "delivered", label: "Delivered jobs", have: record.delivered, need: c.delivered, done: record.delivered >= c.delivered, kind: "count" },
      { key: "days", label: "Days on Shopinbos", have: days, need: c.days, done: days >= c.days, kind: "count" },
      { key: "cac", label: "CAC or a guarantor", have: record.cacOrGuarantor ? 1 : 0, need: 1, done: record.cacOrGuarantor, kind: "check" },
    ],
  };
}

/**
 * What each tier unlocks, read from shared/partner-reach.ts (the one place the reach rules live): pay on delivery for
 * every verified partner, interstate from Trusted, high-value parcels and "Apply to be featured" at Top partner, and
 * the boost in shops' partner lists.
 */
export function partnerPerks(level: string | null | undefined) {
  const perks = levelPerks(level);
  return {
    tier: partnerTierNumber(level),
    payOnDelivery: perks.payOnDelivery,
    interstate: perks.interstate,
    /** High-value parcels (shared/partner-reach.ts highValueReason: over the admin's threshold, or phones, jewellery, laptops). */
    highValue: perks.highValue,
    canApplyFeatured: perks.canApplyFeatured,
    /** Points added to the "Find partners" order (shared/delivery-market.ts rankScore). */
    rankBoost: perks.rankBoost,
  };
}

/**
 * Pay on delivery is open to this partner now: verified (riders never hold cash), and not paused for cash still owed
 * from older cash jobs. `verificationStatus` is checked when given.
 */
export function canOfferPayOnDelivery(partner: { level?: string | null; codPaused?: boolean | null; verificationStatus?: string | null }): boolean {
  // Switched off everywhere for now (shared/checkout-payments.ts PAY_ON_DELIVERY_ON).
  return PAY_ON_DELIVERY_ON && canOfferPayOnDeliveryRules(partner);
}

/** canOfferPayOnDelivery's rules, as they apply once pay on delivery is switched back on. */
export function canOfferPayOnDeliveryRules(partner: { level?: string | null; codPaused?: boolean | null; verificationStatus?: string | null }): boolean {
  if (partner.verificationStatus !== undefined && partner.verificationStatus !== "verified") return false;
  return !partner.codPaused;
}

export const POD_LOCKED_MESSAGE =
  "Pay on delivery opens once your company is verified (ID and selfie). Customers pay in the app at the door and give your rider a code, so riders never carry cash.";

/** Pay on delivery at the door, as partners and riders are told it (shared/pay-at-door.ts has the rules). */
export const PAY_AT_DOOR_STEPS = [
  "The customer pays the delivery fee when they order, so your trip is always paid.",
  "At the door they check the parcel, then pay the rest in the app: transfer, card or USSD. Your rider never takes cash.",
  "Once the money is in, the customer gets a 4-digit code. Your rider types it to finish the drop. No code, no drop.",
  "No payment after 10 minutes, or they refuse? Bring the parcel back. You're still paid for the trip.",
] as const;

export const INTERSTATE_LOCKED_MESSAGE =
  "Interstate jobs open at Trusted: 50 delivered jobs, a rating of 4.3 or more, failed drops under 2% and your base address verified.";

/** The cash cap for a Cash trusted partner: ₦100,000 to start, +₦10,000 for every 50 deliveries past 150, plus any deposit. */
export function podCashCap(record: { delivered: number; deposit?: number | null }): number {
  const extra = Math.max(0, Math.floor((record.delivered - PARTNER_LEVEL_RULES.cashTrusted.delivered) / 50)) * 10_000;
  return Math.min(POD_CASH_CAP_MAX, POD_CASH_CAP_START + extra + Math.max(0, num(record.deposit) || 0));
}

/** Can this partner take another pay-on-delivery job of this value with the cash they already hold? */
export function podJobFits(input: { cashHeld: number; jobCash: number; cap: number }): boolean {
  return input.cashHeld + input.jobCash <= input.cap;
}
