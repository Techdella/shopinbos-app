import "server-only";
import { db } from "@/lib/db/client";
import {
  PLAN_NAMES,
  cheapestPlanWhere,
  logisticsLimits,
  planKeyFor,
  sellerLimits,
  supplierLimits,
  type PlanKey,
} from "@shared/plans";

// The October 2026 plan limits on the logistics marketplace (src/lib/delivery-market/manage.server.ts): how many
// delivery partners a seller or supplier connects, pay on delivery, private rate cards and a
// partner's pickup points. Each returns null when allowed, or the words to show. What someone already has keeps
// working after a downgrade; only adding more is stopped.

async function userPlan(userId: string) {
  const user = await db.user.findUnique({ where: { id: userId }, select: { role: true, aiCredits: true } });
  return { role: user?.role ?? null, key: planKeyFor(user?.role, user?.aiCredits) as PlanKey };
}

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

/** Connecting one more delivery partner (Seller Free 1 · Starter 3 · Growth 10 · Pro unlimited; Supplier 2 · 10 · unlimited). */
export async function connectionLimitProblem(ownerUserId: string, partnerId: string): Promise<string | null> {
  const { role, key } = await userPlan(ownerUserId);
  if (role !== "seller" && role !== "supplier") return null;
  const limitOf = (plan: PlanKey) => (role === "seller" ? sellerLimits(plan) : supplierLimits(plan)).logisticsPartners;
  const limit = limitOf(key);
  if (limit === null) return null;
  const active = await db.deliveryConnection.findMany({ where: { ownerUserId, status: "active" }, select: { logisticsPartnerId: true } });
  if (active.some((row) => row.logisticsPartnerId === partnerId) || active.length < limit) return null;
  const next = cheapestPlanWhere(role, (plan) => {
    const more = limitOf(plan);
    return more === null || more > active.length;
  });
  return `Your plan includes ${plural(limit, "delivery partner")} and you have ${active.length}.${next ? ` Upgrade to ${PLAN_NAMES[next]} to add more, or remove one first.` : " Remove one first."}`;
}

/** Switching on pay on delivery for a connection (sellers: Growth and up). */
export async function payOnDeliveryProblem(userId: string): Promise<string | null> {
  const { role, key } = await userPlan(userId);
  if (role !== "seller" || sellerLimits(key).payOnDelivery) return null;
  const plan = cheapestPlanWhere("seller", (plan) => sellerLimits(plan).payOnDelivery);
  return `Pay on delivery comes with the ${plan ? PLAN_NAMES[plan] : "Growth"} plan.`;
}

/** A partner sending private rates (Logistics Plus and up). */
export async function proposePrivateRatesProblem(partnerUserId: string): Promise<string | null> {
  const { key } = await userPlan(partnerUserId);
  if (logisticsLimits(key).privateRateCards) return null;
  return "Private rate cards come with the Logistics Plus plan.";
}

/** A seller or supplier accepting private rates (Seller Starter and up, Supplier Plus and up). */
export async function acceptPrivateRatesProblem(ownerUserId: string): Promise<string | null> {
  const { role, key } = await userPlan(ownerUserId);
  if (role === "seller") return sellerLimits(key).privateRateCards ? null : `Private rates come with the ${PLAN_NAMES.seller_starter} plan.`;
  if (role === "supplier") return supplierLimits(key).privateRateCards ? null : `Private rates come with the ${PLAN_NAMES.supplier_plus} plan.`;
  return null;
}

/** Adding a pickup point (Logistics Free 3 · Plus 20 · Pro unlimited). */
export async function pickupPointLimitProblem(partnerId: string): Promise<string | null> {
  const partner = await db.logisticsPartner.findUnique({ where: { id: partnerId }, select: { userId: true } });
  if (!partner) return null;
  const { key } = await userPlan(partner.userId);
  const limit = logisticsLimits(key).pickupPoints;
  if (limit === null) return null;
  const count = await db.logisticsPickupPoint.count({ where: { logisticsPartnerId: partnerId, active: true } });
  if (count < limit) return null;
  const plan = cheapestPlanWhere("logistics_partner", (plan) => {
    const more = logisticsLimits(plan).pickupPoints;
    return more === null || more > count;
  });
  return `Your plan includes ${plural(limit, "pickup point")}.${plan ? ` Upgrade to ${PLAN_NAMES[plan]} to add more.` : ""}`;
}
