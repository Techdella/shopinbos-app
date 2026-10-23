// Refer & earn: sellers, suppliers and delivery partners invite other businesses with their own link
// (app.shopinbos.com/r/CODE). The person who joins gets a welcome gift straight away; the one who invited them is
// rewarded when the new account counts ("qualifies"): free months on their plan or AI credits, their choice. Never
// cash. Pure and unit-tested (tests/referrals.test.mjs); the database side is src/lib/referrals/service.server.ts.

export type ReferralRole = "seller" | "supplier" | "logistics_partner";
export const REFERRAL_ROLES: readonly ReferralRole[] = ["seller", "supplier", "logistics_partner"];

/** The paid plan a free month unlocks, per role (the first paid tier). */
export const GRANT_TIER: Record<ReferralRole, "seller_starter" | "supplier_plus" | "logistics_plus"> = {
  seller: "seller_starter",
  supplier: "supplier_plus",
  logistics_partner: "logistics_plus",
};

export interface ReferralOffer {
  /** Who is being invited. */
  role: ReferralRole;
  /** "a supplier", for sentences. */
  noun: string;
  /** What the person who invited them gets when it counts: months free, or credits. */
  referrerMonths: number;
  referrerCredits: number;
  /** What the new account gets on joining. */
  welcomeMonths: number;
  welcomeCredits: number;
  welcomeFeaturedWeeks: number;
  /** When it counts, in words. */
  rule: string;
}

export const REFERRAL_OFFERS: Record<ReferralRole, ReferralOffer> = {
  supplier: {
    role: "supplier",
    noun: "a supplier",
    referrerMonths: 3,
    referrerCredits: 500,
    welcomeMonths: 1,
    welcomeCredits: 0,
    welcomeFeaturedWeeks: 1,
    rule: "They're verified and have 5 approved products",
  },
  seller: {
    role: "seller",
    noun: "a seller",
    referrerMonths: 1,
    referrerCredits: 200,
    welcomeMonths: 1,
    welcomeCredits: 100,
    welcomeFeaturedWeeks: 0,
    rule: "Their shop is live and gets its first paid order",
  },
  logistics_partner: {
    role: "logistics_partner",
    noun: "a delivery partner",
    referrerMonths: 2,
    referrerCredits: 300,
    welcomeMonths: 1,
    welcomeCredits: 0,
    welcomeFeaturedWeeks: 0,
    rule: "They're verified and complete their first delivery",
  },
};

export const PLAN_LABEL: Record<ReferralRole, string> = { seller: "Starter", supplier: "Supplier Plus", logistics_partner: "Logistics Plus" };

/** Rewarded referrals per person per 12 months, free months that can stack up ahead, and how long a referral has to count. */
export const REFERRAL_LIMITS = { rewardsPerYear: 10, maxMonthsAhead: 12, qualifyWithinDays: 120, attributeWithinDays: 7 } as const;

/** Milestones (qualified referrals): a badge, a bonus, and Ambassador. */
export const REFERRAL_MILESTONES = [
  { count: 3, label: "Ambassador badge", bonusMonths: 0, bonusCredits: 0 },
  { count: 5, label: "1 extra month free", bonusMonths: 1, bonusCredits: 200 },
  { count: 10, label: "Shopinbos Ambassador: early features and a featured spot", bonusMonths: 0, bonusCredits: 0 },
] as const;

export type RewardChoice = "months" | "credits";

export function asReferralRole(value: unknown): ReferralRole | null {
  return value === "seller" || value === "supplier" || value === "logistics_partner" ? value : null;
}

export function asRewardChoice(value: unknown): RewardChoice {
  return value === "credits" ? "credits" : "months";
}

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** A short, readable code from the business name: "ADA" + 3 characters ("ADA7KQ"). `random` returns 0..1. */
export function makeReferralCode(name: string | null | undefined, random: () => number = Math.random) {
  const letters = (name ?? "")
    .normalize("NFD")
    .replace(/[^A-Za-z]/g, "")
    .toUpperCase()
    .replace(/[IO]/g, "")
    .slice(0, 4);
  const prefix = letters.length >= 2 ? letters : "SIB";
  let tail = "";
  for (let i = 0; i < 3; i++) tail += CODE_ALPHABET[Math.floor(random() * CODE_ALPHABET.length) % CODE_ALPHABET.length];
  return `${prefix}${tail}`;
}

/** Codes are typed by people: case and spaces don't matter. */
export function cleanReferralCode(value: unknown) {
  if (typeof value !== "string") return null;
  const code = value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  return code.length >= 4 && code.length <= 16 ? code : null;
}

export interface QualifyFacts {
  verified: boolean;
  suspended: boolean;
  approvedProducts: number;
  liveShop: boolean;
  paidOrders: number;
  completedDeliveries: number;
}

