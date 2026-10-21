// What each plan includes: the one table behind the billing pages, the plan limits the app enforces, the fees taken
// at checkout and the monthly AI credits (Shopinbos pricing, October 2026). Prices live in shared/plan-catalog.ts
// (Admin › Pricing › Plans); everything a plan unlocks lives here. Pure, unit-tested in tests/plans.test.mjs.
//
// "null" means unlimited. Percentages are of the amount the fee is charged on (the sale, the wholesale price, the
// delivery fee).

export type PlanRole = "seller" | "supplier" | "logistics_partner";

export type SellerPlanKey = "seller_free" | "seller_starter" | "seller_growth" | "seller_pro";
export type SupplierPlanKey = "supplier_free" | "supplier_plus" | "supplier_pro";
export type LogisticsPlanKey = "logistics_free" | "logistics_plus" | "logistics_pro";
export type PlanKey = SellerPlanKey | SupplierPlanKey | LogisticsPlanKey;

export interface SellerLimits {
  /** Shopinbos's fee on each store sale paid online (not charged on delivery or on dropship lines). */
  transactionFeePct: number;
  products: number | null;
  customDomain: boolean;
  themes: "basic" | "premium" | "all" | "all_seasonal";
  staff: number;
  aiCreditsMonthly: number;
  /** States the seller can sell and deliver to. */
  sellingStates: number | null;
  logisticsPartners: number | null;
  privateRateCards: boolean;
  brandedTracking: boolean;
  exceptionsInbox: boolean;
  payOnDelivery: boolean;
  /** SMS/WhatsApp delivery updates included each month (beyond them: packs). */
  messagesIncluded: number;
  dropshipProducts: number | null;
  chinaImport: "browse" | "full" | "priority";
  prioritySupport: boolean;
  /** May hide "Built with Shopinbos". */
  hideBadge: boolean;
}

export interface SupplierLimits {
  /** Shopinbos's commission on each marketplace order (of the wholesale value). */
  commissionPct: number;
  listings: number | null;
  bulkUpload: boolean;
  analytics: "basic" | "full" | "export";
  placement: "standard" | "boosted" | "priority";
  /** Weeks featured on the sellers' marketplace each month, included in the plan. */
  featuredWeeksIncluded: number;
  logisticsPartners: number | null;
  privateRateCards: boolean;
  broadcast: boolean;
  aiCreditsMonthly: number;
  teamMembers: number | null;
}

export interface LogisticsLimits {
  /** Shopinbos's fee on each in-app delivery job (of the delivery fee), once switched on in Admin › Pricing. */
  jobFeePct: number;
  coverageStates: number | null;
  pickupPoints: number | null;
  privateRateCards: boolean;
  analytics: "basic" | "full" | "export";
  placement: "standard" | "boosted" | "top";
  featuredIncluded: boolean;
  aiCreditsMonthly: number;
  teamMembers: number | null;
}

export const SELLER_PLANS: Record<SellerPlanKey, SellerLimits> = {
  seller_free: {
    transactionFeePct: 3, products: 20, customDomain: false, themes: "basic", staff: 1, aiCreditsMonthly: 20, sellingStates: 1, logisticsPartners: 1,
    privateRateCards: false, brandedTracking: false, exceptionsInbox: false, payOnDelivery: false, messagesIncluded: 0, dropshipProducts: 5,
    chinaImport: "browse", prioritySupport: false, hideBadge: false,
  },
  seller_starter: {
    transactionFeePct: 2, products: 200, customDomain: true, themes: "premium", staff: 2, aiCreditsMonthly: 150, sellingStates: 5, logisticsPartners: 3,
    privateRateCards: true, brandedTracking: true, exceptionsInbox: false, payOnDelivery: false, messagesIncluded: 0, dropshipProducts: 50,
    chinaImport: "full", prioritySupport: false, hideBadge: false,
  },
  seller_growth: {
    transactionFeePct: 1, products: null, customDomain: true, themes: "all_seasonal", staff: 5, aiCreditsMonthly: 500, sellingStates: null, logisticsPartners: 10,
    privateRateCards: true, brandedTracking: true, exceptionsInbox: true, payOnDelivery: true, messagesIncluded: 200, dropshipProducts: null,
    chinaImport: "full", prioritySupport: false, hideBadge: false,
  },
  seller_pro: {
    transactionFeePct: 0.5, products: null, customDomain: true, themes: "all_seasonal", staff: 15, aiCreditsMonthly: 1500, sellingStates: null, logisticsPartners: null,
    privateRateCards: true, brandedTracking: true, exceptionsInbox: true, payOnDelivery: true, messagesIncluded: 1000, dropshipProducts: null,
    chinaImport: "priority", prioritySupport: true, hideBadge: true,
  },
};

