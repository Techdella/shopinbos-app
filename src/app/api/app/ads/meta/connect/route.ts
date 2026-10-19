import { NextRequest, NextResponse } from "next/server";
import { withSeller } from "@/lib/auth/middleware";
import { db } from "@/lib/db/client";
import { META_ADS_NONCE_COOKIE, startMetaAdsConnect } from "@/lib/ad-campaigns/meta.server";

export const dynamic = "force-dynamic";

// "Connect Meta ads": Facebook Login with the ads permissions; the nonce cookie ties the callback to this browser.
export const GET = withSeller(async (req: NextRequest, { user }) => {
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true } });
  if (!store) return NextResponse.redirect(new URL("/onboarding", req.url));
  const started = startMetaAdsConnect(store.id);
  if (!started) return NextResponse.redirect(new URL("/home/ads?meta=unavailable", req.url));
  const response = NextResponse.redirect(started.url);
  response.cookies.set(META_ADS_NONCE_COOKIE, started.nonce, { httpOnly: true, secure: req.nextUrl.protocol === "https:", sameSite: "lax", path: "/api/app/ads/meta", maxAge: 15 * 60 });
  return response;
});