/** Has the new account done enough to count? */
export function qualifies(role: ReferralRole, facts: QualifyFacts) {
  if (facts.suspended) return false;
  if (role === "supplier") return facts.verified && facts.approvedProducts >= 5;
  if (role === "seller") return facts.liveShop && facts.paidOrders >= 1;
  return facts.verified && facts.completedDeliveries >= 1;
}

/** How far they are, for the referrer's list ("3 of 5 products"). */
export function progressText(role: ReferralRole, facts: QualifyFacts) {
  if (role === "supplier") {
    if (!facts.verified) return `Getting verified · ${Math.min(facts.approvedProducts, 5)} of 5 products`;
    return `${Math.min(facts.approvedProducts, 5)} of 5 approved products`;
  }
  if (role === "seller") return facts.liveShop ? "Shop is live · waiting for the first paid order" : "Setting up their shop";
  return facts.verified ? "Verified · waiting for the first delivery" : "Getting verified";
}

export interface Party {
  id: string;
  email: string | null;
  phone: string | null;
}

const digits = (value: string | null) => (value ?? "").replace(/\D/g, "").slice(-10);

/** Reasons a referral can't count (the same person on both sides). Empty when it looks fine. */
export function selfReferralReasons(referrer: Party, referee: Party) {
  const reasons: string[] = [];
  if (referrer.id === referee.id) reasons.push("Same account");
  if (referrer.email && referee.email && referrer.email.trim().toLowerCase() === referee.email.trim().toLowerCase()) reasons.push("Same email");
  if (digits(referrer.phone).length >= 10 && digits(referrer.phone) === digits(referee.phone)) reasons.push("Same phone number");
  return reasons;
}

/**
 * What the referrer actually gets. People who pay by card can't be given free months (Paystack charges the card on
 * its own date), so they get the credits instead.
 */
export function referrerReward(offer: ReferralOffer, choice: RewardChoice, paying: boolean): { months: number; credits: number } {
  if (choice === "months" && !paying) return { months: offer.referrerMonths, credits: 0 };
  return { months: 0, credits: offer.referrerCredits };
}

/** The milestone reached by this many qualified referrals (only the exact count, so it's given once). */
export function milestoneAt(count: number) {
  return REFERRAL_MILESTONES.find((milestone) => milestone.count === count) ?? null;
}

/** May this referral still be rewarded, given how many were rewarded in the last 12 months? */
export function underYearlyCap(rewardedLastYear: number) {
  return rewardedLastYear < REFERRAL_LIMITS.rewardsPerYear;
}

const DAY = 86_400_000;

function addMonths(date: Date, months: number) {
  const next = new Date(date);
  next.setUTCMonth(next.getUTCMonth() + months);
  return next;
}

/**
 * The new end of someone's free plan time: months are added after any free time already running, never more than
 * 12 months ahead of now. Returns null when nothing more fits.
 */
export function extendGrant(currentEnd: Date | null, months: number, now: Date): { startsAt: Date; endsAt: Date } | null {
  const start = currentEnd && currentEnd > now ? currentEnd : now;
  const cap = addMonths(now, REFERRAL_LIMITS.maxMonthsAhead);
  const end = addMonths(start, months);
  const endsAt = end > cap ? cap : end;
  if (endsAt.getTime() - start.getTime() < DAY) return null;
  return { startsAt: start, endsAt };
}

/** "3 months free" / "500 AI credits". */
export function rewardText(reward: { months: number; credits: number }) {
  const parts: string[] = [];
  if (reward.months) parts.push(`${reward.months} month${reward.months === 1 ? "" : "s"} free`);
  if (reward.credits) parts.push(`${reward.credits.toLocaleString("en-NG")} AI credits`);
  return parts.join(" + ") || "nothing";
}

/** What the new account gets, in words ("1 month of Supplier Plus free + 1 featured week"). */
export function welcomeText(role: ReferralRole) {
  const offer = REFERRAL_OFFERS[role];
  const parts: string[] = [];
  if (offer.welcomeMonths) parts.push(`${offer.welcomeMonths} month${offer.welcomeMonths === 1 ? "" : "s"} of ${PLAN_LABEL[role]} free`);
  if (offer.welcomeCredits) parts.push(`${offer.welcomeCredits} AI credits`);
  if (offer.welcomeFeaturedWeeks) parts.push(`${offer.welcomeFeaturedWeeks} featured week${offer.welcomeFeaturedWeeks === 1 ? "" : "s"} in the marketplace`);
  return parts.join(" + ");
}

/** The sign-up page for an invited role. */
export function signupPath(role: ReferralRole) {
  return role === "supplier" ? "/supplier/signup" : role === "logistics_partner" ? "/logistics/signup" : "/signup";
}

/** The referral cookie: set by /r/CODE, read once the account exists. */
export const REFERRAL_COOKIE = "sib_ref";
export const REFERRAL_COOKIE_DAYS = 30;
