import { NextRequest } from "next/server";
import { z } from "zod";
import { withCors, handleOptions } from "@/lib/api/cors";
import { ok, apiError } from "@/lib/api/response";
import { checkPhoneChallenge, createPhoneToken, phoneVerifySecret, readPhoneChallenge } from "@/lib/commerce/phone-verify";
import { checkoutPhone, phoneCheckStore, phoneCodeCheckLimited } from "@/lib/commerce/phone-verify.server";

// The checkout phone check for delivery partners (spec §6.1), step 2 of 2: POST { phone, code, challenge } (the
// challenge from /phone-code) → { phoneToken, phone, expiresAt } for the right code. Checkout takes the phoneToken
// with a partner-delivery order (src/app/api/public/store/[slug]/checkout/route.ts). 5 tries per code sent.

const CORS = { methods: ["POST", "OPTIONS"], headers: ["Content-Type"] };

export async function OPTIONS(req: NextRequest) {
  return handleOptions(req, CORS);
}

const VerifySchema = z.object({
  phone: z.string().max(40),
  code: z.string().max(20),
  challenge: z.string().max(2000),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const parsed = VerifySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return withCors(req, apiError("BAD_REQUEST", "Enter the 6-digit code we sent you."), CORS);
  const phone = checkoutPhone(parsed.data.phone);
  if (!phone) return withCors(req, apiError("BAD_REQUEST", "Enter a phone number with 7 to 15 digits."), CORS);

  const store = await phoneCheckStore(slug);
  if (!store) return withCors(req, apiError("NOT_FOUND", "Store not found", 404), CORS);
  const secret = phoneVerifySecret();
  if (!secret) return withCors(req, apiError("UNAVAILABLE", "We can't check codes right now. Try again later or message the store.", 503), CORS);

  const challenge = readPhoneChallenge(parsed.data.challenge, { phone, storeId: store.id }, secret);
  if (!challenge) return withCors(req, apiError("CODE_EXPIRED", "This code has expired. Send a new code."), CORS);
  const limited = await phoneCodeCheckLimited(phone, challenge.nonce);
  if (limited) return withCors(req, apiError("RATE_LIMITED", limited, 429), CORS);

  const checked = checkPhoneChallenge({ challenge: parsed.data.challenge, phone, storeId: store.id, code: parsed.data.code }, secret);
  if (!checked.ok) {
    return withCors(req, checked.reason === "invalid" ? apiError("CODE_EXPIRED", "This code has expired. Send a new code.") : apiError("WRONG_CODE", "That code isn't right. Check the message and try again."), CORS);
  }
  const { phoneToken, expiresAt } = createPhoneToken({ phone, storeId: store.id }, secret);
  const res = withCors(req, ok({ phoneToken, phone, expiresAt }), CORS);
  res.headers.set("Cache-Control", "no-store");
  return res;
}