export const SUPPLIER_PLANS: Record<SupplierPlanKey, SupplierLimits> = {
  supplier_free: { commissionPct: 6, listings: 30, bulkUpload: false, analytics: "basic", placement: "standard", featuredWeeksIncluded: 0, logisticsPartners: 2, privateRateCards: false, broadcast: false, aiCreditsMonthly: 20, teamMembers: 3 },
  supplier_plus: { commissionPct: 4, listings: 500, bulkUpload: true, analytics: "full", placement: "boosted", featuredWeeksIncluded: 0, logisticsPartners: 10, privateRateCards: true, broadcast: false, aiCreditsMonthly: 200, teamMembers: 10 },
  supplier_pro: { commissionPct: 3, listings: null, bulkUpload: true, analytics: "export", placement: "priority", featuredWeeksIncluded: 2, logisticsPartners: null, privateRateCards: true, broadcast: true, aiCreditsMonthly: 600, teamMembers: null },
};

export const LOGISTICS_PLANS: Record<LogisticsPlanKey, LogisticsLimits> = {
  logistics_free: { jobFeePct: 5, coverageStates: 3, pickupPoints: 3, privateRateCards: false, analytics: "basic", placement: "standard", featuredIncluded: false, aiCreditsMonthly: 10, teamMembers: 3 },
  logistics_plus: { jobFeePct: 3, coverageStates: 15, pickupPoints: 20, privateRateCards: true, analytics: "full", placement: "boosted", featuredIncluded: false, aiCreditsMonthly: 100, teamMembers: 10 },
  logistics_pro: { jobFeePct: 2, coverageStates: null, pickupPoints: null, privateRateCards: true, analytics: "export", placement: "top", featuredIncluded: true, aiCreditsMonthly: 300, teamMembers: null },
};

/** The plans each role can be on, cheapest first. */
export const PLANS_BY_ROLE: Record<PlanRole, readonly PlanKey[]> = {
  seller: ["seller_free", "seller_starter", "seller_growth", "seller_pro"],
  supplier: ["supplier_free", "supplier_plus", "supplier_pro"],
  logistics_partner: ["logistics_free", "logistics_plus", "logistics_pro"],
};

export const FREE_PLAN: Record<PlanRole, PlanKey> = { seller: "seller_free", supplier: "supplier_free", logistics_partner: "logistics_free" };

/** User.aiCredits (the plan marker, never a balance) while on each paid plan. Free plans are FREE_PLAN_MARKER. */
export const PLAN_MARKERS: Record<Exclude<PlanKey, "seller_free" | "supplier_free" | "logistics_free">, number> = {
  // 50 and 200 were Growth and Seller Pro before October 2026; 100 was Supplier Max. Those subscribers moved to
  // Starter, Growth and Supplier Pro, so the numbers stay and nobody's marker had to change.
  seller_starter: 50,
  seller_growth: 200,
  seller_pro: 400,
  supplier_plus: 60,
  supplier_pro: 100,
  logistics_plus: 70,
  logistics_pro: 120,
};

export function asPlanRole(role: string | null | undefined): PlanRole | null {
  return role === "seller" || role === "supplier" || role === "logistics_partner" ? role : null;
}

