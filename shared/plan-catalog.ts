// Subscription plans (Admin › Pricing › Plans, /admin/pricing/plans). The tiers and their perks are fixed here;
// their prices and monthly AI credits are managed by admins. A new price creates a new Paystack plan (Paystack plan
// amounts are per plan code), and every code ever used stays known: people subscribed at an older price keep
// their perks, credits and free domain on renewal (the webhook, src/lib/seller-plan.ts, src/lib/store-badges.ts).
// Pure and dependency-free, so tests/plan-catalog.test.mjs and every caller can load it.

export type PlanTier = "seller_growth" | "seller_pro" | "supplier_max";
export type PlanBilling = "monthly" | "annual";

export interface TierInfo {
  role: "seller" | "supplier";
  /** Default name; the billing pages translate it. */
  label: string;
  /** User.aiCredits while subscribed: picks the daily AI allowance and which plan the billing page shows as current. */
  marker: number;
  /** Intervals this tier is sold on. */
  billings: readonly PlanBilling[];
  /** Annual plans of this tier pay for the seller's domain. */
  freeDomainAnnual: boolean;
  /** May hide "Built with Shopinbos". */
  hideBadge: boolean;
  defaults: { monthlyNgn: number; annualNgn: number | null; creditsPerMonth: number };
}

export const PLAN_TIERS: Record<PlanTier, TierInfo> = {
  seller_growth: { role: "seller", label: "Growth", marker: 50, billings: ["monthly", "annual"], freeDomainAnnual: true, hideBadge: false, defaults: { monthlyNgn: 8_000, annualNgn: 80_000, creditsPerMonth: 50 } },
  seller_pro: { role: "seller", label: "Seller Pro", marker: 200, billings: ["monthly", "annual"], freeDomainAnnual: true, hideBadge: true, defaults: { monthlyNgn: 18_000, annualNgn: 180_000, creditsPerMonth: 200 } },
  supplier_max: { role: "supplier", label: "Supplier Max", marker: 100, billings: ["monthly"], freeDomainAnnual: false, hideBadge: false, defaults: { monthlyNgn: 25_000, annualNgn: null, creditsPerMonth: 100 } },
};
export const PLAN_TIER_KEYS = Object.keys(PLAN_TIERS) as PlanTier[];

/** User.aiCredits after a plan ends (the Starter plan's marker). */
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

/** The Paystack plans that existed before plans were managed from admin. */
export const BUILTIN_PLAN_VERSIONS: readonly PlanVersion[] = [
  { code: "PLN_8ou289e71czicvm", tier: "seller_growth", billing: "monthly", amountNgn: 8_000, current: true },
  { code: "PLN_q1k3ssxpx7rxxuz", tier: "seller_growth", billing: "annual", amountNgn: 80_000, current: true },
  { code: "PLN_2gph11w3yd0250y", tier: "seller_pro", billing: "monthly", amountNgn: 18_000, current: true },
  { code: "PLN_9gma70ofldhbj4r", tier: "seller_pro", billing: "annual", amountNgn: 180_000, current: true },
  { code: "PLN_q78304vgj7p35o6", tier: "supplier_max", billing: "monthly", amountNgn: 25_000, current: true },
  { code: "PLN_0a6z6ns429ohli1", tier: "supplier_max", billing: "annual", amountNgn: null, current: false },
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

/** Credits one payment adds: the tier's monthly credits, twelve months' worth for an annual plan. */
export function planCreditsPerPayment(code: string | null | undefined, creditsPerMonth: Record<PlanTier, number>) {
  const version = planVersion(code);
  if (!version) return null;
  const monthly = creditsPerMonth[version.tier] ?? PLAN_TIERS[version.tier].defaults.creditsPerMonth;
  return version.billing === "annual" ? monthly * 12 : monthly;
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

/** The Paystack plan name for a new price ("Shopinbos Seller Pro (annual) ₦200,000"). */
export function paystackPlanName(tier: PlanTier, billing: PlanBilling, amountNgn: number) {
  return `Shopinbos ${PLAN_TIERS[tier].label} (${billing}) ₦${amountNgn.toLocaleString("en-NG")}`;
}
