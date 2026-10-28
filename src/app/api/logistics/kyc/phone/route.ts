import { apiError, ok } from "@/lib/api/response";
import { e164 } from "@/lib/sms/pure";
import { checkRateLimitShared, rateLimitKey } from "@/lib/rate-limit";
import { checkPhoneChallenge, createPhoneChallenge, generatePhoneCode, readPhoneChallenge } from "@/lib/commerce/phone-verify";
import { deliverCode } from "@/lib/auth/otp-delivery.server";
import { KYC_CODE_SEND_LIMIT, partnerPhoneCodeMessage } from "@/lib/logistics/partner-kyc";
import { confirmedAuthPhone, kycSecret, updateIdentityChecks } from "@/lib/logistics/partner-kyc.server";
import { readJson, stateResponse, withKycPartner } from "../_partner";

// Identity step: the partner's phone, confirmed by a 6-digit code (WhatsApp first when set up, else SMS). Uses the
// checkout phone check's signed challenge (src/lib/commerce/phone-verify.ts) scoped to "partner-kyc:<partnerId>".
//   { action: "send", phone }                       → { challenge }
//   { action: "verify", phone, challenge, code }    → the page state, phone approved
export const POST = withKycPartner(async (req, { user, partner }) => {
  const body = await readJson(req);
  const phone = e164(typeof body.phone === "string" ? body.phone : "");
  if (!phone) return apiError("BAD_REQUEST", "Enter your phone number, for example 0803 123 4567.");
  const secret = kycSecret();
  if (!secret) return apiError("UNAVAILABLE", "We can't send codes right now. Try again later.", 503);
  const scope = `partner-kyc:${partner.id}`;

  if (body.action === "send") {
    // The number they signed up with was already confirmed by a code: it counts at once (like the email step).
    if ((await confirmedAuthPhone(user.supabaseId)) === phone) {
      await updateIdentityChecks(partner.id, (current) => ({ ...current, phone: { value: phone, status: "approved", verifiedAt: new Date().toISOString() } }));
      return stateResponse(partner.id);
    }
    const limit = await checkRateLimitShared(rateLimitKey("partner-kyc:phone-code", partner.id), { ...KYC_CODE_SEND_LIMIT, failClosed: true });
    if (!limit.allowed) return apiError("RATE_LIMITED", "Too many codes. Wait 10 minutes and try again.", 429);
    const code = generatePhoneCode();
    const sent = await deliverCode({ phone, otp: code, message: partnerPhoneCodeMessage(code) });
    if (!sent.ok) {
      console.error("[partner-kyc phone] code not sent", sent.error);
      return apiError("UNAVAILABLE", "We couldn't send the code just now. Check the number and try again.", 503);
    }
    const { challenge } = createPhoneChallenge({ phone, storeId: scope, code }, secret);
    return ok({ challenge, channel: sent.channel });
  }

  if (body.action === "verify") {
    const read = readPhoneChallenge(body.challenge, { phone, storeId: scope }, secret);
    if (!read) return apiError("BAD_REQUEST", "That code has expired. Send a new code.");
    const tries = await checkRateLimitShared(rateLimitKey("partner-kyc:phone-verify", read.nonce), { maxRequests: 5, windowMs: 10 * 60_000, failClosed: true, sliding: false });
    if (!tries.allowed) return apiError("RATE_LIMITED", "Too many wrong codes. Send a new code and try again.", 429);
    const check = checkPhoneChallenge({ challenge: body.challenge, phone, storeId: scope, code: body.code }, secret);
    if (!check.ok) return apiError("BAD_REQUEST", check.reason === "invalid" ? "That code has expired. Send a new code." : "That code isn't right. Check it and try again.");
    await updateIdentityChecks(partner.id, (current) => ({ ...current, phone: { value: phone, status: "approved", verifiedAt: new Date().toISOString() } }));
    return stateResponse(partner.id);
  }

  return apiError("BAD_REQUEST", "Send a code first.");
});
