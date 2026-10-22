// Subscription plans (Admin › Pricing › Plans, /admin/pricing/plans). The tiers are fixed here and what they
// include is in shared/plans.ts; their prices and monthly AI credits are managed by admins. A new price creates a new
// Paystack plan (Paystack plan amounts are per plan code), and every code ever used stays known: people subscribed
// at an older price keep their plan on renewal (the webhook, src/lib/seller-plan.ts, src/lib/store-badges.ts).
// Pure and dependency-free, so tests/plan-catalog.test.mjs and every caller can load it.
//
// October 2026 pricing: the old Growth (₦8,000) and Seller Pro (₦18,000) plans became Starter and Growth, and
// Supplier Max became Supplier Pro. Their Paystack codes keep working; Admin › Pricing › Plans moves those
// subscribers onto the new prices (Paystack updates the plan amount for existing subscriptions).

import { PLAN_MARKERS, SELLER_PLANS, monthlyCreditsFor, type PlanKey } from "./plans.ts";

export type PlanTier = "seller_starter" | "seller_growth" | "seller_pro" | "supplier_plus" | "supplier_pro" | "logistics_plus" | "logistics_pro";
export type PlanBilling = "monthly" | "annual";

export interface TierInfo {
  role: "seller" | "supplier" | "logistics_partner";
  /** Default name; the billing pages translate it. */
  label: string;
  /** User.aiCredits while subscribed: which plan someone is on (shared/plans.ts). Not a balance. */
  marker: number;
  /** Intervals this tier is sold on. */
  billings: readonly PlanBilling[];
  /** Annual plans of this tier pay for the seller's domain. */
  freeDomainAnnual: boolean;
  /** May hide "Built with Shopinbos". */
  hideBadge: boolean;
  defaults: { monthlyNgn: number; annualNgn: number | null; creditsPerMonth: number };
}

function tier(key: PlanTier, role: TierInfo["role"], label: string, monthlyNgn: number, annualNgn: number, extra: Partial<TierInfo> = {}): TierInfo {
  return {
    role,
    label,
    marker: PLAN_MARKERS[key],
    billings: ["monthly", "annual"],
    freeDomainAnnual: false,
    hideBadge: false,
    defaults: { monthlyNgn, annualNgn, creditsPerMonth: monthlyCreditsFor(key as PlanKey) },
    ...extra,
  };
}

// Yearly = ten months (two months free).
export const PLAN_TIERS: Record<PlanTier, TierInfo> = {
  seller_starter: tier("seller_starter", "seller", "Starter", 6_000, 60_000, { freeDomainAnnual: true }),
  seller_growth: tier("seller_growth", "seller", "Growth", 18_000, 180_000, { freeDomainAnnual: true }),
  seller_pro: tier("seller_pro", "seller", "Pro", 40_000, 400_000, { freeDomainAnnual: true, hideBadge: SELLER_PLANS.seller_pro.hideBadge }),
  supplier_plus: tier("supplier_plus", "supplier", "Supplier Plus", 10_000, 100_000),
  supplier_pro: tier("supplier_pro", "supplier", "Supplier Pro", 30_000, 300_000),
  logistics_plus: tier("logistics_plus", "logistics_partner", "Logistics Plus", 8_000, 80_000),
  logistics_pro: tier("logistics_pro", "logistics_partner", "Logistics Pro", 25_000, 250_000),
};
export const PLAN_TIER_KEYS = Object.keys(PLAN_TIERS) as PlanTier[];

export function isPlanTier(value: unknown): value is PlanTier {
  return typeof value === "string" && value in PLAN_TIERS;
}

/** The tier names before October 2026, as stored on old SubscriptionPlanVersion rows, and what they became. */
export const LEGACY_TIERS: Record<string, PlanTier> = { seller_growth: "seller_starter", seller_pro: "seller_growth", supplier_max: "supplier_pro" };

/** User.aiCredits after a plan ends (every free plan's marker). */
export const FREE_PLAN_MARKER = 5;

export interface PlanVersion {
  code: string;
  tier: PlanTier;
  billing: PlanBilling;
  /** What Paystack charges for it; null when we never sold it here (an old code we still honour). */
  amountNgn: number | null;
  /** The one sold today for this tier and interval. */
  current: boolean;
}

/**
 * The Paystack plans that existed before plans were managed from admin, under the tiers they belong to now. Their
 * amounts are what Paystack charged before the October 2026 move; Admin › Pricing › Plans updates them.
 */
