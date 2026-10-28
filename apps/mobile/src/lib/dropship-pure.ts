// The phone's side of the Supplier & Dropship Rules (shared/dropship-rules.ts and shared/dropship-checkout.ts, which
// the server, the web and these screens all share). Pure, so tests/mobile-dropship-rules.test.mjs runs it in Node:
//   supplier   the Prices form (same price for all, or dropship / wholesale breaks / pre-order), dropship settings,
//              the delivery rate card draft, the locked pre-order meter, the pack checklist button
//   seller     "You pay / Your price / You earn" when adding a supplier's product, and why a price can't be saved
//   partner    the pay on delivery lock and the level goals' meters
// Words: English here, shown through `t.dynamic("dropship.<key>", english)` on the screens (wordsOf), so a catalog
// entry in shared/i18n/messages translates them later without touching the screens.

import {
  DELIVERY_ZONES,
  DROPSHIP_MIN_MAX,
  SUPPLIER_LEVEL_RULES,
  ZONE_DAYS,
  channelPriceProblem,
  cleanZoneRates,
  dropshipUnitPrice,
  readPriceBreaks,
  type DeliveryZone,
  type LevelGoal,
  type PriceMode,
  type ZoneRates,
} from "../../../../shared/dropship-rules.ts";
import { cleanListingChoice, listingProblem, type DropshipTerms, type ListingChoice } from "../../../../shared/dropship-checkout.ts";
import { NG_REGIONS, type SizeBand } from "../../../../shared/delivery-market.ts";
import { paymentFee } from "./find-pure.ts";

export type Vars = Record<string, string | number | null | undefined>;
/** The app-language translator's `dynamic` (useT(...) on the phone). */
export type Say = { dynamic(key: string, fallback?: string, vars?: Vars): string };

/** Fills "{name}" blanks (what t.dynamic does with the English fallback), for the tests and no-translator calls. */
export function fill(text: string, vars?: Vars): string {
  return vars ? text.replace(/\{(\w+)\}/g, (whole, name: string) => (vars[name] === undefined || vars[name] === null ? whole : String(vars[name]))) : text;
}

/** words("key", "English {blank}", vars): the catalog's "dropship.key" when there is one, else the English. */
export function wordsOf(t?: Say | null) {
  return (key: string, english: string, vars?: Vars) => (t ? t.dynamic(`dropship.${key}`, english, vars) : fill(english, vars));
}

export const naira = (value: number) => `₦${Math.round(value).toLocaleString("en-NG")}`;

/** A naira amount typed with commas, ₦ or spaces; null when empty or not a positive number. */
export function amountOf(text: string | null | undefined): number | null {
  const value = Number(String(text ?? "").replace(/[,₦\s]/g, ""));
  return String(text ?? "").trim() !== "" && Number.isFinite(value) && value > 0 ? value : null;
}

/** "9500" shown as "9,500" in a naira box (what's typed is kept without the commas). */
export function groupDigits(text: string): string {
  return /^\d+$/.test(text) ? Number(text).toLocaleString("en-NG") : text;
}

const countOf = (text: string) => {
  const value = Number(text.replace(/[,\s]/g, ""));
  return text.trim() !== "" && Number.isInteger(value) && value > 0 ? value : null;
};

const asText = (value: number | null | undefined) => (typeof value === "number" && value > 0 ? String(value) : "");

// ─── Prices per channel (P-Pricing) ──────────────────────────────────────────

export interface BreakDraft {
  min: string;
  max: string;
  price: string;
}

export interface PricesForm {
  mode: PriceMode;
  /** "Same price for all": the one price. Per channel: the wholesale price per piece below the first break. */
  base: string;
  dropship: string;
  preorder: string;
  breaks: BreakDraft[];
  suggested: string;
  lowest: string;
}

export interface SavedPrices {
  priceMode?: string | null;
  wholesalePrice?: number | null;
  dropshipPrice?: number | null;
  preorderPrice?: number | null;
  suggestedRetailPrice?: number | null;
  minRetailPrice?: number | null;
  pricingTiers?: unknown;
}

