import { NextRequest } from "next/server";
import { z } from "zod";
import { withCors, handleOptions } from "@/lib/api/cors";
import { ok, apiError } from "@/lib/api/response";
import { createPhoneChallenge, phoneVerifySecret, PHONE_CODE_RESEND_SECONDS } from "@/lib/commerce/phone-verify";
import { checkoutPhone, phoneCheckStore, phoneCodeSendLimited, phoneVerificationAvailable, sendPhoneCode } from "@/lib/commerce/phone-verify.server";

// The checkout phone check for delivery partners (spec §6.1), step 1 of 2.
//   GET  → { required }: does this store's checkout ask partner-delivery shoppers to verify their phone? False when
//          the store doesn't use delivery partners, or when no SMS / WhatsApp code provider is set up (dev, staging:
//          checkout then skips the check, see phoneVerificationAvailable).
//   POST { phone, via? } → texts a 6-digit code naming the store (WhatsApp first when set up; via "sms" forces SMS)
//          and returns a signed `challenge` (src/lib/commerce/phone-verify.ts) to send back with the code to
//          /phone-verify. Nothing is stored. Limited per phone and per IP.

const CORS = { methods: ["GET", "POST", "OPTIONS"], headers: ["Content-Type"] };

export async function OPTIONS(req: NextRequest) {
  return handleOptions(req, CORS);
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const store = await phoneCheckStore(slug);
  if (!store) return withCors(req, apiError("NOT_FOUND", "Store not found", 404), CORS);
  const res = withCors(req, ok({ required: store.partners && phoneVerificationAvailable() }), CORS);
  res.headers.set("Cache-Control", "no-store");
  return res;
}

const SendSchema = z.object({
  phone: z.string().max(40),
  via: z.enum(["whatsapp", "sms"]).optional(),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const parsed = SendSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return withCors(req, apiError("BAD_REQUEST", "Enter your phone number."), CORS);
  const phone = checkoutPhone(parsed.data.phone);
  if (!phone) return withCors(req, apiError("BAD_REQUEST", "Enter a phone number with 7 to 15 digits."), CORS);

  const store = await phoneCheckStore(slug);
  if (!store) return withCors(req, apiError("NOT_FOUND", "Store not found", 404), CORS);
  if (!store.partners) return withCors(req, apiError("BAD_REQUEST", "This store doesn't need a phone code."), CORS);
  if (!phoneVerificationAvailable()) return withCors(req, ok({ required: false }), CORS);
  const secret = phoneVerifySecret();
  if (!secret) {
    console.error("[checkout-phone] CHECKOUT_PHONE_SECRET / JWT_SECRET isn't set, so no codes can be sent.");
    return withCors(req, apiError("UNAVAILABLE", "We can't send codes right now. Try again later or message the store.", 503), CORS);
  }

  const limited = await phoneCodeSendLimited(req.headers, phone);
  if (limited) return withCors(req, apiError("RATE_LIMITED", limited, 429), CORS);

  const { code, sent } = await sendPhoneCode({ phone, storeName: store.name, via: parsed.data.via });
  if (!sent.ok) {
    console.error("[checkout-phone] couldn't send the code", sent.error);
    return withCors(req, apiError("SEND_FAILED", "We couldn't send a code to this number. Check it and try again.", 502), CORS);
  }
  const { challenge, expiresAt } = createPhoneChallenge({ phone, storeId: store.id, code }, secret);
  const res = withCors(req, ok({ required: true, challenge, channel: sent.channel, expiresAt, resendAfter: PHONE_CODE_RESEND_SECONDS }), CORS);
  res.headers.set("Cache-Control", "no-store");
  return res;
}
