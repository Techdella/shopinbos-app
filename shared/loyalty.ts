// Loyalty tiers for sellers, suppliers and delivery partners, on top of the rewards levels (src/lib/rewards/rules.ts:
// levels 1–6 from XP). Pure and unit-tested (tests/loyalty.test.mjs); the monthly perks, level-up messages and
// anniversary gifts are sent by src/lib/member-messaging/loyalty.server.ts. Perks are AI credits, never cash.

export type TierKey = "bronze" | "silver" | "gold" | "platinum";

export interface LoyaltyTier {
  key: TierKey;
  name: string;
  /** Rewards levels in this tier. */
  levels: readonly number[];
  /** Free AI credits each month while they're in this tier. */
  monthlyCredits: number;
  perks: string[];
  color: string;
}

export const LOYALTY_TIERS: LoyaltyTier[] = [
  { key: "bronze", name: "Bronze", levels: [1, 2], monthlyCredits: 0, perks: ["Weekly tips from Rex & Peggy", "Refer & earn rewards"], color: "#B0763B" },
  { key: "silver", name: "Silver", levels: [3], monthlyCredits: 25, perks: ["25 free AI credits every month", "Everything in Bronze"], color: "#8E9AA6" },
  { key: "gold", name: "Gold", levels: [4, 5], monthlyCredits: 75, perks: ["75 free AI credits every month", "Early access to new features", "Everything in Silver"], color: "#D9A21B" },
  { key: "platinum", name: "Platinum", levels: [6], monthlyCredits: 150, perks: ["150 free AI credits every month", "Everything in Gold"], color: "#4A6B8A" },
];

export function tierForLevel(level: number): LoyaltyTier {
  return LOYALTY_TIERS.find((tier) => tier.levels.includes(level)) ?? (level > 6 ? LOYALTY_TIERS[3] : LOYALTY_TIERS[0]);
}

/** The next tier up and the level that reaches it, or null at Platinum. */
export function nextTier(level: number): { tier: LoyaltyTier; atLevel: number } | null {
  const index = LOYALTY_TIERS.indexOf(tierForLevel(level));
  const next = LOYALTY_TIERS[index + 1];
  return next ? { tier: next, atLevel: next.levels[0] } : null;
}

/** Everyone who joined before Shopinbos's first full month is a founding member (a badge for good). */
export const FOUNDING_BEFORE = "2026-12-01T00:00:00+01:00";

export function isFoundingMember(createdAt: Date | string) {
  return new Date(createdAt).getTime() < new Date(FOUNDING_BEFORE).getTime();
}

/** AI credits on each account anniversary. */
export const ANNIVERSARY_CREDITS = 100;

/**
 * The anniversary (1, 2, …) that falls in the week up to `now`, or null. A week's grace so a missed run still
 * finds it; the send log makes sure each year is given once.
 */
export function anniversaryDue(createdAt: Date | string, now: Date): number | null {
  const joined = new Date(createdAt);
  const years = now.getUTCFullYear() - joined.getUTCFullYear();
  if (years < 1) return null;
  const day = new Date(Date.UTC(now.getUTCFullYear(), joined.getUTCMonth(), joined.getUTCDate(), joined.getUTCHours()));
  const since = now.getTime() - day.getTime();
  return since >= 0 && since < 7 * 86_400_000 ? years : null;
}

/** The loyalty part of the rewards screen. */
export function loyaltyView(level: number, createdAt: Date | string) {
  const tier = tierForLevel(level);
  const next = nextTier(level);
  return {
    tier: tier.key,
    tierName: tier.name,
    color: tier.color,
    monthlyCredits: tier.monthlyCredits,
    perks: tier.perks,
    next: next ? { tierName: next.tier.name, atLevel: next.atLevel, monthlyCredits: next.tier.monthlyCredits } : null,
    founding: isFoundingMember(createdAt),
  };
}

export type LoyaltyView = ReturnType<typeof loyaltyView>;
