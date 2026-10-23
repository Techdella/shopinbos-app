import { NextRequest } from "next/server";
import { isValidEmail, OTP_LENGTH } from "@shared/phone";
import { getAuthRouteClient } from "@/lib/auth/session.server";
import { clearAuthFailures, consumeAuthLimit, lockedForSeconds, recordAuthFailure } from "@/lib/auth/throttle";
import { clientIp, deviceCookie, logAuthEvent, recordSignIn } from "@/lib/auth/events";
import { authError, authJson, rateLimited } from "@/lib/auth/responses";
import { db } from "@/lib/db/client";
import { chooseCodeChannel, whatsappCodesAvailable } from "@/lib/auth/otp-channel";
import { channelUsedFor, rememberWantedChannel } from "@/lib/auth/otp-delivery.server";
import { PHONE_TAKEN, phoneOwner, signsInWithPhone } from "@/lib/auth/phone-owner.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SignupRole = "seller" | "supplier" | "logistics_partner";

type OtpBody = {
  action?: "send" | "verify";
  email?: string;
  /** E.164, e.g. +2348031234567 */
  phone?: string;
  /**
   * "whatsapp" (or nothing, from older clients): WhatsApp when it is set up (AUTH_OTP_WHATSAPP), else SMS.
   * "sms": always SMS (the "No WhatsApp on this number? Send it by SMS" link).
   */
  via?: "whatsapp" | "sms";
  token?: string;
  /** true when this code also creates the account (sign up), false for sign in. */
  create?: boolean;
  profile?: { fullName?: string; role?: SignupRole; businessName?: string };
};

const SIGNUP_ROLES = new Set<SignupRole>(["seller", "supplier", "logistics_partner"]);

/** One message for every wrong, expired or unknown code, so it never tells whether an account exists. */
const WRONG_CODE = "That code is wrong or has expired. Check it, or ask for a new one.";

function fail(message: string, status = 400, code = "BAD_REQUEST") {
  return authError(code, message, status);
}

function friendlySendError(message: string, phone: boolean) {
  if (/unsupported phone provider|phone provider/i.test(message) && phone) {
    return "Phone codes aren't switched on yet. Use email for now.";
  }
  if (/rate limit|too many|security purposes/i.test(message)) {
    return "Please wait a minute before asking for another code.";
  }
  return "We couldn't send a code right now. Please try again.";
}

/** Public flag for the sign-in screens: can phone codes go by WhatsApp? `{ data: { whatsapp: boolean } }` */
export async function GET() {
  return authJson({ whatsapp: whatsappCodesAvailable(process.env) });
}

/**
 * A brand-new account asks "What should we call you?" after the code (Prototype 10). Existing accounts (an app
 * user row, or a name saved at sign-up by older clients, the phone app or Google) skip it.
 */
