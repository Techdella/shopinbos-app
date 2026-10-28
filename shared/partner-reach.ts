// Delivery partner tiers control reach, not cash (the owner's WP-1 decisions, Oct 2026). Pure, no "@/" imports, shared
// by checkout and job matching (shared/delivery-market.ts quoteFor, rankScore), the server (src/lib/logistics/
// partner-reach.server.ts), the web and phone level screens and the admin. Unit-tested in tests/partner-reach.test.mjs.
//
//   Tier 1  Verified      ID + selfie passed       prepaid and pay-on-delivery jobs in their areas
//   Tier 2  Trusted       50 delivered, 4.3+, <2% failed, base verified
//                                                  interstate jobs, a higher place in shops' rider lists
//   Tier 3  Top partner   150 delivered, 60+ days, CAC or a guarantor
//                                                  high-value parcels, can apply to be featured, faster payouts (a
//                                                  perk flag only: payouts are Paystack instant splits, so it shows
//                                                  "coming soon" until a payout queue exists)
//
// The tiers are LogisticsPartner.level (verified | trusted | cash_trusted, worked out in shared/dropship-rules.ts
// partnerLevel). They are not the verification tiers of shared/partner-tiers.ts: those carry the new-partner safety
// limits (₦50,000 per order, 5 open jobs, Admin › Logistics partners › Safety limits), which stay as they are.

import type { PartnerLevel } from "./dropship-rules.ts";
import { guessProductType } from "./product-types.ts";

const LEVELS = ["verified", "trusted", "cash_trusted"] as const;
const levelOf = (value: unknown): PartnerLevel => ((LEVELS as readonly string[]).includes(String(value)) ? (value as PartnerLevel) : "verified");

// ─── What each tier unlocks ──────────────────────────────────────────────────

export interface LevelPerks {
  /** Prepaid jobs in their areas (every verified partner). */
  prepaid: boolean;
  /** Pay-on-delivery jobs (riders never hold the cash; the pay-on-delivery rules decide the rest). */
  payOnDelivery: boolean;
  /** Jobs that cross a state line. */
  interstate: boolean;
  /** Added to the partner's score in shops' rider lists and job matching. */
  rankBoost: number;
  /** Parcels over the high-value threshold or in a high-value category. */
  highValue: boolean;
  /** Can ask the team to be featured. */
  canApplyFeatured: boolean;
  /** Priority in a manual payout queue. There is none yet (instant splits), so the UI says "coming soon". */
  fasterPayouts: boolean;
}

export const PARTNER_LEVEL_PERKS: Record<PartnerLevel, LevelPerks> = {
  verified: { prepaid: true, payOnDelivery: true, interstate: false, rankBoost: 0, highValue: false, canApplyFeatured: false, fasterPayouts: false },
  trusted: { prepaid: true, payOnDelivery: true, interstate: true, rankBoost: 15, highValue: false, canApplyFeatured: false, fasterPayouts: false },
  cash_trusted: { prepaid: true, payOnDelivery: true, interstate: true, rankBoost: 25, highValue: true, canApplyFeatured: true, fasterPayouts: true },
};

/** Payouts are Paystack instant splits: there's no payout queue to put Top partners first in yet. */
export const FASTER_PAYOUTS_LIVE = false;

export const levelPerks = (level: unknown): LevelPerks => PARTNER_LEVEL_PERKS[levelOf(level)];
export const canTakeInterstate = (level: unknown) => levelPerks(level).interstate;
export const canTakeHighValue = (level: unknown) => levelPerks(level).highValue;

/** The first tier that unlocks interstate / high-value (for "Unlocks at Trusted"). */
export const INTERSTATE_LEVEL: PartnerLevel = "trusted";
export const HIGH_VALUE_LEVEL: PartnerLevel = "cash_trusted";

/** What each tier adds, in ladder order, as keys the UI words (reach.unlock.<key>). */
export const TIER_UNLOCKS: Record<PartnerLevel, readonly string[]> = {
  verified: ["prepaid", "payOnDelivery"],
  trusted: ["interstate", "ranking"],
  cash_trusted: ["highValue", "featured", "fasterPayouts"],
};

