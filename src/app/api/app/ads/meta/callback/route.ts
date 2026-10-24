import { NextRequest, NextResponse } from "next/server";
import { withSeller } from "@/lib/auth/middleware";
import { db } from "@/lib/db/client";
import { checkMetaAdsState, finishMetaAdsConnect, META_ADS_APP_COOKIE, META_ADS_NONCE_COOKIE } from "@/lib/ad-campaigns/meta.server";
import { appReturnUrl } from "@/lib/sales-channels/pure";

export const dynamic = "force-dynamic";

// Facebook sends the seller back here after "Connect Meta ads": to /home/ads, or into the phone app when Connect
// started there (the app's return address is in an httpOnly cookie, see ../connect).
export const GET = withSeller(async (req: NextRequest, { user }) => {
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true } });
  const code = req.nextUrl.searchParams.get("code");
  const valid = store && checkMetaAdsState(req.nextUrl.searchParams.get("state"), store.id, req.cookies.get(META_ADS_NONCE_COOKIE)?.value);
  let result: string;
  if (!store || !code || !valid) {
    result = req.nextUrl.searchParams.get("error") ? "cancelled" : "problem";
  } else {
    try {
      result = await finishMetaAdsConnect(store.id, code);
    } catch (error) {
      console.error("[meta-ads] connect failed", error);
      result = "problem";
    }
  }
  const app = appReturnUrl(req.cookies.get(META_ADS_APP_COOKIE)?.value);
  const back = new URL("/home/ads", req.url);
  back.searchParams.set("meta", result);
  const response = NextResponse.redirect(app ? `${app}${app.includes("?") ? "&" : "?"}meta=${encodeURIComponent(result)}` : back);
  response.cookies.set(META_ADS_NONCE_COOKIE, "", { path: "/api/app/ads/meta", maxAge: 0 });
  response.cookies.set(META_ADS_APP_COOKIE, "", { path: "/api/app/ads/meta", maxAge: 0 });
  return response;
});
