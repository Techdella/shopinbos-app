import { NextRequest } from "next/server";
import { z } from "zod";
import { ok, apiError } from "@/lib/api/response";
import { db } from "@/lib/db/client";
import { deliverCode } from "@/lib/auth/otp-delivery.server";
import { checkPhoneChallenge, createPhoneChallenge, generatePhoneCode, phoneVerifySecret, readPhoneChallenge, PHONE_CODE_RESEND_SECONDS } from "@/lib/commerce/phone-verify";
import { phoneCodeCheckLimited, phoneCodeSendLimited, phoneVerificationAvailable } from "@/lib/commerce/phone-verify.server";
import { newRiderToken } from "@/lib/logistics/rider-token";
import { e164 } from "@/lib/sms/pure";

export const dynamic = "force-dynamic";

// Riders sign in on the phone app with the number their delivery partner added for them ("Simple app, end to end"
// prototype: phone → WhatsApp code), instead of opening the private link.
//   POST { phone, via? }                 → texts a 6-digit code (WhatsApp first) and returns a signed `challenge`.
//   POST { phone, challenge, code }      → checks it and returns { token }: the rider's Riders app key, sent as
//                                          X-Rider-Token to /api/mobile/logistics/rider like a link's token.
// Signing in makes a new key, so the private link the partner shared before stops working (one key per rider; the
// partner can share a new link any time). Same limits as the checkout phone check; nothing is stored until it's right.

const SCOPE = "rider-sign-in";

const Body = z.object({
  phone: z.string().max(40),
  via: z.enum(["whatsapp", "sms"]).optional(),
  challenge: z.string().max(600).optional(),
  code: z.string().max(12).optional(),
});

/** The active riders with this number (a rider may ride for more than one partner): the latest one signs in. */
async function riderForPhone(phone: string) {
  const tail = phone.replace(/\D/g, "").slice(-9);
  const riders = await db.logisticsTeamMember.findMany({
    where: { role: "rider", status: "active", phone: { contains: tail.slice(-7) }, logisticsPartner: { status: "active" } },
    orderBy: { updatedAt: "desc" },
    select: { id: true, name: true, phone: true, logisticsPartner: { select: { displayName: true } } },
    take: 20,
  });
  return riders.find((rider) => e164(rider.phone) === phone) ?? null;
}

const NOT_A_RIDER = "We can't find a rider with this number. Ask your delivery partner to add it in their Riders list, or open the link they sent you.";

export async function POST(req: NextRequest) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("BAD_REQUEST", "Enter your phone number.");
  const phone = e164(parsed.data.phone);
  if (!phone) return apiError("BAD_REQUEST", "Enter a phone number with 7 to 15 digits.");
  const secret = phoneVerifySecret();
  if (!secret || !phoneVerificationAvailable()) return apiError("UNAVAILABLE", "Signing in with a code isn't available right now. Open the link your delivery partner sent you.", 503);

  // Step 2: the code.
  if (parsed.data.challenge || parsed.data.code) {
    const read = readPhoneChallenge(parsed.data.challenge, { phone, storeId: SCOPE }, secret);
    if (!read) return apiError("CODE_EXPIRED", "This code has expired. Send a new one.");
    const limited = await phoneCodeCheckLimited(phone, read.nonce);
    if (limited) return apiError("RATE_LIMITED", limited, 429);
    const check = checkPhoneChallenge({ challenge: parsed.data.challenge, phone, storeId: SCOPE, code: parsed.data.code }, secret);
    if (!check.ok) return apiError(check.reason === "wrong_code" ? "WRONG_CODE" : "CODE_EXPIRED", check.reason === "wrong_code" ? "That code isn't right. Check the message and try again." : "This code has expired. Send a new one.");
    const rider = await riderForPhone(phone);
    if (!rider) return apiError("NOT_FOUND", NOT_A_RIDER, 404);
    const { token, hash } = newRiderToken();
    await db.logisticsTeamMember.update({ where: { id: rider.id }, data: { riderTokenHash: hash } });
    const res = ok({ token, name: rider.name, partnerName: rider.logisticsPartner.displayName });
    res.headers.set("Cache-Control", "no-store");
    return res;
  }

  // Step 1: send the code, only to a number a partner added as a rider.
  const limited = await phoneCodeSendLimited(req.headers, phone);
  if (limited) return apiError("RATE_LIMITED", limited, 429);
  if (!(await riderForPhone(phone))) return apiError("NOT_FOUND", NOT_A_RIDER, 404);
  const code = generatePhoneCode();
  const sent = await deliverCode({ phone, otp: code, message: `Shopinbos: your rider sign-in code is ${code}. Don't share it with anyone.`, via: parsed.data.via });
  if (!sent.ok) {
    console.error("[rider-sign-in] couldn't send the code", sent.error);
    return apiError("SEND_FAILED", "We couldn't send a code to this number. Check it and try again.", 502);
  }
  const { challenge, expiresAt } = createPhoneChallenge({ phone, storeId: SCOPE, code }, secret);
  const res = ok({ challenge, channel: sent.channel, expiresAt, resendAfter: PHONE_CODE_RESEND_SECONDS });
  res.headers.set("Cache-Control", "no-store");
  return res;
}
