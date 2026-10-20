import { NextRequest } from "next/server";
import { apiError, ok } from "@/lib/api/response";
import { saveDeliverySettings, type SettingsInput } from "@/lib/delivery-market/manage.server";
import { deliverySettingsFor } from "@/lib/delivery-market/market.server";
import { text, withOwner } from "../_shared";

export const dynamic = "force-dynamic";

// PUT /api/mobile/delivery/settings: "Where I sell", "Where I ship from" and the business's own options. Suppliers
// only say where they ship from and their usual parcel size; checkout choices are the shop's (as on the web).
export const PUT = withOwner(async (req: NextRequest, { user }) => {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return apiError("BAD_REQUEST", "Fill in your delivery settings first.");
  const where: SettingsInput = {
    originState: body.originState === undefined ? undefined : text(body.originState, 40),
    originArea: body.originArea === undefined ? undefined : text(body.originArea, 80),
    originAddress: body.originAddress === undefined ? undefined : text(body.originAddress, 200),
    defaultSizeBand: body.defaultSizeBand === undefined ? undefined : text(body.defaultSizeBand, 20),
  };
  const sellStates = Array.isArray(body.sellStates) ? body.sellStates.map((value) => text(value, 40)).filter(Boolean) : undefined;
  const input: SettingsInput =
    user.role === "supplier"
      ? { ...where, sellArea: body.sellArea === undefined ? undefined : text(body.sellArea, 20), sellStates }
      : {
          ...where,
          sellArea: body.sellArea === undefined ? undefined : text(body.sellArea, 20),
          sellStates,
          checkoutMode: body.checkoutMode === undefined ? undefined : text(body.checkoutMode, 20),
          selfPickup: body.selfPickup === undefined ? undefined : body.selfPickup === true,
          pickupAddress: body.pickupAddress === undefined ? undefined : text(body.pickupAddress, 200),
          pickupHours: body.pickupHours === undefined ? undefined : text(body.pickupHours, 120),
          pickupInstructions: body.pickupInstructions === undefined ? undefined : text(body.pickupInstructions, 300),
          fallback: body.fallback === undefined ? undefined : text(body.fallback, 20),
          fallbackFee: body.fallbackFee === undefined ? undefined : text(body.fallbackFee, 20) || "0",
          failedFeePayer: body.failedFeePayer === undefined ? undefined : text(body.failedFeePayer, 20),
        };
  const result = await saveDeliverySettings(user.id, input);
  if (!result.ok) return apiError("BAD_REQUEST", result.error);
  return ok({ settings: await deliverySettingsFor(user.id) });
});
