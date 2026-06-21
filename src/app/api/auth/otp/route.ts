import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type OtpBody = {
  action?: "send" | "verify";
  email?: string;
  token?: string;
};

function validEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as OtpBody | null;
  const email = body?.email?.trim().toLowerCase() ?? "";
  if (!validEmail(email)) {
    return NextResponse.json({ error: { message: "Enter a valid email address." } }, { status: 400 });
  }

  try {
    const supabase = await getSupabaseServerClient();
    if (body?.action === "send") {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { shouldCreateUser: false },
      });
      if (error) {
        return NextResponse.json({ error: { message: error.message } }, { status: error.status ?? 400 });
      }
      return NextResponse.json({ data: { sent: true } });
    }

    if (body?.action === "verify") {
      const token = body.token?.trim() ?? "";
      if (!/^\d{6}$/.test(token)) {
        return NextResponse.json({ error: { message: "Enter the 6-digit code from your email." } }, { status: 400 });
      }
      const { data, error } = await supabase.auth.verifyOtp({ email, token, type: "email" });
      if (error) {
        return NextResponse.json({ error: { message: error.message } }, { status: error.status ?? 400 });
      }
      return NextResponse.json({ data: { accessToken: data.session?.access_token ?? null } });
    }

    return NextResponse.json({ error: { message: "Unsupported OTP action." } }, { status: 400 });
  } catch (error) {
    console.error("Supabase OTP request failed", error);
    return NextResponse.json(
      { error: { message: "We could not reach the sign-in service. Check your connection and try again." } },
      { status: 503 },
    );
  }
}
