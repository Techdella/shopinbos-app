// AI credits a seller can buy when a daily plan allowance runs out (Settings > Billing > AI credits, /home/credits).
// The daily allowance is spent first; then each request costs credits by kind. With auto top-up on, the card
// saved from a credit purchase is charged for the chosen pack when the balance can't cover a request.
// Pure, unit-tested in tests/behaviour.test.mjs; the money moves in src/lib/ai/credits.server.ts.
//
// The numbers here are the defaults. Live prices, credits and costs come from Admin › Pricing
// (shared/platform-pricing.ts): server code passes them in (creditPacksFrom, creditCosts) where it says so below.

import { creditCosts, creditPackPrices, type PriceBook } from "./platform-pricing.ts";
import { PLAN_TIERS, planCreditsPerPayment, planVersion, type PlanTier } from "./plan-catalog.ts";

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

/** The packs with this price book's credits and prices (labels and ribbons stay as above). */
export function creditPacksFrom(book: PriceBook): CreditPack[] {
  const prices = creditPackPrices(book);
  return CREDIT_PACKS.map((pack) => {
    const live = prices.find((price) => price.id === pack.id);
    return live ? { ...pack, credits: live.credits, naira: live.naira } : pack;
  });
}

export { creditCosts };

/** Credits every new account starts with ("5 AI credits to get started" on the Starter plan). */
export const WELCOME_CREDITS = 5;

/**
 * Credits a paid plan adds to the balance each time it is paid. Monthly plans add the month's credits; annual plans
 * add twelve months' worth up front. `creditsPerMonth` is from Admin › Pricing › Plans (the tiers' defaults when
 * not given); the plan code can be any price the tier was ever sold at (shared/plan-catalog.ts).
 */
export function planCreditGrant(planCode: string | null | undefined, creditsPerMonth?: Partial<Record<PlanTier, number>>) {
  const version = planVersion(planCode);
  if (!version) return null;
  const perMonth = { ...defaultCreditsPerMonth(), ...creditsPerMonth };
  const credits = planCreditsPerPayment(planCode, perMonth)!;
  return { credits, label: `${PLAN_TIERS[version.tier].label} plan${version.billing === "annual" ? " (year)" : ""}` };
}

function defaultCreditsPerMonth() {
  return Object.fromEntries(Object.entries(PLAN_TIERS).map(([tier, info]) => [tier, info.defaults.creditsPerMonth])) as Record<PlanTier, number>;
}

/** Credits per request once the day's allowance is used: a picture costs more than a chat message. */
export const CREDIT_COST = { text: 1, speech: 1, voice: 2, image: 5, build: 15, video: 10 } as const;
export type CreditKind = keyof typeof CREDIT_COST;
export type CreditCosts = Record<CreditKind, number>;

/** Automatic charges allowed in 24 hours, so a runaway loop can't keep charging the card. */
export const AUTO_TOP_UP_PER_DAY = 3;

/** Paystack references for credit purchases start with this (the webhook routes them here). */
export const CREDIT_REFERENCE_PREFIX = "credits-";

export function creditPack(id: string | null | undefined, packs: CreditPack[] = CREDIT_PACKS): CreditPack | null {
  return packs.find((pack) => pack.id === id) ?? null;
}

export function creditCost(kind: CreditKind, units = 1, costs: CreditCosts = CREDIT_COST) {
  return costs[kind] * Math.max(1, Math.round(units));
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
export function shouldAutoTopUp(input: { autoTopUp: boolean; hasCard: boolean; packId: string | null | undefined; need: number; balance: number; autoChargesToday: number; packs?: CreditPack[] }) {
  const pack = creditPack(input.packId, input.packs);
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
