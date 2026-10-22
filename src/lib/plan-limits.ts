import "server-only";
import { db } from "@/lib/db/client";
import {
  PLAN_NAMES,
  logisticsLimits,
  planKeyFor,
  sellerLimits,
  supplierLimits,
  upgradeMessage,
  type PlanKey,
} from "@shared/plans";

// The plan someone is on and what it allows (shared/plans.ts). Every limit the app enforces reads from here, so the
// billing page and the checks never disagree.

export interface PlanUser {
  role?: string | null;
  aiCredits?: number | null;
}

export function planOf(user: PlanUser): PlanKey {
  return planKeyFor(user.role, user.aiCredits);
}

/** The plan of a user by id (role and marker read fresh). */
export async function planOfUser(userId: string): Promise<PlanKey> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { role: true, aiCredits: true } });
  return planOf(user ?? {});
}

export function sellerPlanLimits(user: PlanUser) {
  return sellerLimits(planOf({ ...user, role: "seller" }));
}

export function supplierPlanLimits(user: PlanUser) {
  return supplierLimits(planOf({ ...user, role: "supplier" }));
}

export function logisticsPlanLimits(user: PlanUser) {
  return logisticsLimits(planOf({ ...user, role: "logistics_partner" }));
}

export function planName(user: PlanUser) {
  return PLAN_NAMES[planOf(user)];
}

export function supplierProductLimitMessage(limit: number | null) {
  return `Your plan includes up to ${limit ?? "unlimited"} product listings. ${upgradeMessage("supplier", (key) => (supplierLimits(key).listings ?? Infinity) > (limit ?? Infinity), "list more products")}`;
}

export function supplierTeamLimitMessage(limit: number | null) {
  return `Your plan includes ${limit ?? "unlimited"} active team members. ${upgradeMessage("supplier", (key) => (supplierLimits(key).teamMembers ?? Infinity) > (limit ?? Infinity), "add more")}`;
}

export function logisticsCoverageLimitMessage(limit: number | null) {
  return `Your plan covers up to ${limit ?? "unlimited"} states. ${upgradeMessage("logistics_partner", (key) => (logisticsLimits(key).coverageStates ?? Infinity) > (limit ?? Infinity), "cover more states")}`;
}

export function logisticsTeamLimitMessage(limit: number | null) {
  return `Your plan includes ${limit ?? "unlimited"} active team members. ${upgradeMessage("logistics_partner", (key) => (logisticsLimits(key).teamMembers ?? Infinity) > (limit ?? Infinity), "add more riders and staff")}`;
}

export function sellerProductLimitMessage(limit: number | null) {
  return `Your plan includes up to ${limit ?? "unlimited"} products. ${upgradeMessage("seller", (key) => (sellerLimits(key).products ?? Infinity) > (limit ?? Infinity), "add more")}`;
}

/**
 * States a delivery partner covers: the distinct regions on their coverage map, or (with no map) the distinct
 * zone names they listed.
 */
export function coverageStateCount(zones: readonly string[], map?: { zones?: Array<{ region?: string | null; active?: boolean }> } | null) {
  const regions = (map?.zones ?? []).filter((zone) => zone.active !== false).map((zone) => zone.region?.trim().toLowerCase()).filter(Boolean);
  if (regions.length) return new Set(regions).size;
  return new Set(zones.map((zone) => zone.trim().toLowerCase()).filter(Boolean)).size;
}
