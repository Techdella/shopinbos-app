import { NextRequest, NextResponse } from "next/server";
import { REFERRAL_COOKIE, REFERRAL_COOKIE_DAYS, asReferralRole, cleanReferralCode } from "@shared/referrals";

export const dynamic = "force-dynamic";

// GET /r/CODE(?for=supplier): an invite link (Refer & earn). Remembers the code for 30 days (the sib_ref cookie, read
// once the account exists) and opens the invite page. ?for= picks which sign-up the page puts first.
export async function GET(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const code = cleanReferralCode((await params).code);
  const role = asReferralRole(req.nextUrl.searchParams.get("for"));
  if (!code) return NextResponse.redirect(new URL("/signup", req.url));
  const response = NextResponse.redirect(new URL(`/invite/${code}${role ? `?for=${role}` : ""}`, req.url));
  response.cookies.set(REFERRAL_COOKIE, code, {
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
    maxAge: REFERRAL_COOKIE_DAYS * 86_400,
  });
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
