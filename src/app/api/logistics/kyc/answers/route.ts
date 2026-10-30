import { apiError } from "@/lib/api/response";
import { db } from "@/lib/db/client";
import { invalidatePublicMarketplaceCache } from "@/lib/api/cache";
import { NG_STATES, cleanAreas } from "@shared/delivery-market";
import { isDeliveryMethod } from "@shared/partner-tiers";
import { saveFlowAnswers } from "@/lib/logistics/partner-kyc.server";
import { readJson, stateResponse, withKycPartner } from "../_partner";

// The one-question screens of the partner sign-up (shared/partner-tiers.ts PARTNER_FLOW) that are plain answers:
//   { screen: "name", companyName }                          the name sellers see ("Just use my name" sends theirs)
//   { screen: "cac", cac: "yes" | "no" | "registering" }    any answer continues; "yes" then looks the number up
//   { screen: "logo", logo: "later" }                        "I'll add it later" (the photo itself: /api/logistics/kyc/logo)
//   { screen: "state", state }                               the state they deliver in
//   { screen: "areas", deliveryAreas }                       states, "State: LGA" areas, regions (delivery-market tokens)
//   { screen: "vehicles", deliveryMethods }                  bike, car, van, truck…
//   { screen: "interstate", interstate }                     yes / no (the "interstate" service)
//   { screen: "charge", charge: "flat", amount } | { screen: "charge", charge: "quote" }
// Each answers with the whole state. Saving the areas completes set-up (the rest of the portal opens).
export const PATCH = withKycPartner(async (req, { partner }) => {
  const body = await readJson(req);
  const done = async () => {
    invalidatePublicMarketplaceCache({ logisticsSlug: partner.slug });
    return stateResponse(partner.id);
  };

  switch (body.screen) {
    case "name": {
      const companyName = typeof body.companyName === "string" ? body.companyName.replace(/\s+/g, " ").trim().slice(0, 80) : "";
      if (companyName.length < 2) return apiError("BAD_REQUEST", "Type the name sellers will see.");
      await saveFlowAnswers(partner.id, { name: true }, { companyName, displayName: companyName });
      return done();
    }
    case "cac": {
      if (body.cac !== "yes" && body.cac !== "no" && body.cac !== "registering") return apiError("BAD_REQUEST", "Pick one answer.");
      await saveFlowAnswers(partner.id, { cac: body.cac });
      return done();
    }
    case "logo": {
      if (body.logo !== "later") return apiError("BAD_REQUEST", "Add a photo of your logo, or add it later.");
      await saveFlowAnswers(partner.id, { logo: "later" });
      return done();
    }
    case "state": {
      const state = typeof body.state === "string" ? body.state.trim() : "";
      if (!(NG_STATES as readonly string[]).includes(state)) return apiError("BAD_REQUEST", "Pick your state from the list.");
      await saveFlowAnswers(partner.id, { homeState: state });
      return done();
    }
    case "areas": {
      const { areas, unknown } = cleanAreas(body.deliveryAreas);
      if (unknown.length) return apiError("BAD_REQUEST", `We don't know these places: ${unknown.slice(0, 3).join(", ")}. Pick them from the list.`);
      if (!areas.length) return apiError("BAD_REQUEST", "Pick at least one area.");
      if (areas.length > 200) return apiError("BAD_REQUEST", "That's too many areas. Pick the whole state instead.");
      await saveFlowAnswers(partner.id, {}, {
        deliveryAreas: areas,
        // Older screens read coverageZones: the states covered.
        coverageZones: [...new Set(areas.map((area) => area.split(":")[0].trim()))],
      });
      return done();
    }
    case "vehicles": {
      const methods = Array.isArray(body.deliveryMethods) ? [...new Set(body.deliveryMethods.filter(isDeliveryMethod))] : [];
      if (!methods.length) return apiError("BAD_REQUEST", "Pick what you deliver with.");
      await saveFlowAnswers(partner.id, {}, { vehicleTypes: methods });
      return done();
    }
    case "interstate": {
      if (typeof body.interstate !== "boolean") return apiError("BAD_REQUEST", "Pick yes or no.");
      const row = await db.logisticsPartner.findUnique({ where: { id: partner.id }, select: { services: true } });
      const others = (row?.services ?? []).filter((service) => service !== "interstate");
      await saveFlowAnswers(partner.id, { interstate: body.interstate }, { services: body.interstate ? [...others, "interstate"] : others });
      return done();
    }
    case "charge": {
      if (body.charge === "quote") {
        // No starting price: sellers see "Ask for a quote" and agree the price in chat.
        await saveFlowAnswers(partner.id, { charge: "quote" }, { basePrice: 0, pricingModel: "fixed" });
        return done();
      }
      if (body.charge !== "flat") return apiError("BAD_REQUEST", "Pick how you charge.");
      const amount = Math.round(Number(String(body.amount ?? "").replace(/[₦,\s]/g, "")));
      if (!Number.isFinite(amount) || amount < 100 || amount > 1_000_000) return apiError("BAD_REQUEST", "Type your fee per delivery in naira, for example 2500.");
      await saveFlowAnswers(partner.id, { charge: "flat" }, { basePrice: amount, pricingModel: "fixed" });
      return done();
    }
    default:
      return apiError("BAD_REQUEST", "That question isn't part of sign-up.");
  }
});
