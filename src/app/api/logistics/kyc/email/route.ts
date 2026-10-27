import { apiError, ok } from "@/lib/api/response";
import { checkRateLimitShared, rateLimitKey } from "@/lib/rate-limit";
import { checkPhoneChallenge, createPhoneChallenge, generatePhoneCode, readPhoneChallenge } from "@/lib/commerce/phone-verify";
import { sendPlatformEmail } from "@/lib/email/compliance.server";
import { KYC_CODE_SEND_LIMIT, cleanEmail } from "@/lib/logistics/partner-kyc";
import { confirmedAuthEmail, kycSecret, updateIdentityChecks } from "@/lib/logistics/partner-kyc.server";
import { readJson, stateResponse, withKycPartner } from "../_partner";

// Identity step: the partner's email. The email they signed in with, once Supabase confirmed it, counts at once;
// another one gets a 6-digit code (the same signed challenge as the phone, with the email in the phone's place).
//   { action: "send", email }                       → the page state (account email) or { challenge }
//   { action: "verify", email, challenge, code }    → the page state, email approved
export const POST = withKycPartner(async (req, { user, partner }) => {
  const body = await readJson(req);
  const email = cleanEmail(body.email);
  if (!email) return apiError("BAD_REQUEST", "Enter your email address.");
  const approve = async () => {
    await updateIdentityChecks(partner.id, (current) => ({ ...current, email: { value: email, status: "approved", verifiedAt: new Date().toISOString() } }));
    return stateResponse(partner.id);
  };
  const secret = kycSecret();
  if (!secret) return apiError("UNAVAILABLE", "We can't send codes right now. Try again later.", 503);
  const scope = `partner-kyc-email:${partner.id}`;

  if (body.action === "send") {
    if ((await confirmedAuthEmail(user.supabaseId)) === email) return approve();
    const limit = await checkRateLimitShared(rateLimitKey("partner-kyc:email-code", partner.id), { ...KYC_CODE_SEND_LIMIT, failClosed: true });
    if (!limit.allowed) return apiError("RATE_LIMITED", "Too many codes. Wait 10 minutes and try again.", 429);
    const code = generatePhoneCode();
    const sent = await sendPlatformEmail({
      to: email,
      user: { id: user.id, role: user.role },
      kind: "transactional",
      subject: `${code} is your Shopinbos verification code`,
      preheader: `Your delivery partner verification code is ${code}.`,
      heading: "Confirm your email",
      bodyHtml: `<p>Your Shopinbos delivery partner verification code is</p><p style="font-size:28px;font-weight:700;letter-spacing:4px">${code}</p><p>It works for 10 minutes. Don't share it with anyone.</p>`,
      reason: "you asked to confirm this email for your Shopinbos delivery partner verification",
    });
    if (!sent.success) {
      console.error("[partner-kyc email] code not sent", sent.message);
      return apiError("UNAVAILABLE", "We couldn't send the email just now. Try again in a few minutes.", 503);
    }
    const { challenge } = createPhoneChallenge({ phone: email, storeId: scope, code }, secret);
    return ok({ challenge });
  }

  if (body.action === "verify") {
    const read = readPhoneChallenge(body.challenge, { phone: email, storeId: scope }, secret);
    if (!read) return apiError("BAD_REQUEST", "That code has expired. Send a new code.");
    const tries = await checkRateLimitShared(rateLimitKey("partner-kyc:email-verify", read.nonce), { maxRequests: 5, windowMs: 10 * 60_000, failClosed: true, sliding: false });
    if (!tries.allowed) return apiError("RATE_LIMITED", "Too many wrong codes. Send a new code and try again.", 429);
    const check = checkPhoneChallenge({ challenge: body.challenge, phone: email, storeId: scope, code: body.code }, secret);
    if (!check.ok) return apiError("BAD_REQUEST", check.reason === "invalid" ? "That code has expired. Send a new code." : "That code isn't right. Check it and try again.");
    return approve();
  }

  return apiError("BAD_REQUEST", "Send a code first.");
});