/** The form from a saved product (a new product: empty, "Different per channel" like the prototype). */
export function pricesFormFrom(product?: SavedPrices | null): PricesForm {
  if (!product) return { mode: "per_channel", base: "", dropship: "", preorder: "", breaks: [], suggested: "", lowest: "" };
  return {
    mode: product.priceMode === "per_channel" ? "per_channel" : "same",
    base: asText(product.wholesalePrice),
    dropship: asText(product.dropshipPrice),
    preorder: asText(product.preorderPrice),
    breaks: readPriceBreaks(product.pricingTiers).map((tier) => ({ min: String(tier.minQty), max: tier.maxQty ? String(tier.maxQty) : "", price: String(tier.price) })),
    suggested: asText(product.suggestedRetailPrice),
    lowest: asText(product.minRetailPrice),
  };
}

/** What the API takes (POST /api/supplier/products, PATCH …/[id]). Empty optional prices go as null. */
export interface PricesBody {
  priceMode: PriceMode;
  wholesalePrice: number;
  dropshipPrice: number | null;
  preorderPrice: number | null;
  pricingTiers: { minQty: number; maxQty?: number; price: number }[];
  suggestedRetailPrice: number;
  minRetailPrice: number | null;
}

export const MAX_BREAKS = 5;

/** The next quantity break to add: starting after the last one ("6" for the first, like the web). */
export function nextBreak(breaks: readonly BreakDraft[]): BreakDraft {
  const last = breaks[breaks.length - 1];
  const start = last ? (countOf(last.max) ?? countOf(last.min) ?? 0) + 1 : 6;
  return { min: String(start), max: "", price: "" };
}

/**
 * The form read and checked with the server's own words (channelPriceProblem), or why it can't be saved.
 * `preorderOpen`: the supplier is Established (otherwise the pre-order price isn't sent).
 */
export function readPricesForm(form: PricesForm, preorderOpen = false, words = wordsOf()): { ok: true; body: PricesBody } | { ok: false; message: string } {
  const perChannel = form.mode === "per_channel";
  const base = amountOf(form.base);
  if (!base) return { ok: false, message: perChannel ? words("prices.needWholesale", "Add your wholesale price per piece.") : words("prices.needOne", "Add your price per piece.") };
  const tiers: PricesBody["pricingTiers"] = [];
  if (perChannel) {
    for (const row of form.breaks) {
      if (!row.min.trim() && !row.max.trim() && !row.price.trim()) continue;
      const minQty = countOf(row.min);
      const maxQty = row.max.trim() ? countOf(row.max) : null;
      const price = amountOf(row.price);
      if (!minQty || !price || (row.max.trim() && (!maxQty || maxQty < minQty))) return { ok: false, message: words("prices.badBreak", "Check each quantity break: from how many pieces, up to how many (or empty), and the price.") };
      tiers.push({ minQty, ...(maxQty ? { maxQty } : {}), price });
    }
    tiers.sort((a, b) => a.minQty - b.minQty);
  }
  const suggested = amountOf(form.suggested);
  if (!suggested) return { ok: false, message: words("prices.needSuggested", "Add the price you suggest sellers charge.") };
  if (form.dropship.trim() && !amountOf(form.dropship)) return { ok: false, message: words("prices.needDropship", "Add a dropship price, or switch to the same price for all.") };
  if (form.lowest.trim() && !amountOf(form.lowest)) return { ok: false, message: words("prices.badLowest", "Check the lowest allowed price, or leave it empty.") };
  const body: PricesBody = {
    priceMode: form.mode,
    wholesalePrice: base,
    dropshipPrice: perChannel ? amountOf(form.dropship) : null,
    preorderPrice: perChannel && preorderOpen ? amountOf(form.preorder) : null,
    pricingTiers: tiers,
    suggestedRetailPrice: suggested,
    minRetailPrice: amountOf(form.lowest),
  };
  const problem = channelPriceProblem(body);
  return problem ? { ok: false, message: problem } : { ok: true, body };
}

/** What a seller pays per piece to dropship it, from the form as typed (0 while empty). */
export function formDropshipCost(form: PricesForm): number {
  return dropshipUnitPrice({ priceMode: form.mode, wholesalePrice: amountOf(form.base) ?? 0, dropshipPrice: amountOf(form.dropship) });
}

/** "6–23" or "24+" for a break row. */
export function breakRange(row: Pick<BreakDraft, "min" | "max">): string {
  const min = countOf(row.min);
  const max = countOf(row.max);
  if (!min) return "";
  return max && max >= min ? `${min}–${max}` : `${min}+`;
}

