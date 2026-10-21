import "server-only";

import { db } from "@/lib/db/client";
import { deliverCode } from "@/lib/auth/otp-delivery.server";
import { whatsappCodesAvailable, type CodeChannel } from "@/lib/auth/otp-channel";
import { checkRateLimitShared, rateLimitKey, requestIp } from "@/lib/rate-limit";
import { platformSmsReady } from "@/lib/sms";
import { e164 } from "@/lib/sms/pure";
import { generatePhoneCode, phoneCodeMessage, phoneVerifySecret, verifyPhoneToken, PHONE_CODE_MAX_ATTEMPTS } from "./phone-verify";

// The checkout phone check, server side (the pure signing is ./phone-verify.ts). Used by
// /api/public/store/[slug]/checkout/phone-code (send), /phone-verify (check the code) and the checkout route
// (needs a phoneToken when the order goes with a delivery partner).

const MINUTE = 60_000;

/** E.164 for a phone a shopper typed ("0803…" → "+234803…"), the form the code and token are tied to. */
export function checkoutPhone(value: string | null | undefined): string | null {
  return e164(value);
}

/**
 * Can we send codes at all? Platform SMS keys or WhatsApp codes set up. When neither is, the check is SKIPPED
 * (checkout takes partner orders with an unverified phone, as before) so local dev and staging without SMS keys still
 * work. Production has SMS keys, so there it is always on.
 */
export function phoneVerificationAvailable(env: Record<string, string | undefined> = process.env): boolean {
  return platformSmsReady() || whatsappCodesAvailable(env);
}

/**
 * The live store for the phone routes, and whether its checkout uses delivery partners (only then is a code sent,
 * so the routes can't be used to text any number from any store).
 */
export async function phoneCheckStore(slug: string) {
  const store = await db.store.findUnique({ where: { slug }, select: { id: true, name: true, userId: true, status: true } });
  if (!store || store.status !== "active") return null;
  const settings = store.userId ? await db.deliverySettings.findUnique({ where: { userId: store.userId }, select: { checkoutMode: true } }) : null;
  return { id: store.id, name: store.name, partners: settings?.checkoutMode === "partners" };
}

let skipLogged = false;
/** Logs once per server instance that the check is off (no way to send codes). */
export function logPhoneCheckSkipped() {
  if (skipLogged) return;
  skipLogged = true;
  console.warn("[checkout-phone] No platform SMS or WhatsApp code provider is set up, so partner-delivery orders skip the phone check.");
}

/**
 * Limits on sending codes (fail closed: each one costs an SMS): per phone 3 in 10 minutes and 8 a day, and per IP
 * 10 in 10 minutes (shoppers behind one mobile carrier IP share it). Returns the message to show, or null.
 */
export async function phoneCodeSendLimited(headers: { get(name: string): string | null }, phone: string): Promise<string | null> {
  const ip = requestIp(headers);
  const checks = await Promise.all([
    checkRateLimitShared(rateLimitKey("checkout:phone-code:ip", ip), { maxRequests: 10, windowMs: 10 * MINUTE, failClosed: true }),
    checkRateLimitShared(rateLimitKey("checkout:phone-code:phone", phone), { maxRequests: 3, windowMs: 10 * MINUTE, failClosed: true }),
    checkRateLimitShared(rateLimitKey("checkout:phone-code:phone-day", phone), { maxRequests: 8, windowMs: 24 * 60 * MINUTE, failClosed: true, sliding: false }),
  ]);
  if (checks.every((check) => check.allowed)) return null;
  return checks[2]!.allowed ? "Too many codes for this number. Wait 10 minutes and try again." : "Too many codes for this number today. Try again tomorrow, or message the store.";
}

/**
 * Limits on checking codes (fail closed): 5 tries per challenge (one sent code), and per phone 10 in 10 minutes
 * across challenges, so asking for new codes can't buy endless guesses. Returns the message to show, or null.
 */
export async function phoneCodeCheckLimited(phone: string, nonce: string): Promise<string | null> {
  const [perChallenge, perPhone] = await Promise.all([
    checkRateLimitShared(rateLimitKey("checkout:phone-verify:challenge", nonce), { maxRequests: PHONE_CODE_MAX_ATTEMPTS, windowMs: 10 * MINUTE, failClosed: true, sliding: false }),
    checkRateLimitShared(rateLimitKey("checkout:phone-verify:phone", phone), { maxRequests: 10, windowMs: 10 * MINUTE, failClosed: true }),
  ]);
  if (!perChallenge.allowed) return "Too many wrong codes. Send a new code and try again.";
  if (!perPhone.allowed) return "Too many tries for this number. Wait 10 minutes and try again.";
  return null;
}

/** Sends a new code to `phone` (E.164) naming the store. WhatsApp first when set up, unless `via` is "sms". */
export async function sendPhoneCode(input: { phone: string; storeName: string; via?: CodeChannel }) {
  const code = generatePhoneCode();
  const sent = await deliverCode({ phone: input.phone, otp: code, message: phoneCodeMessage(input.storeName, code), via: input.via });
  return { code, sent };
}

export type PhoneTokenCheck = { ok: true; skipped: boolean } | { ok: false; message: string };

/**
 * Checkout: does this partner-delivery order carry a valid phoneToken for its buyer phone and store? Skipped (ok)
 * when codes can't be sent at all (see phoneVerificationAvailable). Fails closed without a secret in production.
 */
export function checkCheckoutPhoneToken(input: { storeId: string; buyerPhone: string | null | undefined; phoneToken: string | null | undefined }): PhoneTokenCheck {
  if (!phoneVerificationAvailable()) {
    logPhoneCheckSkipped();
    return { ok: true, skipped: true };
  }
  const message = "Verify your phone number so the delivery partner can reach you.";
  const secret = phoneVerifySecret();
  if (!secret) {
    console.error("[checkout-phone] CHECKOUT_PHONE_SECRET / JWT_SECRET isn't set: partner-delivery orders can't be checked.");
    return { ok: false, message };
  }
  const phone = checkoutPhone(input.buyerPhone);
  return verifyPhoneToken(input.phoneToken, { phone, storeId: input.storeId }, secret) ? { ok: true, skipped: false } : { ok: false, message };
}