export const BUILTIN_PLAN_VERSIONS: readonly PlanVersion[] = [
  { code: "PLN_8ou289e71czicvm", tier: "seller_starter", billing: "monthly", amountNgn: 8_000, current: true },
  { code: "PLN_q1k3ssxpx7rxxuz", tier: "seller_starter", billing: "annual", amountNgn: 80_000, current: true },
  { code: "PLN_2gph11w3yd0250y", tier: "seller_growth", billing: "monthly", amountNgn: 18_000, current: true },
  { code: "PLN_9gma70ofldhbj4r", tier: "seller_growth", billing: "annual", amountNgn: 180_000, current: true },
  { code: "PLN_q78304vgj7p35o6", tier: "supplier_pro", billing: "monthly", amountNgn: 25_000, current: true },
  { code: "PLN_0a6z6ns429ohli1", tier: "supplier_pro", billing: "annual", amountNgn: null, current: false },
];

// Plans created from admin, added by the server when it loads the catalog (src/lib/plans/catalog.server.ts).
// On globalThis so every copy of this module sees them.
const registry = globalThis as typeof globalThis & { __shopinbosPlanVersions?: Map<string, PlanVersion> };

export function registerPlanVersions(versions: readonly PlanVersion[]) {
  const map = new Map<string, PlanVersion>();
  for (const version of versions) map.set(version.code, version);
  registry.__shopinbosPlanVersions = map;
}

/** A plan code's tier and interval: a built-in code, or one created from admin (once the server has loaded them). */
export function planVersion(code: string | null | undefined): PlanVersion | null {
  if (!code) return null;
  return registry.__shopinbosPlanVersions?.get(code) ?? BUILTIN_PLAN_VERSIONS.find((version) => version.code === code) ?? null;
}

export function planTierOf(code: string | null | undefined): PlanTier | null {
  return planVersion(code)?.tier ?? null;
}

/** User.aiCredits for someone subscribed on this code (null: not a plan we know). */
export function planMarker(code: string | null | undefined): number | null {
  const tier = planTierOf(code);
  return tier ? PLAN_TIERS[tier].marker : null;
}

/** A tier as the billing pages need it (plain JSON for client components). */
export interface PlanOfferView {
  monthly: { code: string; amountNgn: number } | null;
  annual: { code: string; amountNgn: number } | null;
  creditsPerMonth: number;
}

/** "₦6,667/mo" and how many months an annual plan saves against paying monthly (null: no saving to show). */
export function annualSaving(monthlyNgn: number, annualNgn: number) {
  const perMonth = Math.round(annualNgn / 12);
  const months = Math.round((12 - annualNgn / monthlyNgn) * 10) / 10;
  return months > 0 ? { perMonth, months } : null;
}

/** A plan amount an admin may set: whole naira from ₦100 to ₦10m. */
export function cleanPlanAmount(raw: unknown): number | null {
  const value = typeof raw === "number" ? raw : typeof raw === "string" && raw.trim() ? Number(raw.replace(/[,\s₦]/g, "")) : NaN;
  return Number.isInteger(value) && value >= 100 && value <= 10_000_000 ? value : null;
}

export function cleanPlanCredits(raw: unknown): number | null {
  const value = typeof raw === "number" ? raw : typeof raw === "string" && raw.trim() ? Number(raw.replace(/[,\s]/g, "")) : NaN;
  return Number.isInteger(value) && value >= 0 && value <= 100_000 ? value : null;
}

/** The Paystack plan name for a new price ("Shopinbos Pro (annual) ₦400,000"). */
export function paystackPlanName(tier: PlanTier, billing: PlanBilling, amountNgn: number) {
  return `Shopinbos ${PLAN_TIERS[tier].label} (${billing}) ₦${amountNgn.toLocaleString("en-NG")}`;
}

/**
 * Paystack changes needed to put every subscriber on today's prices: each known code of a tier and interval whose
 * amount isn't the tier's current price. `subscribers` counts active subscribers per code.
 */
export function priceMoves(versions: readonly PlanVersion[], current: (tier: PlanTier, billing: PlanBilling) => number | null, subscribers: Map<string, number>) {
  const moves: Array<{ code: string; tier: PlanTier; billing: PlanBilling; fromNgn: number | null; toNgn: number; subscribers: number }> = [];
  for (const version of versions) {
    const target = current(version.tier, version.billing);
    if (target === null || version.amountNgn === target) continue;
    const count = subscribers.get(version.code) ?? 0;
    // A code nobody is on doesn't need moving (and an old one we never priced stays as it is).
    if (!count && !version.current) continue;
    moves.push({ code: version.code, tier: version.tier, billing: version.billing, fromNgn: version.amountNgn, toNgn: target, subscribers: count });
  }
  return moves;
}
