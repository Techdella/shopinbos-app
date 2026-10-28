// Supplier price changes on notice (owner's "Supplier & Dropship Rules", spec gap C5): a supplier who raises the price
// of a product sellers already list gives them 7 days' notice. The new prices wait on the product
// (SupplierProduct.pendingPrice / pendingPriceAt) while the old ones stay in force, so orders in those 7 days cost the
// old price. Price cuts, and changes to a product nobody lists yet, apply at once. When the rise takes effect
// (the daily /api/cron/price-notices job), a seller whose listing would then lose money on a sale is paused
// instead, never sold at a loss, and offered the one-tap fix: "Raise to ₦X". Pure (no server imports), unit-tested
// in tests/dropship-marketplace.test.mjs.

import { dropshipUnitPrice, readPriceBreaks, type ChannelPrices } from "./dropship-rules.ts";
import { cleanListingChoice, listingEarn, listingProblem, type DropshipTerms, type ListingChoice } from "./dropship-checkout.ts";

/** Days of notice sellers get before a supplier's price rise applies. */
export const PRICE_NOTICE_DAYS = 7;
const DAY_MS = 86_400_000;

/** StoreProduct.pausedReason when Shopinbos took a listing off the store because the new supplier price makes it lose money. */
export const PRICE_LOSS = "price_loss";

/** The prices a supplier change can move (what sellers pay), saved together as one pending set. */
export interface PriceSet {
  priceMode: "same" | "per_channel";
  wholesalePrice: number;
  dropshipPrice: number | null;
  pricingTiers: Array<{ minQty: number; maxQty?: number; price: number }>;
}

const num = (value: unknown) => {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

/** The price set of a product (or of a product with an edit applied). */
export function priceSetOf(product: Pick<ChannelPrices, "priceMode" | "wholesalePrice" | "dropshipPrice" | "pricingTiers">): PriceSet {
  const dropship = num(product.dropshipPrice);
  return {
    priceMode: product.priceMode === "per_channel" ? "per_channel" : "same",
    wholesalePrice: num(product.wholesalePrice),
    dropshipPrice: dropship > 0 ? dropship : null,
    pricingTiers: readPriceBreaks(product.pricingTiers),
  };
}

/** SupplierProduct.pendingPrice as saved, or null when nothing is waiting (or it can't be read). */
export function readPendingPrice(value: unknown): PriceSet | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const set = priceSetOf({ priceMode: String(raw.priceMode ?? "same"), wholesalePrice: num(raw.wholesalePrice), dropshipPrice: raw.dropshipPrice as number | null, pricingTiers: raw.pricingTiers });
  return set.wholesalePrice > 0 ? set : null;
}

export function samePriceSet(a: PriceSet, b: PriceSet): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** What a shop pays per piece for the first wholesale break (the cheapest way in), for comparing two price sets. */
function entryWholesale(set: PriceSet): number {
  return set.priceMode === "per_channel" && set.pricingTiers[0] ? Math.max(set.wholesalePrice, set.pricingTiers[0].price) : set.wholesalePrice;
}

/** True when any shop would pay more after this change: the dropship price, the base price or a quantity break. */
export function priceRises(current: PriceSet, next: PriceSet): boolean {
  if (dropshipUnitPrice(next) > dropshipUnitPrice(current)) return true;
  if (next.wholesalePrice > current.wholesalePrice || entryWholesale(next) > entryWholesale(current)) return true;
  const tierAt = (set: PriceSet, qty: number) => (set.priceMode === "per_channel" ? [...set.pricingTiers].reverse().find((tier) => qty >= tier.minQty)?.price ?? set.wholesalePrice : set.wholesalePrice);
  return [...current.pricingTiers, ...next.pricingTiers].some((tier) => tierAt(next, tier.minQty) > tierAt(current, tier.minQty));
}

