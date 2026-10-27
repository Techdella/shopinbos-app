import { z } from "zod";
import { apiError } from "@/lib/api/response";
import { NG_STATES } from "@shared/delivery-market";
import { readIdentityChecks } from "@shared/partner-tiers";
import { cleanNamePart } from "@/lib/logistics/partner-kyc";
import { updateIdentityChecks } from "@/lib/logistics/partner-kyc.server";
import { readJson, stateResponse, withKycPartner } from "../_partner";

// Identity step: full name (first and last, as on the NIN) and the self-declared address.
const Schema = z.object({
  firstName: z.string().max(60).optional(),
  lastName: z.string().max(60).optional(),
  address: z.string().trim().min(5, "Type your full address.").max(300).optional(),
  state: z.string().max(40).optional(),
});

export const PATCH = withKycPartner(async (req, { partner }) => {
  const parsed = Schema.safeParse(await readJson(req));
  if (!parsed.success) return apiError("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Check your details.");
  const { firstName, lastName, address, state } = parsed.data;
  let fullName: string | undefined;
  if (firstName !== undefined || lastName !== undefined) {
    const first = cleanNamePart(firstName);
    const last = cleanNamePart(lastName);
    if (!first || !last) return apiError("BAD_REQUEST", "Type your first and last name as they are on your NIN.");
    fullName = `${first} ${last}`;
  }
  const current = readIdentityChecks(partner.identityChecks);
  if (fullName && current.nin?.status === "approved" && fullName.toUpperCase() !== current.fullName?.toUpperCase()) {
    return apiError("CONFLICT", "Your name was checked against your NIN. Talk to the Shopinbos team in Help to change it.", 409);
  }
  await updateIdentityChecks(partner.id, (current) => {
    const next = { ...current };
    if (fullName) next.fullName = fullName;
    if (address) next.address = { value: address, ...(state && (NG_STATES as readonly string[]).includes(state) ? { state } : {}) };
    return next;
  });
  return stateResponse(partner.id);
});
