import type { Prisma } from "@prisma/client";

// Where paid plans show up first in the marketplace's default order (shared/plans.ts: Plus gets boosted placement,
// Pro priority placement or top of results). User.aiCredits is the plan marker and rises with the plan within each
// kind of account (Free 5, Plus 60/70, Pro 100/120), so ordering by it puts Pro first, then Plus, then Free. Only the
// default sort uses it; a shopper who sorts by price or newest gets exactly that.

export const SUPPLIER_PLAN_FIRST: Prisma.SupplierOrderByWithRelationInput = { user: { aiCredits: "desc" } };
export const PRODUCT_PLAN_FIRST: Prisma.SupplierProductOrderByWithRelationInput = { supplier: { user: { aiCredits: "desc" } } };
export const PARTNER_PLAN_FIRST: Prisma.LogisticsPartnerOrderByWithRelationInput = { user: { aiCredits: "desc" } };