/** The plan someone with this role and marker is on (an unknown marker counts as the role's free plan). */
export function planKeyFor(role: string | null | undefined, marker: number | null | undefined): PlanKey {
  const planRole = asPlanRole(role) ?? "seller";
  const match = PLANS_BY_ROLE[planRole].find((key) => key in PLAN_MARKERS && PLAN_MARKERS[key as keyof typeof PLAN_MARKERS] === marker);
  return match ?? FREE_PLAN[planRole];
}

/** The plan a marker stands for, whatever the role (markers are unique across roles). */
export function planKeyForMarker(marker: number | null | undefined): PlanKey {
  const match = (Object.keys(PLAN_MARKERS) as Array<keyof typeof PLAN_MARKERS>).find((key) => PLAN_MARKERS[key] === marker);
  return match ?? "seller_free";
}

export function sellerLimits(key: PlanKey): SellerLimits {
  return SELLER_PLANS[(key in SELLER_PLANS ? key : "seller_free") as SellerPlanKey];
}
export function supplierLimits(key: PlanKey): SupplierLimits {
  return SUPPLIER_PLANS[(key in SUPPLIER_PLANS ? key : "supplier_free") as SupplierPlanKey];
}
export function logisticsLimits(key: PlanKey): LogisticsLimits {
  return LOGISTICS_PLANS[(key in LOGISTICS_PLANS ? key : "logistics_free") as LogisticsPlanKey];
}

/** The monthly AI credits a plan includes (they reset each month; bought credits are separate). */
export function monthlyCreditsFor(key: PlanKey): number {
  if (key in SELLER_PLANS) return SELLER_PLANS[key as SellerPlanKey].aiCreditsMonthly;
  if (key in SUPPLIER_PLANS) return SUPPLIER_PLANS[key as SupplierPlanKey].aiCreditsMonthly;
  return LOGISTICS_PLANS[key as LogisticsPlanKey].aiCreditsMonthly;
}

/** The size of the daily safety cap on AI use (src/lib/ai/usage.ts): it blocks runaway use, it never gives credits. */
export function aiSafetyTier(key: PlanKey): "starter" | "growth" | "pro" {
  if (key.endsWith("_free")) return "starter";
  if (key === "seller_starter" || key === "supplier_plus" || key === "logistics_plus") return "growth";
  return "pro";
}

/** A limit reached: `count` already used of `limit` (null limit: never). */
export function atLimit(count: number, limit: number | null) {
  return limit !== null && count >= limit;
}

export function limitText(limit: number | null) {
  return limit === null ? "Unlimited" : limit.toLocaleString("en-NG");
}

/** The cheapest plan of a role that allows `test`, for "Upgrade to X" messages. */
export function cheapestPlanWhere(role: PlanRole, test: (key: PlanKey) => boolean): PlanKey | null {
  return PLANS_BY_ROLE[role].find(test) ?? null;
}

export const PLAN_NAMES: Record<PlanKey, string> = {
  seller_free: "Free",
  seller_starter: "Starter",
  seller_growth: "Growth",
  seller_pro: "Pro",
  supplier_free: "Free (Verified)",
  supplier_plus: "Supplier Plus",
  supplier_pro: "Supplier Pro",
  logistics_free: "Free (Verified)",
  logistics_plus: "Logistics Plus",
  logistics_pro: "Logistics Pro",
};

/** "Upgrade to Starter to add more products." */
export function upgradeMessage(role: PlanRole, test: (key: PlanKey) => boolean, what: string) {
  const plan = cheapestPlanWhere(role, test);
  return plan ? `Upgrade to ${PLAN_NAMES[plan]} to ${what}.` : `Your plan doesn't allow this.`;
}

/** One line of a plan card: an i18n key in the "payments" namespace (`plans.f.<id>`) and its values. */
export interface PlanFeatureLine {
  id: string;
  values?: Record<string, string | number>;
  /** False: shown greyed out with a dash (the plan doesn't include it). */
  included: boolean;
}

