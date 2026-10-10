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