/** English words for the unlock keys (the web admin and anything without a catalog). */
export const UNLOCK_WORDS: Record<string, string> = {
  prepaid: "Prepaid jobs in your areas",
  payOnDelivery: "Pay-on-delivery jobs in your areas",
  interstate: "Interstate jobs",
  ranking: "A higher place in shops' rider lists",
  highValue: "High-value parcels (phones, laptops, gold)",
  featured: "Apply to be featured",
  fasterPayouts: "Faster payouts (coming soon)",
};

/** Featured partners first, then by tier: what shops' rider lists and job matching add to a partner's score. */
export const FEATURED_RANK_BOOST = 20;
export function reachRankBoost(partner: { level?: string | null; featured?: boolean | null }) {
  return levelPerks(partner.level).rankBoost + (partner.featured ? FEATURED_RANK_BOOST : 0);
}

// ─── Interstate ──────────────────────────────────────────────────────────────

/**
 * A partner who offers interstate below Trusted keeps the switch, but interstate jobs don't route to them. True when
 * they should be told so (once: LogisticsPartner.interstateNoticeAt).
 */
export function interstateGated(partner: { services: readonly string[]; level?: string | null; verificationStatus?: string | null }) {
  return partner.services.includes("interstate") && !canTakeInterstate(partner.level) && (partner.verificationStatus ?? "verified") === "verified";
}

// ─── High-value parcels ──────────────────────────────────────────────────────

/** Admin › Logistics partners › Reach rules (PlatformSetting "logistics.high_value"). */
export interface HighValueRules {
  /** An order worth more than this (naira) is high-value. */
  minOrderValue: number;
  /** Product types (shared/product-types.ts) that are always high-value. */
  productTypes: string[];
  /** Words in a product's name that make it high-value whatever its type (laptops have no type of their own). */
  keywords: string[];
}

export const HIGH_VALUE_KEY = "logistics.high_value";

export const DEFAULT_HIGH_VALUE_RULES: HighValueRules = {
  minOrderValue: 150_000,
  productTypes: ["phones", "jewellery"],
  keywords: ["laptop", "macbook", "chromebook"],
};

const record = (value: unknown): Record<string, unknown> => (value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {});

function words(value: unknown): string[] {
  const list = Array.isArray(value) ? value : typeof value === "string" ? value.split(/[,\n]/) : [];
  const out: string[] = [];
  for (const entry of list) {
    const word = String(entry ?? "").trim().toLowerCase().replace(/\s+/g, " ").slice(0, 40);
    if (word && !out.includes(word)) out.push(word);
  }
  return out.slice(0, 50);
}

/** Saved rules, with defaults for anything missing or out of range. */
export function readHighValueRules(value: unknown): HighValueRules {
  const v = record(value);
  const raw = typeof v.minOrderValue === "number" ? v.minOrderValue : Number(String(v.minOrderValue ?? "").replace(/[₦,\s]/g, ""));
  const minOrderValue = Number.isFinite(raw) && String(v.minOrderValue ?? "").trim() !== "" ? Math.round(Math.min(1_000_000_000, Math.max(1_000, raw))) : DEFAULT_HIGH_VALUE_RULES.minOrderValue;
  return {
    minOrderValue,
    productTypes: "productTypes" in v ? words(v.productTypes) : [...DEFAULT_HIGH_VALUE_RULES.productTypes],
    keywords: "keywords" in v ? words(v.keywords) : [...DEFAULT_HIGH_VALUE_RULES.keywords],
  };
}

export interface ParcelLine {
  /** StoreProduct.productType (null: guessed from the name). */
  productType?: string | null;
  name?: string | null;
}

export type HighValueReason = "value" | "category";

