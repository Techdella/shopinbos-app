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
  { id: "small", credits: 60, naira: 2_000, label: "Quick top-up" },
  { id: "medium", credits: 200, naira: 5_500, label: "Business pack", badge: "Most popular" },
  { id: "large", credits: 600, naira: 14_500, label: "Power pack", badge: "Best value" },
];

export const DEFAULT_AUTO_PACK = "medium";

/** Credits every new account starts with ("5 AI credits to get started" on the Starter plan). */
export const WELCOME_CREDITS = 5;

/**
 * Credits a paid plan adds to the balance each time it is paid (Paystack plan codes). Monthly plans add the
 * month's credits; annual plans add twelve months' worth up front. The daily allowance comes from the plan too.
 */
export const PLAN_CREDIT_GRANTS: Record<string, { credits: number; label: string }> = {
  PLN_8ou289e71czicvm: { credits: 50, label: "Growth plan" },
  PLN_q1k3ssxpx7rxxuz: { credits: 600, label: "Growth plan (year)" },
  PLN_2gph11w3yd0250y: { credits: 200, label: "Seller Pro plan" },
  PLN_9gma70ofldhbj4r: { credits: 2_400, label: "Seller Pro plan (year)" },
  PLN_q78304vgj7p35o6: { credits: 100, label: "Supplier Max plan" },
  PLN_0a6z6ns429ohli1: { credits: 1_200, label: "Supplier Max plan (year)" },
};

export function planCreditGrant(planCode: string | null | undefined) {
  return planCode ? PLAN_CREDIT_GRANTS[planCode] ?? null : null;
}

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

/** Where each kind of account buys AI credits (suppliers have their own page in the supplier portal). */
export function creditsUrlFor(role: string | null | undefined) {
  return role === "supplier" ? "/supplier/credits" : "/home/credits";
}

/** The message when the allowance and credits are both used up. */
export function outOfCreditsMessage(limitWords: string, cost: number, balance: number) {
  return `You've used today's ${limitWords}${balance > 0 ? ` and this needs ${cost} credits (you have ${balance})` : ""}. Buy AI credits to carry on right now, or wait for your allowance to reset.`;
}