async function needsName(user: { id: string; user_metadata?: Record<string, unknown> | null }) {
  const meta = user.user_metadata ?? {};
  if ([meta.full_name, meta.fullName, meta.name].some((value) => typeof value === "string" && value.trim())) return false;
  const existing = await db.user.findUnique({ where: { supabaseId: user.id }, select: { name: true } }).catch(() => ({ name: "unknown" }));
  // "Shopinbos User" is the stand-in name when someone left at the name screen and the account row was made later.
  return !existing || existing.name.trim() === "Shopinbos User";
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as OtpBody | null;
  const email = body?.email?.trim().toLowerCase() ?? "";
  const phone = body?.phone?.trim() ?? "";
  const usePhone = Boolean(phone);
  const identifier = usePhone ? phone : email;
  const ip = clientIp(request);

  if (usePhone ? !/^\+\d{8,15}$/.test(phone) : !isValidEmail(email)) {
    return fail(usePhone ? "Enter a valid phone number." : "Enter a valid email address.");
  }

  try {
    const supabase = await getAuthRouteClient();

    if (body?.action === "send") {
      const wait = await consumeAuthLimit("otpSend", ip, identifier);
      if (wait) return rateLimited(wait, "codes requested");

      const create = body.create === true;
      // One account per phone number: signing up with a number another account already has (say, an email account
      // that saved it in its profile) is refused. A number that is that account's own phone login just signs in.
      if (create && usePhone) {
        const owner = await phoneOwner(phone);
        if (owner && !(await signsInWithPhone(owner.supabaseId, phone))) return fail(PHONE_TAKEN, 409, "PHONE_TAKEN");
      }
      const role = body.profile?.role && SIGNUP_ROLES.has(body.profile.role) ? body.profile.role : "seller";
      const data = create
        ? {
            role,
            full_name: body.profile?.fullName?.trim() || undefined,
            business_name: body.profile?.businessName?.trim() || undefined,
          }
        : undefined;

      // Phone: note the channel to try; the Send SMS hook reads it (Supabase itself is always asked for SMS).
      const wanted = usePhone ? chooseCodeChannel(body.via, whatsappCodesAvailable(process.env)) : null;
      if (usePhone && wanted) await rememberWantedChannel(phone, wanted);

      const { error } = usePhone
        ? await supabase.auth.signInWithOtp({
            phone,
            options: { shouldCreateUser: create, channel: "sms", data },
          })
        : await supabase.auth.signInWithOtp({
            email,
            options: { shouldCreateUser: create, data },
          });
      if (error) {
        // Signing in with an email or phone that has no account looks exactly like a sent code.
        if (/signups not allowed|user not found/i.test(error.message)) {
          await logAuthEvent(request, { type: "login_failure", method: usePhone ? "otp_phone" : "otp_email", detail: { reason: "unknown_identifier" } });
          // Same answer as a real send, so it never tells whether an account exists.
          return authJson(usePhone ? { sent: true, channel: wanted } : { sent: true, channel: "email" });
        }
        return fail(friendlySendError(error.message, usePhone), error.status === 429 ? 429 : 400, error.status === 429 ? "RATE_LIMITED" : "BAD_REQUEST");
      }
      // The channel that really carried the code (WhatsApp, or SMS when WhatsApp is off or failed).
      return authJson(usePhone ? { sent: true, channel: await channelUsedFor(phone) } : { sent: true, channel: "email" });
    }

    if (body?.action === "verify") {
      const token = body.token?.trim() ?? "";
      if (!new RegExp(`^\\d{${OTP_LENGTH}}$`).test(token)) {
        return fail(`Enter the ${OTP_LENGTH}-digit code we sent you.`);
      }
      const locked = await lockedForSeconds(identifier);
      if (locked) return rateLimited(locked, "wrong codes");
      const wait = await consumeAuthLimit("otpVerify", ip, identifier);
      if (wait) return rateLimited(wait);

      const method = usePhone ? "otp_phone" : "otp_email";
      const { data, error } = usePhone
        ? await supabase.auth.verifyOtp({ phone, token, type: "sms" })
        : await supabase.auth.verifyOtp({ email, token, type: "email" });
      if (error || !data.user) {
        const lockedNow = await recordAuthFailure(identifier);
        await logAuthEvent(request, { type: lockedNow ? "login_locked" : "login_failure", method });
        if (lockedNow) return rateLimited(lockedNow, "wrong codes");
        return fail(WRONG_CODE, 400, "INVALID_CODE");
      }

      await clearAuthFailures(identifier);
      const deviceId = await recordSignIn(request, data.user, method);
      const response = authJson({ accessToken: data.session?.access_token ?? null, needsName: await needsName(data.user) });
      const device = deviceCookie(deviceId);
      response.cookies.set(device.name, device.value, device.options);
      return response;
    }

    return fail("Unsupported OTP action.");
  } catch (error) {
    console.error("Supabase OTP request failed", error);
    return fail("We could not reach the sign-in service. Check your connection and try again.", 503, "UNAVAILABLE");
  }
}