/** One line per product on "Prices": "₦9,000 for all", or "Dropship ₦9,500 · 6–23 ₦8,200 · 24+ ₦7,500". */
export function priceSummary(product: SavedPrices, words = wordsOf()): string {
  const base = product.wholesalePrice ?? 0;
  if (product.priceMode !== "per_channel") return words("summary.same", "{price} for all", { price: naira(base) });
  const breaks = readPriceBreaks(product.pricingTiers).map((tier) => `${tier.maxQty ? `${tier.minQty}–${tier.maxQty}` : `${tier.minQty}+`} ${naira(tier.price)}`);
  return [words("summary.dropship", "Dropship {price}", { price: naira(dropshipUnitPrice({ priceMode: "per_channel", wholesalePrice: base, dropshipPrice: product.dropshipPrice })) }), words("summary.wholesale", "Wholesale {price}", { price: naira(base) }), ...breaks].join(" · ");
}

// ─── Dropship settings (P-Dropship) ──────────────────────────────────────────

export interface DropshipForm {
  /** "Yes, 1 piece is fine" (true) or "No, set a minimum". */
  single: boolean;
  minQty: number;
  handlingDays: number;
  sizeBand: SizeBand;
  sample: boolean;
}

export function dropshipFormFrom(product?: { dropshipMinQty?: number | null; handlingDays?: number | null; sizeBand?: string | null; sampleAvailable?: boolean | null } | null): DropshipForm {
  const min = Math.floor(product?.dropshipMinQty ?? 1);
  const days = product?.handlingDays ?? 1;
  const band = product?.sizeBand;
  return {
    single: !(min > 1),
    minQty: min > 1 ? Math.min(min, DROPSHIP_MIN_MAX) : 2,
    handlingDays: days === 2 || days === 3 ? days : 1,
    sizeBand: band === "medium" || band === "bulky" ? band : "small",
    sample: Boolean(product?.sampleAvailable),
  };
}

export function dropshipBody(form: DropshipForm) {
  return {
    dropshipMinQty: form.single ? 1 : Math.min(DROPSHIP_MIN_MAX, Math.max(2, Math.floor(form.minQty))),
    handlingDays: form.handlingDays,
    sizeBand: form.sizeBand,
    sampleAvailable: form.sample,
  };
}

// ─── Delivery prices (P-Delivery) ────────────────────────────────────────────

export type RateDraft = Record<DeliveryZone, Record<SizeBand, string>>;

/** The supplier's card as text boxes; an empty card starts from the example prices (defaults) to change. */
export function rateDraftFrom(rates: ZoneRates | null | undefined, defaults: ZoneRates): RateDraft {
  const empty = !rates || DELIVERY_ZONES.every((zone) => !Object.keys(rates[zone] ?? {}).length);
  const source = empty ? defaults : rates;
  const out = {} as RateDraft;
  for (const zone of DELIVERY_ZONES) {
    const row = source[zone] ?? {};
    out[zone] = { small: asText(row.small), medium: asText(row.medium), bulky: asText(row.bulky) };
  }
  return out;
}

/** The draft checked like the server (cleanZoneRates: prices in range, farther never cheaper). */
export function readRateDraft(draft: RateDraft): { ok: true; value: ZoneRates } | { ok: false; message: string } {
  const raw: Record<string, Record<string, number | string>> = {};
  for (const zone of DELIVERY_ZONES) {
    raw[zone] = {};
    for (const band of ["small", "medium", "bulky"] as const) {
      const text = draft[zone][band].trim();
      if (text) raw[zone][band] = amountOf(text) ?? text;
    }
  }
  return cleanZoneRates(raw);
}

/** Where each zone reaches from the supplier ("Port Harcourt", "Rivers", "Bayelsa, Delta, Edo", "Lagos, Abuja, Kano"). */
export function zoneExamples(originState: string | null | undefined, originArea: string | null | undefined): Record<DeliveryZone, string> {
  const state = originState?.trim() || "";
  const region = Object.values(NG_REGIONS).find((states) => (states as readonly string[]).includes(state)) ?? [];
  const nearby = region.filter((each) => each !== state).slice(0, 3);
  const far = ["Lagos", "FCT", "Kano", "Rivers", "Enugu"].filter((each) => each !== state && !(region as readonly string[]).includes(each)).slice(0, 3).map((each) => (each === "FCT" ? "Abuja" : each));
  return {
    same_city: originArea?.trim() || state,
    same_state: state,
    nearby: nearby.join(", "),
    rest: far.join(", "),
  };
}

