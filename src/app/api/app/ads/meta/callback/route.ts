import { NextRequest, NextResponse } from "next/server";
import { withSeller } from "@/lib/auth/middleware";
import { db } from "@/lib/db/client";
import { checkMetaAdsState, finishMetaAdsConnect, META_ADS_NONCE_COOKIE } from "@/lib/ad-campaigns/meta.server";

export const dynamic = "force-dynamic";

// Facebook sends the seller back here after "Connect Meta ads".
export const GET = withSeller(async (req: NextRequest, { user }) => {
  const back = new URL("/home/ads", req.url);
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true } });
  const code = req.nextUrl.searchParams.get("code");
  const valid = store && checkMetaAdsState(req.nextUrl.searchParams.get("state"), store.id, req.cookies.get(META_ADS_NONCE_COOKIE)?.value);
  if (!store || !code || !valid) {
    back.searchParams.set("meta", req.nextUrl.searchParams.get("error") ? "cancelled" : "problem");
  } else {
    try {
      back.searchParams.set("meta", await finishMetaAdsConnect(store.id, code));
    } catch (error) {
      console.error("[meta-ads] connect failed", error);
      back.searchParams.set("meta", "problem");
    }
  }
  const response = NextResponse.redirect(back);
  response.cookies.set(META_ADS_NONCE_COOKIE, "", { path: "/api/app/ads/meta", maxAge: 0 });
  return response;
});
