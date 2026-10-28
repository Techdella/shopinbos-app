import { apiError } from "@/lib/api/response";
import { isIdType } from "@shared/partner-tiers";
import { readPhotoDataUri } from "@/lib/logistics/partner-kyc";
import { savePartnerPhoto, updateIdentityChecks } from "@/lib/logistics/partner-kyc.server";
import { UploadRejectedError } from "@/lib/supabase/storage.server";
import { readJson, stateResponse, withKycPartner } from "../_partner";

export const runtime = "nodejs";

// "Snap a photo of your ID": which ID (NIN slip, driver's licence, voter's card, passport) and its photo, kept
// privately as the "identity" document for the team. With a NIN slip the next screen also takes the NIN, so Korapay
// can check it and match the selfie to its photo; with any other ID the team compares the selfie with this photo.
export const POST = withKycPartner(async (req, { partner }) => {
  const body = await readJson(req);
  if (!isIdType(body.idType)) return apiError("BAD_REQUEST", "Pick which ID you have.");
  const photo = readPhotoDataUri(body.photo, "ID");
  if (!photo.ok) return apiError("BAD_REQUEST", photo.error);
  try {
    await savePartnerPhoto(partner.id, "identity", photo, { status: "pending" });
  } catch (error) {
    if (error instanceof UploadRejectedError) return apiError("BAD_REQUEST", "That isn't a photo we can read. Take it again.");
    console.error("[partner-kyc id] upload failed", error);
    return apiError("INTERNAL_ERROR", "We couldn't save the photo. Please try again.", 500);
  }
  const idType = body.idType;
  await updateIdentityChecks(partner.id, (current) => ({ ...current, idDocument: { type: idType, setAt: new Date().toISOString() } }));
  return stateResponse(partner.id);
});
