import { NextRequest, NextResponse } from "next/server";
import { REFERRAL_COOKIE, REFERRAL_COOKIE_DAYS, REFERRAL_SOURCE_COOKIE, asReferralRole, asReferralSource, cleanReferralCode } from "@shared/referrals";

export const dynamic = "force-dynamic";

// GET /r/CODE(?for=supplier&src=profile): an invite link (Refer & earn). Remembers the code for 30 days (the sib_ref
// cookie, read once the account exists) and opens the invite page. ?for= picks which sign-up the page puts first;
// src=profile marks it as coming from the "Join Shopinbos" buttons on a supplier's or delivery partner's profile.
export async function GET(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const code = cleanReferralCode((await params).code);
  const role = asReferralRole(req.nextUrl.searchParams.get("for"));
  const source = asReferralSource(req.nextUrl.searchParams.get("src"));
  if (!code) return NextResponse.redirect(new URL("/signup", req.url));
  const response = NextResponse.redirect(new URL(`/invite/${code}${role ? `?for=${role}` : ""}`, req.url));
  const options = {
    path: "/",
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
    maxAge: REFERRAL_COOKIE_DAYS * 86_400,
  };
  response.cookies.set(REFERRAL_COOKIE, code, options);
  // The latest link opened decides where the referral came from, like it decides the code.
  if (source === "profile") response.cookies.set(REFERRAL_SOURCE_COOKIE, source, options);
  else response.cookies.delete(REFERRAL_SOURCE_COOKIE);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
