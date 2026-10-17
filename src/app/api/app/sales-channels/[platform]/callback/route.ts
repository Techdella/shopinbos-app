import { NextRequest, NextResponse } from "next/server";
import { withSeller } from "@/lib/auth/middleware";
import { db } from "@/lib/db/client";
import { credentialKey } from "@/lib/inbox/crypto";
import { appResultUrl, appReturnCookieName, appReturnUrl, checkCallbackState, isOAuthPlatform, nonceCookieName } from "@/lib/sales-channels/pure";
import { finishConnect } from "@/lib/sales-channels/server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// GET: the platform sends the seller back here. Only a fresh state we signed, for this platform, this seller's
// store and this browser (nonce cookie) is accepted; then the code becomes encrypted tokens and the catalog and
// feed are set up. Ends on /channels, where the card shows how it went, or back in the phone app when the sign-in
// started there (the connect route's app-return cookie).
export const GET = withSeller(async (req: NextRequest, { user, params }) => {
  const back = new URL("/channels", req.url);
  const platform = params.platform;
  if (!isOAuthPlatform(platform)) return NextResponse.redirect(back);
  const query = req.nextUrl.searchParams;
  const key = credentialKey();
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true } });
  const cookie = req.cookies.get(nonceCookieName(platform))?.value;
  const state = key ? checkCallbackState(query.get("state"), { platform, storeId: store?.id, nonceCookie: cookie }, key) : null;
  // Google and Meta send ?code=; TikTok sends ?auth_code=.
  const code = query.get("code") ?? query.get("auth_code");

  let response: NextResponse;
  if (!state || !store) {
    back.searchParams.set("problem", platform);
    response = NextResponse.redirect(back);
  } else if (query.get("error") || !code) {
    response = NextResponse.redirect(back); // they closed the sign-in: nothing to say
  } else {
    try {
      const outcome = await finishConnect(store.id, platform, code);
      back.searchParams.set(outcome === "connected" || outcome === "syncing" ? "connected" : "problem", platform);
    } catch (error) {
      console.error(`[sales-channels] ${platform} connect failed`, error instanceof Error ? error.message.slice(0, 200) : "unknown");
      back.searchParams.set("problem", platform);
    }
    back.hash = platform;
    response = NextResponse.redirect(back);
  }
  const app = appReturnUrl(req.cookies.get(appReturnCookieName(platform))?.value);
  if (app) {
    const result = back.searchParams.get("connected") ? "connected" : back.searchParams.get("problem") ? "problem" : "closed";
    response = NextResponse.redirect(appResultUrl(app, platform, result));
    response.cookies.set(appReturnCookieName(platform), "", { path: `/api/app/sales-channels/${platform}`, maxAge: 0 });
  }
  response.cookies.set(nonceCookieName(platform), "", { path: `/api/app/sales-channels/${platform}`, maxAge: 0 });
  return response;
});
