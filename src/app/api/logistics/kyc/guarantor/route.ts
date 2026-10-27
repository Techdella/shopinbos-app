import { z } from "zod";
import { apiError } from "@/lib/api/response";
import { db } from "@/lib/db/client";
import { e164 } from "@/lib/sms/pure";
import { readIdentityChecks } from "@shared/partner-tiers";
import { refreshPartnerTier } from "@/lib/logistics/partner-tiers.server";
import { sendGuarantorCode } from "@/lib/logistics/partner-kyc.server";
import { readJson, stateResponse, withKycPartner } from "../_partner";

// Guarantor step. PUT saves (or replaces) the guarantor and texts them a code with a link to confirm or decline
// (/guarantor/<token>); a changed guarantor starts again as "pending". POST { action: "resend" } texts them again.
const Schema = z.object({
  fullName: z.string().trim().min(3, "Type your guarantor's full name.").max(120),
  phone: z.string().trim().max(30),
  address: z.string().trim().min(5, "Type your guarantor's address.").max(300),
  relationship: z.string().trim().min(2, "Say how you know your guarantor.").max(60),
});

export const PUT = withKycPartner(async (req, { partner }) => {
  const parsed = Schema.safeParse(await readJson(req));
  if (!parsed.success) return apiError("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Check your guarantor's details.");
  const phone = e164(parsed.data.phone);
  if (!phone) return apiError("BAD_REQUEST", "Enter your guarantor's phone number, for example 0803 123 4567.");
  const own = readIdentityChecks(partner.identityChecks).phone?.value;
  if (own && own === phone) return apiError("BAD_REQUEST", "Your guarantor must be someone else, with their own phone number.");
  const details = { fullName: parsed.data.fullName, phone, address: parsed.data.address, relationship: parsed.data.relationship };
  const existing = await db.logisticsGuarantor.findUnique({ where: { logisticsPartnerId: partner.id } });
  const same = existing && existing.fullName === details.fullName && existing.phone === details.phone && existing.address === details.address && existing.relationship === details.relationship;
  if (same) return stateResponse(partner.id);
  const fresh = { status: "pending", respondedVia: null, respondedAt: null, codeHash: null, codeExpiresAt: null, codeAttempts: 0, tokenHash: null };
  await db.logisticsGuarantor.upsert({
    where: { logisticsPartnerId: partner.id },
    create: { logisticsPartnerId: partner.id, ...details },
    // A new phone number gets its own texts; the same person with a fixed address keeps the count.
    update: { ...details, ...fresh, ...(existing?.phone !== phone ? { sendCount: 0, lastSentAt: null } : {}) },
  });
  await refreshPartnerTier(partner.id);
  const sent = await sendGuarantorCode(partner.id);
  if (!sent.ok) return apiError("NOT_SENT", `Saved. ${sent.error}`, sent.status);
  return stateResponse(partner.id);
});

export const POST = withKycPartner(async (req, { partner }) => {
  const body = await readJson(req);
  if (body.action !== "resend") return apiError("BAD_REQUEST", "Nothing to do.");
  const sent = await sendGuarantorCode(partner.id);
  if (!sent.ok) return apiError("NOT_SENT", sent.error, sent.status);
  return stateResponse(partner.id);
});
