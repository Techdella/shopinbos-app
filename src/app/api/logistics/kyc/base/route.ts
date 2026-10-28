import { apiError } from "@/lib/api/response";
import { db } from "@/lib/db/client";
import { NG_STATES } from "@shared/delivery-market";
import { readPhotoDataUri } from "@/lib/logistics/partner-kyc";
import { savePartnerPhoto, updateIdentityChecks } from "@/lib/logistics/partner-kyc.server";
import { UploadRejectedError } from "@/lib/supabase/storage.server";
import { readJson, stateResponse, withKycPartner } from "../_partner";

export const runtime = "nodejs";

// "Where are you based?": the address of the base or shop, the phone's location when they shared it, and an optional
// photo of the place. The photo goes to the team; base plus an approved photo earns the Address Verified badge
// (shared/partner-tiers.ts addressVerified). Also sets the partner's address and city sellers see.
export const POST = withKycPartner(async (req, { partner }) => {
  const body = await readJson(req);
  const address = typeof body.address === "string" ? body.address.replace(/\s+/g, " ").trim().slice(0, 300) : "";
  if (address.length < 5) return apiError("BAD_REQUEST", "Type the address of your base, or use your location.");
  const state = typeof body.state === "string" && (NG_STATES as readonly string[]).includes(body.state.trim()) ? body.state.trim() : undefined;
  const lat = typeof body.lat === "number" && Number.isFinite(body.lat) && Math.abs(body.lat) <= 90 ? body.lat : undefined;
  const lng = typeof body.lng === "number" && Number.isFinite(body.lng) && Math.abs(body.lng) <= 180 ? body.lng : undefined;
  const located = lat !== undefined && lng !== undefined;

  if (body.photo !== undefined && body.photo !== null && body.photo !== "") {
    const photo = readPhotoDataUri(body.photo, "base");
    if (!photo.ok) return apiError("BAD_REQUEST", photo.error);
    try {
      await savePartnerPhoto(partner.id, "base-photo", photo, { status: "pending" });
    } catch (error) {
      if (error instanceof UploadRejectedError) return apiError("BAD_REQUEST", "That isn't a photo we can read. Take it again.");
      console.error("[partner-kyc base] upload failed", error);
      return apiError("INTERNAL_ERROR", "We couldn't save the photo. Please try again.", 500);
    }
  }

  await db.logisticsPartner.update({ where: { id: partner.id }, data: { address, ...(state ? { city: state } : {}) } });
  await updateIdentityChecks(partner.id, (current) => ({
    ...current,
    base: { address, ...(state ? { state } : {}), ...(located ? { lat, lng } : {}), setAt: new Date().toISOString() },
  }));
  return stateResponse(partner.id);
});
