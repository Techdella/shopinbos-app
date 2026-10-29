import { NextRequest, NextResponse } from "next/server";
import { withSeller } from "@/lib/auth/middleware";
import { db } from "@/lib/db/client";
import { credentialKey } from "@/lib/inbox/crypto";
import { appResultUrl, appReturnCookieName, appReturnUrl, checkCallbackState, isOAuthPlatform, nonceCookieName, returnCookieName, safeReturnPath } from "@/lib/sales-channels/pure";
import { finishConnect } from "@/lib/sales-channels/server";
import { appConnectedDeepLink, appConnectedPagePath, isConnectedReturn } from "@shared/app-connect";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// GET: the platform sends the seller back here. Only a fresh state we signed, for this platform, this seller's
// store and this browser (nonce cookie) is accepted; then the code becomes encrypted tokens and the catalog and
// feed are set up. Ends on the page the seller started from (/channels, Inbox → Channels or Start here, the connect
// route's return cookie), where the card shows how it went, or back in the phone app when the sign-in started there
// (through /api/mobile/connected, which has a "Back to the app" button for browsers that need a tap, shared/app-connect.ts).
export const GET = withSeller(async (req: NextRequest, { user, params }) => {
  const platform = params.platform;
  if (!isOAuthPlatform(platform)) return NextResponse.redirect(new URL("/channels", req.url));
  const back = new URL(safeReturnPath(req.cookies.get(returnCookieName(platform))?.value) ?? "/channels", req.url);
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
      // needs_account: signed in (Facebook messages may be on already); the card says what's left.
      back.searchParams.set(outcome === "connected" || outcome === "syncing" || outcome === "needs_account" ? "connected" : "problem", platform);
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
    // shopinbos://connected?channel=meta&status=connected (older app versions: shopinbos://channels?connected=meta).
    const link = isConnectedReturn(app) ? appConnectedDeepLink(app, platform, result) : appResultUrl(app, platform, result);
    response = NextResponse.redirect(new URL(appConnectedPagePath(link), req.url));
    response.cookies.set(appReturnCookieName(platform), "", { path: `/api/app/sales-channels/${platform}`, maxAge: 0 });
  }
  response.cookies.set(nonceCookieName(platform), "", { path: `/api/app/sales-channels/${platform}`, maxAge: 0 });
  response.cookies.set(returnCookieName(platform), "", { path: `/api/app/sales-channels/${platform}`, maxAge: 0 });
  return response;
});
