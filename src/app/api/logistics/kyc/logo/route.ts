import { apiError } from "@/lib/api/response";
import { invalidatePublicMarketplaceCache } from "@/lib/api/cache";
import { saveFlowAnswers } from "@/lib/logistics/partner-kyc.server";
import { UploadRejectedError, uploadFileServer, uploadPath } from "@/lib/supabase/storage.server";
import { mediaFileProblem } from "@shared/media";
import { stateResponse, withKycPartner } from "../_partner";

export const runtime = "nodejs";

// "Do you have a company logo?" (shared/partner-tiers.ts PARTNER_FLOW "logo"): a photo of the logo, as multipart
// form data (field "file"), saved to LogisticsPartner.logoUrl (sellers see it on the partner's profile). Optional:
// "I'll add it later" goes through /api/logistics/kyc/answers ({ screen: "logo", logo: "later" }). Answers with the
// whole state, like every kyc route.
export const POST = withKycPartner(async (req, { partner }) => {
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return apiError("BAD_REQUEST", "Pick a photo of your logo first.");
  const problem = mediaFileProblem(file, "image");
  if (problem) return apiError("BAD_REQUEST", problem);
  try {
    const { publicUrl } = await uploadFileServer("logistics-logos", file, uploadPath(`logos/${partner.id}`, file));
    await saveFlowAnswers(partner.id, { logo: "added" }, { logoUrl: publicUrl });
  } catch (error) {
    if (error instanceof UploadRejectedError) return apiError("BAD_REQUEST", "That isn't a picture we can read. Pick another one.");
    console.error("[partner-kyc logo] upload failed", error);
    return apiError("INTERNAL_ERROR", "We couldn't save your logo. Please try again.", 500);
  }
  invalidatePublicMarketplaceCache({ logisticsSlug: partner.slug });
  return stateResponse(partner.id);
});
