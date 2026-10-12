import "server-only";

import { redirect } from "next/navigation";
import { db } from "@/lib/db/client";
import { isProPlan as hasProPlan } from "@/lib/plan-limits";
import type { AuthUser } from "@/lib/auth/types";

export async function getSupplierForUser(user: AuthUser) {
  const supplier = await db.supplier.findUnique({
    where: { userId: user.id },
  });

  if (!supplier) redirect("/supplier/onboarding");
  return supplier;
}

export async function getLogisticsPartnerForUser(user: AuthUser) {
  const partner = await db.logisticsPartner.findUnique({
    where: { userId: user.id },
  });

  if (!partner) redirect("/logistics/onboarding");
  return partner;
}

export function isOnboardingComplete(entity: { onboardingState: unknown; verificationStatus?: string | null }) {
  // An account the admin team has already verified never goes back through the setup wizard
  // (seeded and admin-created partners have no wizard state).
  if (entity.verificationStatus === "verified") return true;
  const state = entity.onboardingState;
  if (!state || typeof state !== "object" || Array.isArray(state)) return false;
  const s = state as { completed?: boolean; docsLaterAt?: unknown };
  // "Add documents later" opens the portal while the account stays unverified (nothing public until approved).
  return s.completed === true || typeof s.docsLaterAt === "string";
}

export function isProPlan(user: { aiCredits?: number | null }) {
  return hasProPlan(user);
}

export function ensureSupplierAccess(supplier: { verificationStatus: string; onboardingState: unknown }) {
  if (!isOnboardingComplete(supplier)) redirect("/supplier/onboarding");
}

export function ensureLogisticsAccess(partner: { verificationStatus: string; onboardingState: unknown }) {
  if (!isOnboardingComplete(partner)) redirect("/logistics/onboarding");
}
