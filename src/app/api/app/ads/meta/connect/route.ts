import { NextRequest, NextResponse } from "next/server";
import { withSeller } from "@/lib/auth/middleware";
import { db } from "@/lib/db/client";
import { META_ADS_APP_COOKIE, META_ADS_NONCE_COOKIE, startMetaAdsConnect } from "@/lib/ad-campaigns/meta.server";
import { appReturnUrl } from "@/lib/sales-channels/pure";

export const dynamic = "force-dynamic";

// "Connect Meta ads": Facebook Login with the ads permissions; the nonce cookie ties the callback to this browser.
// From the phone app (?app=shopinbos://ads) the callback returns to the app (?meta=<result>) instead of /home/ads.
export const GET = withSeller(async (req: NextRequest, { user }) => {
  const app = appReturnUrl(req.nextUrl.searchParams.get("app"));
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true } });
  if (!store) return NextResponse.redirect(app ? withResult(app, "problem") : new URL("/onboarding", req.url));
  const started = startMetaAdsConnect(store.id);
  if (!started) return NextResponse.redirect(app ? withResult(app, "unavailable") : new URL("/home/ads?meta=unavailable", req.url));
  const response = NextResponse.redirect(started.url);
  const secure = req.nextUrl.protocol === "https:";
  response.cookies.set(META_ADS_NONCE_COOKIE, started.nonce, { httpOnly: true, secure, sameSite: "lax", path: "/api/app/ads/meta", maxAge: 15 * 60 });
  // Set or cleared every time, so a web Connect after an app one still ends on /home/ads.
  if (app) response.cookies.set(META_ADS_APP_COOKIE, app, { httpOnly: true, secure, sameSite: "lax", path: "/api/app/ads/meta", maxAge: 15 * 60 });
  else response.cookies.set(META_ADS_APP_COOKIE, "", { path: "/api/app/ads/meta", maxAge: 0 });
  return response;
});

function withResult(app: string, result: string) {
  return `${app}${app.includes("?") ? "&" : "?"}meta=${encodeURIComponent(result)}`;
}
