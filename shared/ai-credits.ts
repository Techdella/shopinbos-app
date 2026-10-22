// Shopinbos AI credits: one currency for sellers, suppliers and delivery partners. Every plan includes monthly credits
// (shared/plans.ts) that refill each month and don't carry over; anyone can buy packs, and bought credits last 12
// months. Each AI action costs a set number of credits, shown on its button before use; a failed generation is given
// back. With auto top-up on, the card saved from a purchase is charged for the chosen pack when credits run out.
// Pure, unit-tested in tests/behaviour.test.mjs; the money moves in src/lib/ai/credits.server.ts.
//
// The numbers here are the defaults. Live prices, credits and costs come from Admin › Pricing
// (shared/platform-pricing.ts): server code passes them in (creditPacksFrom, creditCosts) where it says so below.

import { creditCosts, creditPackPrices, type PriceBook } from "./platform-pricing.ts";
import type { PlanKey } from "./plans.ts";

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
  { id: "small", credits: 200, naira: 2_000, label: "Small" },
  { id: "medium", credits: 550, naira: 5_000, label: "Medium", badge: "Most popular" },
  { id: "large", credits: 1_200, naira: 10_000, label: "Large" },
  { id: "business", credits: 3_200, naira: 25_000, label: "Business", badge: "Best value" },
];

export const DEFAULT_AUTO_PACK = "medium";

/** Bought, welcome and refunded credits last this long; plan credits only to the end of the month. */
export const CREDIT_LIFETIME_MONTHS = 12;

/** The packs with this price book's credits and prices (labels and ribbons stay as above). */
export function creditPacksFrom(book: PriceBook): CreditPack[] {
  const prices = creditPackPrices(book);
  return CREDIT_PACKS.map((pack) => {
    const live = prices.find((price) => price.id === pack.id);
    return live ? { ...pack, credits: live.credits, naira: live.naira } : pack;
  });
}

export { creditCosts };

/** The signup bonus every new account gets (Admin › Pricing "credits.welcome"). */
export const WELCOME_CREDITS = 50;

/** The month plan credits are filled for ("2026-10", UTC). */
export function creditPeriod(now: Date) {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * The plan's credits after a read: a new month (or a first read) refills them to the plan's monthly amount, and a
 * change of plan mid-month sets them to the new plan's amount (an upgrade someone just paid for, or the smaller
 * amount after a plan ends). Nothing carries over.
 */
export function planFill(account: { period: string | null; key: string | null; credits: number }, plan: { key: PlanKey; monthly: number }, period: string) {
  if (account.period !== period || account.key !== plan.key) return { period, key: plan.key, credits: plan.monthly };
  return { period, key: plan.key, credits: account.credits };
}

/** What each kind of request costs when it isn't a named action. */
export const CREDIT_COST = { text: 1, speech: 1, voice: 2, image: 10, build: 20, video: 10 } as const;
export type CreditKind = keyof typeof CREDIT_COST;

/** Named actions and their default costs (the pricing table). Admin › Pricing has a setting for each. */
export const ACTION_COST = {
  product_copy: 2,
  seo: 1,
  bg_remove: 3,
  photo: 10,
  caption: 2,
  translate: 1,
  campaign: 10,
  chat_reply: 1,
  insights: 5,
  bulk_description: 1,
  auto_tag: 1,
  import_cleanup: 2,
  photo_cleanup: 3,
  inquiry_reply: 1,
  rate_card: 10,
  coverage_listing: 5,
  performance_report: 5,
  /** Rex designing something in the store builder (a menu, a section, a new layout): previews are free, applying it costs this. */
  store_design: 3,
} as const;
export type CreditAction = keyof typeof ACTION_COST;
export type CreditCosts = Record<string, number>;

export const DEFAULT_COSTS: CreditCosts = { ...CREDIT_COST, ...ACTION_COST };

/** The prices each kind of account sees on its credits page ("build" is AI store setup). */
export const COSTS_BY_ROLE: Record<"seller" | "supplier" | "logistics_partner", readonly string[]> = {
  seller: ["product_copy", "seo", "bg_remove", "photo", "caption", "translate", "build", "store_design", "campaign", "chat_reply", "insights", "voice", "video", "text"],
  supplier: ["bulk_description", "auto_tag", "import_cleanup", "photo_cleanup", "inquiry_reply", "text"],
  logistics_partner: ["rate_card", "coverage_listing", "chat_reply", "performance_report", "text"],
};

export function isCreditAction(value: unknown): value is CreditAction {
  return typeof value === "string" && value in ACTION_COST;
}

/** Credits for `units` of a kind or an action (store setup is the "build" kind). */
export function creditCost(kindOrAction: CreditKind | CreditAction, units = 1, costs: CreditCosts = DEFAULT_COSTS) {
  const each = costs[kindOrAction] ?? DEFAULT_COSTS[kindOrAction] ?? 1;
  return each * Math.max(1, Math.round(units));
}

/** Automatic charges allowed in 24 hours, so a runaway loop can't keep charging the card. */
export const AUTO_TOP_UP_PER_DAY = 3;

/** Paystack references for credit purchases start with this (the webhook routes them here). */
export const CREDIT_REFERENCE_PREFIX = "credits-";

export function creditPack(id: string | null | undefined, packs: CreditPack[] = CREDIT_PACKS): CreditPack | null {
  return packs.find((pack) => pack.id === id) ?? null;
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

/** Where each kind of account buys AI credits. */
export function creditsUrlFor(role: string | null | undefined) {
  return role === "supplier" ? "/supplier/credits" : role === "logistics_partner" ? "/logistics/credits" : "/home/credits";
}

/** The message when there aren't enough credits for an action. */
export function outOfCreditsMessage(cost: number, balance: number) {
  return `This needs ${cost} AI credit${cost === 1 ? "" : "s"} and you have ${balance}. Top up to carry on, or wait for your plan's credits to refill at the start of next month.`;
}
