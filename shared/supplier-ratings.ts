// Sellers rate suppliers (spec gap C6b): after a wholesale order (or a sample) arrives, or a supplier delivers a
// dropship order for the seller's customer, the seller gives 1–5 stars and a short line. Stored as SupplierReview
// rows with targetRole "supplier" (the supplier can reply in their Reviews page), counted in supplier levels
// (src/lib/supplier-levels.server.ts) and averaged into Supplier.rating / ratingCount, which Find shows on supplier
// cards and product pages ("★ 4.7 · 18 shops"). Pure, unit-tested in tests/dropship-marketplace.test.mjs.

export const RATING_KINDS = ["wholesale_order", "dropship_order"] as const;
export type RatingKind = (typeof RATING_KINDS)[number];
export const isRatingKind = (value: unknown): value is RatingKind => (RATING_KINDS as readonly string[]).includes(String(value));

/** The short line under the stars. */
export const RATING_TEXT_MAX = 280;

/** The order has arrived: wholesale (and samples) once delivered, dropship once the supplier's parcel is delivered. */
export function orderArrived(kind: RatingKind, status: string): boolean {
  return status === "delivered";
}

/** Why this seller can't rate the supplier for this order, or null. */
export function ratingProblem(input: { kind: RatingKind; status: string; isBuyer: boolean; alreadyRated: boolean }): string | null {
  if (!input.isBuyer) return "Only the shop that placed this order can rate it.";
  if (!orderArrived(input.kind, input.status)) return "You can rate the supplier once the order has arrived.";
  if (input.alreadyRated) return "You already rated this order.";
  return null;
}

/** The stars (a whole number from 1 to 5) and the line (trimmed, at most 280 characters), or why not. */
export function cleanRating(input: { rating: unknown; text?: unknown }): { ok: true; rating: number; text: string | null } | { ok: false; message: string } {
  const rating = Number(input.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return { ok: false, message: "Pick from 1 to 5 stars." };
  const text = typeof input.text === "string" ? input.text.replace(/\s+/g, " ").trim().slice(0, RATING_TEXT_MAX) : "";
  return { ok: true, rating, text: text || null };
}

/** Average (one decimal) and how many ratings, for Supplier.rating / ratingCount. */
export function ratingSummary(ratings: ReadonlyArray<number>): { rating: number; count: number } {
  const valid = ratings.filter((value) => Number.isInteger(value) && value >= 1 && value <= 5);
  if (!valid.length) return { rating: 0, count: 0 };
  return { rating: Math.round((valid.reduce((sum, value) => sum + value, 0) / valid.length) * 10) / 10, count: valid.length };
}

/** "★ 4.7 · 18 ratings" (null without any). */
export function ratingWords(rating: number | null | undefined, count: number | null | undefined): string | null {
  if (!count || !rating) return null;
  return `★ ${rating.toFixed(1)} · ${count} rating${count === 1 ? "" : "s"}`;
}
