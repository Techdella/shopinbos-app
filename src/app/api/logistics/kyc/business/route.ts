import { z } from "zod";
import { apiError } from "@/lib/api/response";
import { db } from "@/lib/db/client";
import { parseCacNumber } from "@/lib/kyb/cac";
import { CAC_TYPES } from "@shared/partner-tiers";
import { refreshPartnerTier } from "@/lib/logistics/partner-tiers.server";
import { readJson, stateResponse, withKycPartner } from "../_partner";

// Optional CAC step (Tier 2, Registered Business): the registered name, BN or RC, the number and the business
// address. The certificate goes through /api/logistics/verification/upload (docType "cac"), or the instant CAC check.
const Schema = z.object({
  registeredName: z.string().trim().min(2, "Type your business name exactly as it is on your CAC certificate.").max(160),
  cacType: z.enum(CAC_TYPES, { message: "Pick Business Name (BN) or Company (RC)." }),
  cacNumber: z.string().trim().max(30),
  businessAddress: z.string().trim().max(300).optional(),
});

export const PATCH = withKycPartner(async (req, { partner }) => {
  const parsed = Schema.safeParse(await readJson(req));
  if (!parsed.success) return apiError("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Check your business details.");
  const number = parseCacNumber(parsed.data.cacNumber);
  if (!number) return apiError("BAD_REQUEST", "Enter your BN or RC number, for example BN 1234567.");
  await db.logisticsPartner.update({
    where: { id: partner.id },
    data: {
      registeredName: parsed.data.registeredName,
      cacType: parsed.data.cacType,
      cacNumber: `${parsed.data.cacType} ${number.number}`,
      businessAddress: parsed.data.businessAddress || null,
    },
  });
  await refreshPartnerTier(partner.id);
  return stateResponse(partner.id);
});
