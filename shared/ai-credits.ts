// AI credits a seller can buy when a daily plan allowance runs out (Settings > Billing > AI credits, /home/credits).
// The daily allowance is spent first; then each request costs credits by kind. With auto top-up on, the card
// saved from a credit purchase is charged for the chosen pack when the balance can't cover a request.
// Pure, unit-tested in tests/behaviour.test.mjs; the money moves in src/lib/ai/credits.server.ts.

export interface CreditPack {
  id: string;
  credits: number;
  /** Price in naira. */
  naira: number;
  label: string;
  /** Shown as a ribbon. */
  badge?: string;
}

export const CREDIT_PACKS: CreditPack[] = [
  { id: "small", credits: 60, naira: 2_000, label: "Small chops" },
  { id: "medium", credits: 200, naira: 5_500, label: "Market day", badge: "Most popular" },
  { id: "large", credits: 600, naira: 14_500, label: "Owambe size", badge: "Best value" },
];

export const DEFAULT_AUTO_PACK = "medium";

/** Credits per request once the day's allowance is used: a picture costs more than a chat message. */
export const CREDIT_COST = { text: 1, speech: 1, voice: 2, image: 5, build: 15 } as const;
export type CreditKind = keyof typeof CREDIT_COST;

/** Automatic charges allowed in 24 hours, so a runaway loop can't keep charging the card. */
export const AUTO_TOP_UP_PER_DAY = 3;

/** Paystack references for credit purchases start with this (the webhook routes them here). */
export const CREDIT_REFERENCE_PREFIX = "credits-";

export function creditPack(id: string | null | undefined): CreditPack | null {
  return CREDIT_PACKS.find((pack) => pack.id === id) ?? null;
}

export function creditCost(kind: CreditKind, units = 1) {
  return CREDIT_COST[kind] * Math.max(1, Math.round(units));
}

/** Kobo for a pack (Paystack amounts). */
export function packKobo(pack: CreditPack) {
  return pack.naira * 100;
}

/** "₦36.67 per credit" style value for the pack list (naira per credit, two decimals). */
export function nairaPerCredit(pack: CreditPack) {
  return Math.round((pack.naira / pack.credits) * 100) / 100;
}

/**
 * Whether to charge the saved card now: auto top-up is on, a reusable card and a pack are set, the pack covers
 * what's needed, and fewer than AUTO_TOP_UP_PER_DAY automatic charges went through in the last 24 hours.
 */
export function shouldAutoTopUp(input: { autoTopUp: boolean; hasCard: boolean; packId: string | null | undefined; need: number; balance: number; autoChargesToday: number }) {
  const pack = creditPack(input.packId);
  if (!input.autoTopUp || !input.hasCard || !pack) return false;
  if (input.autoChargesToday >= AUTO_TOP_UP_PER_DAY) return false;
  return input.balance < input.need && input.balance + pack.credits >= input.need;
}

/** The message when the allowance and credits are both used up. */
export function outOfCreditsMessage(limitWords: string, cost: number, balance: number) {
  return `You've used today's ${limitWords}${balance > 0 ? ` and this needs ${cost} credits (you have ${balance})` : ""}. Buy AI credits at /home/credits to carry on right now, or wait for your allowance to reset.`;
}