/** "1–2 days" for a zone (on the road, before packing). */
export const zoneDaysWords = (zone: DeliveryZone) => `${ZONE_DAYS[zone][0]}–${ZONE_DAYS[zone][1]} days`;

// ─── Supplier level: the locked pre-order card and the level screen (P-Tier) ─

/** How full a goal's meter is, 0–1 (checks: 1 when done). */
export function goalShare(goal: Pick<LevelGoal, "have" | "need" | "done" | "kind">): number {
  if (goal.kind === "check" || !(goal.need > 0)) return goal.done ? 1 : 0;
  return Math.max(0, Math.min(1, goal.have / goal.need));
}

/** "62 / 100" for a count, the value ("4.7", "1.6%") for a check. */
export function goalValue(goal: Pick<LevelGoal, "key" | "have" | "need" | "kind">): string {
  if (goal.kind === "count") return `${Math.floor(goal.have)} / ${goal.need}`;
  if (goal.key === "disputes" || goal.key === "failed") return `${goal.have}%`;
  if (goal.key === "rating") return goal.have > 0 ? goal.have.toFixed(1) : "–";
  return "";
}

/**
 * The locked Pre-order card's meter (P-Pricing): delivered orders toward Established, and the line
 * "62 of 100 orders · 18 of 30 reviews" (reviews only when the level screen counts them yet).
 */
export function preorderMeter(goals: readonly Pick<LevelGoal, "key" | "have">[], words = wordsOf()): { share: number; line: string } {
  const e = SUPPLIER_LEVEL_RULES.established;
  const delivered = Math.max(0, Math.floor(goals.find((goal) => goal.key === "delivered")?.have ?? 0));
  const reviews = goals.find((goal) => goal.key === "reviews");
  const parts = [words("meter.orders", "{have} of {need} orders", { have: Math.min(delivered, e.delivered), need: e.delivered })];
  if (reviews) parts.push(words("meter.reviews", "{have} of {need} reviews", { have: Math.min(Math.floor(reviews.have), e.reviews), need: e.reviews }));
  return { share: Math.min(1, delivered / e.delivered), line: parts.join(" · ") };
}

// ─── Pack it the seller's way (P-Order) ──────────────────────────────────────

/** The steps left before "Ready for pickup" (the photo counts as one), and the button's words. */
export function packButton(steps: readonly { id: string; done: boolean }[], photoUrl: string | null | undefined, words = wordsOf()): { left: number; ready: boolean; label: string } {
  const left = steps.filter((step) => (step.id === "photo" ? !photoUrl : !step.done)).length;
  return left ? { left, ready: false, label: left === 1 ? words("pack.oneLeft", "1 step left") : words("pack.left", "{count} steps left", { count: left }) } : { left: 0, ready: true, label: words("pack.ready", "Ready for pickup") };
}

/** The steps to send after ticking or unticking one (the photo is never sent as a step). */
export function toggleStep(done: readonly string[], id: string): string[] {
  if (id === "photo") return [...done];
  return done.includes(id) ? done.filter((each) => each !== id) : [...done, id];
}

