import "server-only";

export const SUPPLIER_FREE_PRODUCT_LIMIT = 50;
export const SUPPLIER_MAX_PRICE = 25000;
export const SUPPLIER_MAX_PRODUCT_LIMIT = Infinity;
export const SUPPLIER_FREE_TEAM_MEMBER_LIMIT = 3;
export const LOGISTICS_FREE_ROUTE_LIMIT = 4;
export const LOGISTICS_FREE_TEAM_MEMBER_LIMIT = 3;
export const PRO_PLAN_MIN_AI_CREDITS = 100;

export type SupplierPlan = "free" | "supplier_max";

export function getSupplierPlan(user: { aiCredits?: number | null }): SupplierPlan {
  return (user.aiCredits ?? 0) >= PRO_PLAN_MIN_AI_CREDITS ? "supplier_max" : "free";
}

export function isProPlan(user: { aiCredits?: number | null }) {
  return getSupplierPlan(user) === "supplier_max";
}

export function supplierProductLimit(plan: SupplierPlan) {
  return plan === "supplier_max" ? SUPPLIER_MAX_PRODUCT_LIMIT : SUPPLIER_FREE_PRODUCT_LIMIT;
}

export function supplierProductLimitMessage(limit = SUPPLIER_FREE_PRODUCT_LIMIT) {
  return `Free plan includes up to ${limit} products. Upgrade to Supplier Max (₦25,000/month) for unlimited products.`;
}

export function logisticsRouteLimitMessage(limit = LOGISTICS_FREE_ROUTE_LIMIT) {
  return `Starter logistics partners can save up to ${limit} routes. Upgrade to add more routes and team members.`;
}

// "My riders" (src/lib/logistics/fleet.server.ts): how many of their own riders a seller or supplier can have, by
// plan. The tier follows aiCredits like the billing pages (Seller Growth 50, Pro 200; Supplier Max 100). After a
// downgrade the riders already added keep working; only adding more is blocked.
export const RIDER_LIMITS = { starter: 3, growth: 15, pro: 50, supplier_free: 3, supplier_max: 50 } as const;

export function riderLimit(user: { role?: string | null; aiCredits?: number | null }) {
  const credits = user.aiCredits ?? 0;
  if (user.role === "supplier") return isProPlan(user) ? RIDER_LIMITS.supplier_max : RIDER_LIMITS.supplier_free;
  return credits >= 200 ? RIDER_LIMITS.pro : credits >= 50 ? RIDER_LIMITS.growth : RIDER_LIMITS.starter;
}

export function riderLimitMessage(user: { role?: string | null; aiCredits?: number | null }) {
  const limit = riderLimit(user);
  if (user.role === "supplier") {
    return limit >= RIDER_LIMITS.supplier_max ? `You can have up to ${limit} riders. Remove one first.` : `The free plan includes up to ${limit} riders. Upgrade to Supplier Max for up to ${RIDER_LIMITS.supplier_max}.`;
  }
  if (limit >= RIDER_LIMITS.pro) return `You can have up to ${limit} riders. Remove one first.`;
  return limit >= RIDER_LIMITS.growth
    ? `Growth includes up to ${limit} riders. Upgrade to Pro for up to ${RIDER_LIMITS.pro}.`
    : `Starter includes up to ${limit} riders. Upgrade to Growth for up to ${RIDER_LIMITS.growth}, or Pro for ${RIDER_LIMITS.pro}.`;
}
