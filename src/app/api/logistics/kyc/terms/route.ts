import { db } from "@/lib/db/client";
import { PARTNER_TERMS_VERSION } from "@shared/partner-tiers";
import { refreshPartnerTier } from "@/lib/logistics/partner-tiers.server";
import { stateResponse, withKycPartner } from "../_partner";

// The partner accepts the current partner terms (/logistics/terms).
export const POST = withKycPartner(async (_req, { partner }) => {
  await db.logisticsPartner.update({ where: { id: partner.id }, data: { termsVersion: PARTNER_TERMS_VERSION, termsAcceptedAt: new Date() } });
  await refreshPartnerTier(partner.id);
  return stateResponse(partner.id);
});
