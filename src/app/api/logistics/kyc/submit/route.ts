import { apiError } from "@/lib/api/response";
import { submitPartnerKyc } from "@/lib/logistics/partner-kyc.server";
import { stateResponse, withKycPartner } from "../_partner";

// Review & submit: sends the partner's verification to the team (Tier 1 must be complete; Tier 2 is optional).
export const POST = withKycPartner(async (_req, { user, partner }) => {
  const result = await submitPartnerKyc(user.id);
  if (!result.ok) return apiError(result.status === 400 ? "INCOMPLETE" : "NOT_SUBMITTED", result.error, result.status);
  return stateResponse(partner.id);
});
