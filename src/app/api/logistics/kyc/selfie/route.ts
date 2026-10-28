import { apiError } from "@/lib/api/response";
import { readLivenessReport, readSelfieDataUri } from "@/lib/logistics/partner-kyc";
import { saveSelfie } from "@/lib/logistics/partner-kyc.server";
import { refreshPartnerTier } from "@/lib/logistics/partner-tiers.server";
import { UploadRejectedError } from "@/lib/supabase/storage.server";
import { readJson, stateResponse, withKycPartner } from "../_partner";

export const runtime = "nodejs";

// "Quick selfie video" for a partner whose ID isn't a NIN slip (driver's licence, voter's card, passport): the selfie
// and, when the browser or phone ran it, Korapay's liveness reference. There is no ID lookup to match it against, so
// the team compares it with the ID photo. With a NIN slip the selfie goes to /api/logistics/kyc/nin instead.
export const POST = withKycPartner(async (req, { partner }) => {
  const body = await readJson(req);
  const selfie = readSelfieDataUri(body.selfie);
  if (!selfie.ok) return apiError("BAD_REQUEST", selfie.error);
  const liveness = readLivenessReport(body.liveness);
  if (liveness && !liveness.passed) return apiError("BAD_REQUEST", "The face check didn't pass. Try again in good light, with your face in the circle.");
  try {
    await saveSelfie(partner.id, selfie, {
      status: "pending",
      ...(liveness ? { liveness: { provider: "korapay", reference: liveness.reference, passed: true, checkedAt: new Date().toISOString() } } : {}),
    });
  } catch (error) {
    if (error instanceof UploadRejectedError) return apiError("BAD_REQUEST", "That selfie isn't a photo we can read. Take it again.");
    console.error("[partner-kyc selfie] upload failed", error);
    return apiError("INTERNAL_ERROR", "We couldn't save your selfie. Please try again.", 500);
  }
  await refreshPartnerTier(partner.id);
  return stateResponse(partner.id);
});
