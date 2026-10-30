// Riders talk in the app: with their delivery company ("company") and with the shop on a job they carry ("shop").
// And customers rate their rider from a review link the rider sends after the drop. Pure, unit-tested in
// tests/rider-chat.test.mjs; the server side is src/lib/logistics/rider-messages.server.ts.

export const RIDER_AUDIENCES = ["company", "shop"] as const;
export type RiderAudience = (typeof RIDER_AUDIENCES)[number];

export const RIDER_MESSAGE_MAX = 1000;

/** A message as typed: trimmed, at most RIDER_MESSAGE_MAX characters; null when there's nothing to send. */
export function cleanRiderMessage(text: unknown): string | null {
  if (typeof text !== "string") return null;
  const body = text.replace(/\r\n/g, "\n").trim().slice(0, RIDER_MESSAGE_MAX);
  return body ? body : null;
}

export interface RiderMessageView {
  id: string;
  body: string;
  /** Who wrote it, from the reader's side. */
  mine: boolean;
  createdAt: string;
}

/** A rating from the review page: a whole 1-5, and a short comment or null. */
export function cleanRiderReview(input: { rating?: unknown; comment?: unknown }): { rating: number; comment: string | null } | null {
  const rating = Number(input.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return null;
  const comment = typeof input.comment === "string" ? input.comment.trim().slice(0, 500) : "";
  return { rating, comment: comment || null };
}

/** "4.8 (12)" style summary of a rider's ratings, or null with none. */
export function ratingSummary(ratings: number[]): { average: number; count: number } | null {
  if (!ratings.length) return null;
  return { average: Math.round((ratings.reduce((sum, value) => sum + value, 0) / ratings.length) * 10) / 10, count: ratings.length };
}
