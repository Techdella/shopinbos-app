import { apiError } from "@/lib/api/response";
import { db } from "@/lib/db/client";
import { invalidatePublicMarketplaceCache } from "@/lib/api/cache";
import { cleanAreas } from "@shared/delivery-market";
import { isDeliveryMethod } from "@shared/partner-tiers";
import { refreshPartnerTier } from "@/lib/logistics/partner-tiers.server";
import { readJson, stateResponse, withKycPartner } from "../_partner";

// "Your delivery" step of the one sign-up flow: the company name sellers see, where the partner delivers (states,
// "State: LGA" areas, regions or Nationwide, the same tokens as the marketplace's delivery areas) and how (bike, car,
// van, truck, tricycle, other). Saving it completes set-up (onboardingState.completed), which opens the rest of the
// portal; vehicles are added on the same step through /api/logistics/kyc/vehicles.
export const PATCH = withKycPartner(async (req, { partner }) => {
  const body = await readJson(req);
  const companyName = typeof body.companyName === "string" ? body.companyName.replace(/\s+/g, " ").trim().slice(0, 80) : undefined;
  if (companyName !== undefined && companyName.length < 2) return apiError("BAD_REQUEST", "Type your company or trading name.");
  const { areas, unknown } = cleanAreas(body.deliveryAreas);
  if (unknown.length) return apiError("BAD_REQUEST", `We don't know these places: ${unknown.slice(0, 3).join(", ")}. Pick them from the list.`);
  if (!areas.length) return apiError("BAD_REQUEST", "Add at least one place you deliver to.");
  if (areas.length > 200) return apiError("BAD_REQUEST", "That's too many places. Use whole states or regions instead.");
  const methods = Array.isArray(body.deliveryMethods) ? [...new Set(body.deliveryMethods.filter(isDeliveryMethod))] : [];
  if (!methods.length) return apiError("BAD_REQUEST", "Pick how you deliver.");
  const state = partner.onboardingState && typeof partner.onboardingState === "object" && !Array.isArray(partner.onboardingState) ? (partner.onboardingState as Record<string, unknown>) : {};
  await db.logisticsPartner.update({
    where: { id: partner.id },
    data: {
      deliveryAreas: areas,
      vehicleTypes: methods,
      // Older screens read coverageZones: the states covered.
      coverageZones: [...new Set(areas.map((area) => area.split(":")[0].trim()))],
      ...(companyName ? { companyName, displayName: companyName } : {}),
      onboardingState: { ...state, completed: true, completedAt: typeof state.completedAt === "string" ? state.completedAt : new Date().toISOString(), flow: "single" },
    },
  });
  invalidatePublicMarketplaceCache({ logisticsSlug: partner.slug });
  await refreshPartnerTier(partner.id);
  return stateResponse(partner.id);
});