export type PriceChangePlan =
  /** The edit doesn't touch the prices: what is live and what is waiting stay as they are. */
  | { kind: "none" }
  /** Goes live now (a cut, or no one lists it yet); anything waiting is dropped. */
  | { kind: "now"; live: PriceSet }
  /** A rise on a listed product: the old prices stay live, the new ones wait until `effectiveAt`. */
  | { kind: "notice"; pending: PriceSet; effectiveAt: Date };

/**
 * What to do with a supplier's price edit. `listings`: how many shops list the product now. A rise on notice starts
 * a fresh 7 days each time it changes; a later edit back to the live prices (or lower) cancels it.
 */
export function planPriceChange(input: { current: PriceSet; next: PriceSet; pending?: PriceSet | null; listings: number; now?: Date }): PriceChangePlan {
  const now = input.now ?? new Date();
  const waiting = input.pending ?? null;
  // Back to the live prices: a waiting rise is cancelled; otherwise nothing changes.
  if (samePriceSet(input.current, input.next)) return waiting ? { kind: "now", live: input.current } : { kind: "none" };
  if (waiting && samePriceSet(waiting, input.next)) return { kind: "none" };
  if (input.listings > 0 && priceRises(input.current, input.next)) {
    return { kind: "notice", pending: input.next, effectiveAt: new Date(now.getTime() + PRICE_NOTICE_DAYS * DAY_MS) };
  }
  return { kind: "now", live: input.next };
}

/** True once a waiting price is due (the daily job applies it). */
export function priceDue(pendingAt: Date | string | null | undefined, now: Date = new Date()): boolean {
  if (!pendingAt) return false;
  const at = pendingAt instanceof Date ? pendingAt : new Date(pendingAt);
  return Number.isFinite(at.getTime()) && at.getTime() <= now.getTime();
}

/** "Mon 3 Nov": the day a waiting price takes effect, in Lagos time. */
export function noticeDay(at: Date | string, locale = "en-NG"): string {
  return new Date(at).toLocaleDateString(locale, { weekday: "short", day: "numeric", month: "short", timeZone: "Africa/Lagos" });
}

/** Nice prices for the one-tap fix: ₦100 steps under ₦50,000, ₦500 above. */
function roundUp(price: number): number {
  const step = price < 50_000 ? 100 : 500;
  return Math.ceil(price / step) * step;
}

/**
 * The lowest nice price at which this listing stops losing money (and respects the supplier's floor) with the
 * seller's own delivery and branding choices: the "Raise to ₦X" one-tap fix.
 */
export function breakEvenPrice(terms: DropshipTerms, choice: Omit<ListingChoice, "retailPrice">): number {
  const clean = cleanListingChoice(terms, { ...choice, retailPrice: 1 });
  // At price p the seller earns p - cost - their part of the dearest delivery - branding: solve for 0.
  const delivery = listingEarn(terms, { ...choice, retailPrice: terms.cost }) * -1;
  let price = roundUp(Math.max(terms.floor, terms.cost + Math.max(0, delivery), terms.cost + clean.brandingFee));
  for (let tries = 0; tries < 200 && listingProblem(terms, { ...choice, retailPrice: price }); tries++) price = roundUp(price + 1);
  return price;
}

export interface ListingVerdict {
  /** The seller's price no longer covers the supplier's price, their delivery share and branding. */
  loses: boolean;
  /** "You earn" per order at the seller's price (negative: a loss). */
  earn: number;
  /** The one-tap fix ("Raise to ₦X"). */
  fixPrice: number;
}

/** How a seller's dropship listing fares at the supplier's (new) prices. */
export function listingVerdict(terms: DropshipTerms, choice: ListingChoice): ListingVerdict {
  const earn = listingEarn(terms, choice);
  return { loses: Boolean(listingProblem(terms, choice)) && (earn < 0 || choice.retailPrice < terms.floor), earn, fixPrice: breakEvenPrice(terms, choice) };
}
