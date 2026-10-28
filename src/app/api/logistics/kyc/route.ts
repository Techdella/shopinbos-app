import { syncSignUpPhone } from "@/lib/logistics/partner-kyc.server";
import { stateResponse, withKycPartner } from "./_partner";

// The partner's verification: tier, checks, files, flow answers, limits and graduation (src/lib/logistics/
// partner-kyc.server.ts). The phone they signed up with counts as confirmed (its code was the sign-up code).
export const GET = withKycPartner(async (_req, { user, partner }) => {
  await syncSignUpPhone(partner, user.supabaseId).catch((error) => console.error("[partner-kyc] sign-up phone not synced", error));
  return stateResponse(partner.id);
});
