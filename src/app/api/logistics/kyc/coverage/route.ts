import { apiError } from "@/lib/api/response";
import { db } from "@/lib/db/client";
import { invalidatePublicMarketplaceCache } from "@/lib/api/cache";
import { cleanAreas } from "@shared/delivery-market";
import { isDeliveryMethod } from "@shared/partner-tiers";
import { refreshPartnerTier } from "@/lib/logistics/partner-tiers.server";
import { readJson, stateResponse, withKycPartner } from "../_partner";

// Coverage step: where the partner delivers (states, "State: LGA" areas, regions or Nationwide, the same tokens as
// the marketplace's delivery areas) and how (bike, car, van, truck, tricycle, other).
export const PATCH = withKycPartner(async (req, { partner }) => {
  const body = await readJson(req);
  const { areas, unknown } = cleanAreas(body.deliveryAreas);
  if (unknown.length) return apiError("BAD_REQUEST", `We don't know these places: ${unknown.slice(0, 3).join(", ")}. Pick them from the list.`);
  if (!areas.length) return apiError("BAD_REQUEST", "Add at least one place you deliver to.");
  if (areas.length > 200) return apiError("BAD_REQUEST", "That's too many places. Use whole states or regions instead.");
  const methods = Array.isArray(body.deliveryMethods) ? [...new Set(body.deliveryMethods.filter(isDeliveryMethod))] : [];
  if (!methods.length) return apiError("BAD_REQUEST", "Pick how you deliver.");
  await db.logisticsPartner.update({ where: { id: partner.id }, data: { deliveryAreas: areas, vehicleTypes: methods } });
  invalidatePublicMarketplaceCache({ logisticsSlug: partner.slug });
  await refreshPartnerTier(partner.id);
  return stateResponse(partner.id);
});