/** "ak." style initials for a seller with no logo. */
export function sellerInitials(name: string): string {
  const parts = name.replace(/['’]s\b/gi, "").split(/[^A-Za-z0-9]+/).filter(Boolean);
  const letters = parts.length > 1 ? parts.slice(0, 2).map((part) => part[0]).join("") : (parts[0] ?? "?").slice(0, 2);
  return `${letters.toLowerCase()}.`;
}

// ─── Seller: add a supplier's product (A-Seller-AddSupplier) ─────────────────

/**
 * "On each order", line by line, exactly as the web's Find products panel works it out
 * (src/app/marketplace/_components/DropshipTermsPanel.tsx with paymentFee from src/lib/marketplace/find.ts, mirrored in
 * ./find-pure.ts): your price, less what you pay the supplier, the delivery you cover (the dearest zone when you pay
 * it, the rest above a flat fee), the branding fee per parcel and the card payment fee on the sale.
 */
export interface ListingMoney {
  price: number;
  cost: number;
  /** The customer pays delivery (the line reads "Customer pays"). */
  customerPays: boolean;
  deliveryShare: number;
  brandingFee: number;
  cardFee: number;
  earn: number;
}

export function listingMoney(terms: DropshipTerms, choice: ListingChoice): ListingMoney {
  const clean = cleanListingChoice(terms, choice);
  const price = choice.retailPrice;
  const deliveryShare = clean.payer === "seller" ? terms.dearestDelivery : clean.payer === "flat" ? Math.max(0, terms.dearestDelivery - (clean.flatFee ?? 0)) : 0;
  const cardFee = paymentFee(Math.max(0, Math.round(price)));
  return { price, cost: terms.cost, customerPays: clean.payer === "customer", deliveryShare, brandingFee: clean.brandingFee, cardFee, earn: price - terms.cost - deliveryShare - clean.brandingFee - cardFee };
}

export interface ListingView {
  /** What the web shows as "You earn": after the supplier, delivery you cover, branding and the card payment fee. */
  earn: number;
  money: ListingMoney;
  problem: string | null;
  /** The money row: You pay / Your price / You earn. */
  pay: number;
  floorLine: string | null;
}

/** You earn (as the web shows it) and the refusal line (the POST's own listingProblem), live as the seller types. */
export function listingView(terms: DropshipTerms, choice: ListingChoice, words = wordsOf()): ListingView {
  const money = listingMoney(terms, choice);
  return {
    earn: money.earn,
    money,
    problem: listingProblem(terms, choice),
    pay: terms.cost,
    floorLine: terms.floor > terms.cost || terms.minRetailPrice ? words("add.floor", "Lowest price allowed: {price}.", { price: naira(terms.floor) }) : null,
  };
}

/** "Lagos: ₦4,500 · 3–6 days" for "Delivery to your customers", or the estimate line on partner rates. */
export function deliveryLine(terms: Pick<DropshipTerms, "deliveryToYou" | "dearestDelivery" | "dearestIsEstimate">, place: string | null, words = wordsOf()): string {
  const to = terms.deliveryToYou;
  if (to) return words("add.deliveryTo", "{place}: {price} · {min}–{max} days", { place: place || to.zoneLabel, price: naira(to.price), min: to.minDays, max: to.maxDays });
  return terms.dearestIsEstimate ? words("add.deliveryUpTo", "Up to about {price} per parcel", { price: naira(terms.dearestDelivery) }) : words("add.deliveryMax", "Up to {price} per parcel", { price: naira(terms.dearestDelivery) });
}

/** The who-pays chip labels, with the flat fee in it when one is typed ("Flat ₦2,000"). */
export function payerLabel(payer: "customer" | "seller" | "flat", flatFee: number | null, words = wordsOf()): string {
  if (payer === "customer") return words("payer.customer", "Customer pays");
  if (payer === "seller") return words("payer.seller", "I pay (free delivery)");
  return flatFee ? words("payer.flatFee", "Flat {price}", { price: naira(flatFee) }) : words("payer.flat", "Flat fee");
}

/** "My stickers +₦200" for a branding chip. */
export function brandingLabel(entry: { label: string; fee: number }): string {
  return entry.fee > 0 ? `${entry.label} +${naira(entry.fee)}` : entry.label;
}

/** "Trusted supplier · ★ 4.7 from 18 shops" (null for a new supplier with no reviews). */
export function supplierBadgeLine(supplier: { level?: string | null; rating: number | null; ratingCount?: number | null }, words = wordsOf()): string | null {
  const level = supplier.level === "established" ? words("badge.established", "Established supplier") : supplier.level === "trusted" ? words("badge.trusted", "Trusted supplier") : null;
  const rated = supplier.rating && supplier.ratingCount ? words("badge.rated", "★ {rating} from {count} shops", { rating: supplier.rating.toFixed(1), count: supplier.ratingCount }) : null;
  return [level, rated].filter(Boolean).join(" · ") || null;
}

// ─── Delivery partner: pay on delivery (A-Rider-POD) ─────────────────────────

/** The pay on delivery switch: open to switch, or locked (and why). On a 403 pod_locked the screen opens the goals. */
export function podSwitch(partner: { level?: string | null; podOpen?: boolean | null }, currentlyOn: boolean): { locked: boolean } {
  // Older servers don't send podOpen: leave the switch as it was. A partner already offering it can always turn it off.
  if (partner.podOpen === undefined || partner.podOpen === null) return { locked: false };
  return { locked: !partner.podOpen && !currentlyOn };
}

export const POD_LOCKED_CODE = "pod_locked";
export const PREORDER_LOCKED_CODE = "preorder_locked";
