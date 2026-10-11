import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { isValidEmail, OTP_LENGTH } from "@shared/phone";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SignupRole = "seller" | "supplier" | "logistics_partner";

type OtpBody = {
  action?: "send" | "verify";
  email?: string;
  /** E.164, e.g. +2348031234567 */
  phone?: string;
  /** Where to send a phone code. Defaults to WhatsApp. */
  via?: "whatsapp" | "sms";
  token?: string;
  /** true when this code also creates the account (sign up), false for sign in. */
  create?: boolean;
  profile?: { fullName?: string; role?: SignupRole; businessName?: string };
};

const SIGNUP_ROLES = new Set<SignupRole>(["seller", "supplier", "logistics_partner"]);

function fail(message: string, status = 400) {
  return NextResponse.json({ error: { message } }, { status });
}

function friendlyAuthError(message: string, phone: boolean) {
  if (/signups not allowed|user not found/i.test(message)) {
    return "We couldn't find an account for that. Check it, or create a new shop.";
  }
  if (/unsupported phone provider|phone provider/i.test(message) && phone) {
    return "Phone codes aren't switched on yet. Use email for now.";
  }
  if (/expired|invalid/i.test(message) && /token|otp/i.test(message)) {
    return "That code is wrong or has expired. Check it, or ask for a new one.";
  }
  return message;
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as OtpBody | null;
  const email = body?.email?.trim().toLowerCase() ?? "";
  const phone = body?.phone?.trim() ?? "";
  const usePhone = Boolean(phone);

  if (usePhone ? !/^\+\d{8,15}$/.test(phone) : !isValidEmail(email)) {
    return fail(usePhone ? "Enter a valid phone number." : "Enter a valid email address.");
  }

  try {
    const supabase = await getSupabaseServerClient();

    if (body?.action === "send") {
      const create = body.create === true;
      const role = body.profile?.role && SIGNUP_ROLES.has(body.profile.role) ? body.profile.role : "seller";
      const data = create
        ? {
            role,
            full_name: body.profile?.fullName?.trim() || undefined,
            business_name: body.profile?.businessName?.trim() || undefined,
          }
        : undefined;

      const { error } = usePhone
        ? await supabase.auth.signInWithOtp({
            phone,
            options: { shouldCreateUser: create, channel: body.via === "sms" ? "sms" : "whatsapp", data },
          })
        : await supabase.auth.signInWithOtp({
            email,
            options: { shouldCreateUser: create, data },
          });
      if (error) return fail(friendlyAuthError(error.message, usePhone), error.status ?? 400);
      return NextResponse.json({ data: { sent: true } });
    }

    if (body?.action === "verify") {
      const token = body.token?.trim() ?? "";
      if (!new RegExp(`^\\d{${OTP_LENGTH}}$`).test(token)) {
        return fail(`Enter the ${OTP_LENGTH}-digit code we sent you.`);
      }
      const { data, error } = usePhone
        ? await supabase.auth.verifyOtp({ phone, token, type: "sms" })
        : await supabase.auth.verifyOtp({ email, token, type: "email" });
      if (error) return fail(friendlyAuthError(error.message, usePhone), error.status ?? 400);
      return NextResponse.json({ data: { accessToken: data.session?.access_token ?? null } });
    }

    return fail("Unsupported OTP action.");
  } catch (error) {
    console.error("Supabase OTP request failed", error);
    return fail("We could not reach the sign-in service. Check your connection and try again.", 503);
  }
}