const unlimitedOr = (value: number | null) => (value === null ? "∞" : value.toLocaleString("en-NG"));

/** The lines on a plan's billing card, in order. */
export function planFeatureLines(key: PlanKey): PlanFeatureLine[] {
  if (key in SELLER_PLANS) {
    const p = SELLER_PLANS[key as SellerPlanKey];
    return [
      { id: "fee", values: { pct: p.transactionFeePct }, included: true },
      { id: p.products === null ? "productsUnlimited" : "products", values: { count: unlimitedOr(p.products) }, included: true },
      { id: p.customDomain ? "customDomain" : "subdomain", included: true },
      { id: `themes_${p.themes}`, included: true },
      { id: "staff", values: { count: p.staff }, included: true },
      { id: "credits", values: { count: p.aiCreditsMonthly }, included: true },
      { id: p.sellingStates === null ? "statesNationwide" : "states", values: { count: unlimitedOr(p.sellingStates) }, included: true },
      { id: p.logisticsPartners === null ? "partnersUnlimited" : "partners", values: { count: unlimitedOr(p.logisticsPartners) }, included: true },
      { id: "privateRates", included: p.privateRateCards },
      { id: "tracking", included: p.brandedTracking },
      { id: "exceptions", included: p.exceptionsInbox },
      { id: "pod", included: p.payOnDelivery },
      { id: p.messagesIncluded ? "messages" : "messagesPayg", values: { count: p.messagesIncluded }, included: true },
      { id: p.dropshipProducts === null ? "dropshipUnlimited" : "dropship", values: { count: unlimitedOr(p.dropshipProducts) }, included: true },
      { id: `china_${p.chinaImport}`, included: true },
      ...(p.prioritySupport ? [{ id: "prioritySupport", included: true }] : []),
      ...(p.hideBadge ? [{ id: "noBadge", included: true }] : []),
    ];
  }
  if (key in SUPPLIER_PLANS) {
    const p = SUPPLIER_PLANS[key as SupplierPlanKey];
    return [
      { id: "verified", included: true },
      { id: "commission", values: { pct: p.commissionPct }, included: true },
      { id: p.listings === null ? "listingsUnlimited" : "listings", values: { count: unlimitedOr(p.listings) }, included: true },
      { id: "bulkUpload", included: p.bulkUpload },
      { id: "dropshipAllowed", included: true },
      { id: `analytics_${p.analytics}`, included: true },
      { id: `placement_${p.placement}`, included: true },
      { id: p.featuredWeeksIncluded ? "featuredWeeks" : "featuredPay", values: { count: p.featuredWeeksIncluded }, included: true },
      { id: p.logisticsPartners === null ? "partnersUnlimited" : "partners", values: { count: unlimitedOr(p.logisticsPartners) }, included: true },
      { id: "privateRates", included: p.privateRateCards },
      { id: p.broadcast ? "messagingBroadcast" : "messaging", included: true },
      { id: "credits", values: { count: p.aiCreditsMonthly }, included: true },
    ];
  }
  const p = LOGISTICS_PLANS[key as LogisticsPlanKey];
  return [
    { id: "verified", included: true },
    { id: "jobFee", values: { pct: p.jobFeePct }, included: true },
    { id: p.coverageStates === null ? "coverageNationwide" : "coverage", values: { count: unlimitedOr(p.coverageStates) }, included: true },
    { id: p.pickupPoints === null ? "pickupUnlimited" : "pickup", values: { count: unlimitedOr(p.pickupPoints) }, included: true },
    { id: "rateCard", included: true },
    { id: "privateRatesSellers", included: p.privateRateCards },
    { id: `analytics_${p.analytics}`, included: true },
    { id: `matching_${p.placement}`, included: true },
    { id: p.featuredIncluded ? "featuredIncluded" : "featuredPay", included: true },
    { id: "connectionsUnlimited", included: true },
    { id: "credits", values: { count: p.aiCreditsMonthly }, included: true },
  ];
}