/** Is this order (or parcel) high-value? Over the threshold, or any line in a high-value type or named like one. */
export function highValueReason(input: { orderValue: number; lines: readonly ParcelLine[] }, rules: HighValueRules = DEFAULT_HIGH_VALUE_RULES): HighValueReason | null {
  if ((Number(input.orderValue) || 0) > rules.minOrderValue) return "value";
  for (const line of input.lines) {
    const name = String(line.name ?? "").toLowerCase();
    const type = (line.productType && line.productType !== "other" ? line.productType : guessProductType(name)) ?? null;
    if (type && rules.productTypes.includes(type)) return "category";
    if (name && rules.keywords.some((word) => new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(name))) return "category";
  }
  return null;
}

export const isHighValueParcel = (input: { orderValue: number; lines: readonly ParcelLine[] }, rules?: HighValueRules) => highValueReason(input, rules) !== null;

export const HIGH_VALUE_PARTNER_MESSAGE = "This is a high-value parcel. Only Top partners (Tier 3) can carry it. Pick a Top partner.";

// ─── Featured partners ───────────────────────────────────────────────────────

export const FEATURED_STATUSES = ["none", "applied", "featured", "rejected"] as const;
export type FeaturedStatus = (typeof FEATURED_STATUSES)[number];
export const featuredStatusOf = (value: unknown): FeaturedStatus => ((FEATURED_STATUSES as readonly string[]).includes(String(value)) ? (value as FeaturedStatus) : "none");

/** Featured right now: approved, and still a Top partner (dropping a tier takes the badge away until they're back). */
export const isFeaturedNow = (partner: { level?: string | null; featuredStatus?: string | null }) =>
  featuredStatusOf(partner.featuredStatus) === "featured" && levelPerks(partner.level).canApplyFeatured;

export type FeaturedApplyProblem = "not_top" | "applied" | "featured";

/** Why this partner can't apply to be featured now, or null. A turned-down partner may apply again. */
export function featuredApplyProblem(partner: { level?: string | null; featuredStatus?: string | null }): FeaturedApplyProblem | null {
  if (!levelPerks(partner.level).canApplyFeatured) return "not_top";
  const status = featuredStatusOf(partner.featuredStatus);
  if (status === "applied") return "applied";
  if (status === "featured") return "featured";
  return null;
}

export const FEATURED_PROBLEM_WORDS: Record<FeaturedApplyProblem, string> = {
  not_top: "Featured is for Top partners (Tier 3). Keep delivering to get there.",
  applied: "You've applied. The team will look at it soon.",
  featured: "You're already featured.",
};

// ─── "Earned this week · paid on <day>" ──────────────────────────────────────

const LAGOS_OFFSET_MS = 60 * 60 * 1000;
const DAY_MS = 86_400_000;

/**
 * When delivery fees reach the partner's bank: fees are split to them at checkout and the gateway settles the next
 * working day, so money earned today lands on the next weekday (Lagos). One place to change when payouts move to a
 * weekly run. `weekday` is 0 = Sunday.
 */
export function nextPayoutDay(now: Date = new Date()): { date: string; weekday: number } {
  const lagos = new Date(now.getTime() + LAGOS_OFFSET_MS);
  let day = new Date(Date.UTC(lagos.getUTCFullYear(), lagos.getUTCMonth(), lagos.getUTCDate()) + DAY_MS);
  while (day.getUTCDay() === 0 || day.getUTCDay() === 6) day = new Date(day.getTime() + DAY_MS);
  return { date: day.toISOString().slice(0, 10), weekday: day.getUTCDay() };
}

/** Monday 00:00 Lagos of the week `now` is in (as a UTC instant): "this week" for earnings. */
export function lagosWeekStart(now: Date = new Date()): Date {
  const lagos = new Date(now.getTime() + LAGOS_OFFSET_MS);
  const midnight = Date.UTC(lagos.getUTCFullYear(), lagos.getUTCMonth(), lagos.getUTCDate());
  const sinceMonday = (lagos.getUTCDay() + 6) % 7;
  return new Date(midnight - sinceMonday * DAY_MS - LAGOS_OFFSET_MS);
}

export const WEEKDAY_WORDS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;
