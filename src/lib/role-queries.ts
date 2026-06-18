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

export function isOnboardingComplete(entity: { onboardingState: unknown }) {
  const state = entity.onboardingState;
  return Boolean(state && typeof state === "object" && !Array.isArray(state) && (state as { completed?: boolean }).completed === true);
}

export function isProPlan(user: { aiCredits?: number | null }) {
  return hasProPlan(user);
}

export function ensureSupplierAccess(supplier: { verificationStatus: string; onboardingState: unknown }) {
  if (!isOnboardingComplete(supplier)) redirect("/supplier/onboarding");
  if (supplier.verificationStatus !== "verified") redirect("/supplier/verification");
}

export function ensureLogisticsAccess(partner: { verificationStatus: string; onboardingState: unknown }) {
  if (!isOnboardingComplete(partner)) redirect("/logistics/onboarding");
  if (partner.verificationStatus !== "verified") redirect("/logistics/verification");
}
