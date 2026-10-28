import "server-only";

import { redirect } from "next/navigation";
import { db } from "@/lib/db/client";
import type { AuthUser } from "@/lib/auth/types";
import { slugify } from "@/lib/workspace";

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
  if (partner) return partner;

  // Made at sign-up (src/lib/auth/app-user.ts); if it's somehow missing, make it here rather than send the partner to
  // set-up, which now is /logistics/verification itself (a redirect would loop).
  const companyName = `${user.name || "New"} Logistics`.slice(0, 80);
  return db.logisticsPartner.upsert({
    where: { userId: user.id },
    update: {},
    create: {
      userId: user.id,
      companyName,
      displayName: companyName,
      slug: `${slugify(companyName)}-${user.id.slice(0, 6)}`,
      country: "Nigeria",
      city: "Lagos",
      coverageZones: [],
      vehicleTypes: ["bike"],
      deliveryTypes: ["same_day"],
      verificationStatus: "unverified",
      onboardingState: { source: "portal", completed: false },
    },
  });
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

export function ensureSupplierAccess(supplier: { verificationStatus: string; onboardingState: unknown }) {
  if (!isOnboardingComplete(supplier)) redirect("/supplier/onboarding");
}

export function ensureLogisticsAccess(partner: { verificationStatus: string; onboardingState: unknown }) {
  if (!isOnboardingComplete(partner)) redirect("/logistics/onboarding");
}
