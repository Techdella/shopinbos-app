// The seller's default markup on supplier products ("Add 30% to supplier prices") and the selling price a one-tap
// add uses. Pure, no "@/" imports: shared by the web (Find products, My supplier products), the server
// (src/lib/marketplace/quick-add.server.ts) and the phone app. Unit-tested in tests/find-quick-add.test.mjs.
//
//   - The setting: 20%, 30% or 50% on top of what the seller pays the supplier, or a fixed ₦ amount. 30% until the
//     seller picks (they're asked once, the first time they add a supplier product, and can change it in Settings).
//   - A one-tap price: the supplier's suggested retail price when they set one, else cost + the markup, rounded up
//     to a price a shop would put on a tag (₦14,500, ₦15,000), and never below the supplier's lowest allowed price
//     or what the seller pays plus the card fee (the same floor as the price stepper).

export type Markup = { kind: "percent"; value: number } | { kind: "amount"; value: number };

/** The three quick choices; any whole percent from MIN to MAX also reads back. */
export const MARKUP_PERCENT_CHOICES = [20, 30, 50] as const;
export const MARKUP_PERCENT_MIN = 5;
export const MARKUP_PERCENT_MAX = 300;
export const MARKUP_AMOUNT_MIN = 100;
export const MARKUP_AMOUNT_MAX = 5_000_000;
export const DEFAULT_MARKUP: Markup = { kind: "percent", value: 30 };

const num = (value: unknown) => {
  const n = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value.replace(/[,\s₦]/g, "")) : NaN;
  return Number.isFinite(n) ? n : NaN;
};

/** A stored or sent markup, or null when it isn't one we accept. */
export function readMarkup(value: unknown): Markup | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const amount = num(raw.value);
  if (raw.kind === "percent" && Number.isInteger(amount) && amount >= MARKUP_PERCENT_MIN && amount <= MARKUP_PERCENT_MAX) return { kind: "percent", value: amount };
  if (raw.kind === "amount" && amount >= MARKUP_AMOUNT_MIN && amount <= MARKUP_AMOUNT_MAX) return { kind: "amount", value: Math.round(amount) };
  return null;
}

/** Why this markup can't be saved, in the seller's words, or null. */
export function markupProblem(value: unknown): string | null {
  if (readMarkup(value)) return null;
  const raw = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  if (raw.kind === "amount") return `Enter an amount from ₦${MARKUP_AMOUNT_MIN.toLocaleString("en-NG")}.`;
  return `Pick a markup from ${MARKUP_PERCENT_MIN}% to ${MARKUP_PERCENT_MAX}%.`;
}

export const sameMarkup = (a: Markup | null | undefined, b: Markup | null | undefined) => Boolean(a && b && a.kind === b.kind && a.value === b.value);

/** "+30%" or "+₦2,000". */
export function markupLabel(markup: Markup, money: (amount: number) => string = (amount) => `₦${Math.round(amount).toLocaleString("en-NG")}`): string {
  return markup.kind === "percent" ? `+${markup.value}%` : `+${money(markup.value)}`;
}

/** The step a price is rounded up to: ₦50 under ₦1,000, ₦100 under ₦10,000, ₦500 under ₦50,000, ₦1,000 under ₦200,000, else ₦5,000. */
export function niceStep(price: number): number {
  if (price < 1_000) return 50;
  if (price < 10_000) return 100;
  if (price < 50_000) return 500;
  if (price < 200_000) return 1_000;
  return 5_000;
}

/** Rounds a price up to a price a shop would print (₦14,320 → ₦14,500; ₦49,800 → ₦50,000). Never goes down. */
export function nicePrice(price: number): number {
  if (!Number.isFinite(price) || price <= 0) return 0;
  const step = niceStep(price);
  // Cents from a percentage (14,300.0000001) don't push a round price to the next step.
  return Math.ceil(Math.round(price * 100) / 100 / step) * step;
}

/** Cost with the markup on top, rounded up to a nice price. */
export function markedUpPrice(cost: number, markup: Markup = DEFAULT_MARKUP): number {
  if (!(cost > 0)) return 0;
  const raw = markup.kind === "percent" ? cost * (1 + markup.value / 100) : cost + markup.value;
  return nicePrice(raw);
}

/** Card payment fee on a sale (1.5% plus ₦100 from ₦2,500, capped at ₦2,000): the same as Find products. */
export function cardFee(amount: number) {
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  return Math.round(Math.min(amount * 0.015 + (amount >= 2500 ? 100 : 0), 2000));
}

/** The lowest price the price stepper allows: what the seller pays, the card fee and ₦100, rounded up to ₦100. */
export function sellingFloor(cost: number) {
  return Math.ceil((Math.max(0, cost) + cardFee(cost) + 100) / 100) * 100;
}

export interface QuickPriceInput {
  /** What the seller pays the supplier per piece (the dropship price for dropship). */
  cost: number;
  /** The supplier's suggested retail price (0 or null: none). */
  suggested?: number | null;
  /** The supplier's lowest allowed retail price (0 or null: none). */
  minRetail?: number | null;
  markup?: Markup | null;
  /** false: ignore the supplier's suggestion and use the markup (My supplier products → "Apply 30% markup"). */
  preferSuggested?: boolean;
}

export type QuickPriceBasis = "suggested" | "markup" | "lowest";

/** The price a one-tap add lists the product at, and why. */
export function quickAddPrice(input: QuickPriceInput): { price: number; basis: QuickPriceBasis } {
  const cost = Math.max(0, num(input.cost) || 0);
  const lowest = Math.max(num(input.minRetail) > 0 ? num(input.minRetail) : 0, sellingFloor(cost));
  const ceiling = Math.max(lowest, Math.round(cost * 10));
  const suggested = num(input.suggested) > 0 ? num(input.suggested) : 0;
  const useSuggested = input.preferSuggested !== false && suggested > 0;
  const wanted = useSuggested ? Math.round(suggested) : markedUpPrice(cost, input.markup ?? DEFAULT_MARKUP);
  if (wanted >= lowest) return { price: Math.min(ceiling, wanted), basis: useSuggested ? "suggested" : "markup" };
  // Below the lowest allowed: the lowest, rounded up to a nice price when that still fits under the ceiling.
  const nice = nicePrice(lowest);
  return { price: nice <= ceiling ? nice : Math.ceil(lowest), basis: "lowest" };
}

/** The example under the question: "A ₦10,000 product sells at ₦13,000". */
export function markupExample(markup: Markup, cost = 10_000) {
  return { cost, price: markedUpPrice(cost, markup) };
}
