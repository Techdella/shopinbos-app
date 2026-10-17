import { NextRequest, NextResponse } from "next/server";
import { withSeller } from "@/lib/auth/middleware";
import { db } from "@/lib/db/client";
import { appResultUrl, appReturnCookieName, appReturnUrl, isOAuthPlatform, nonceCookieName, STATE_MAX_AGE_MS } from "@/lib/sales-channels/pure";
import { startConnect } from "@/lib/sales-channels/server";

export const dynamic = "force-dynamic";

// GET: the "Connect" button on /channels. Sends the seller to the platform's sign-in with a signed state, and puts
// the state's nonce in an httpOnly cookie so the callback only finishes in the browser that started it.
// From the phone app (?app=shopinbos://channels) the callback returns to the app instead of /channels.
export const GET = withSeller(async (req: NextRequest, { user, params }) => {
  const back = new URL("/channels", req.url);
  const platform = params.platform;
  if (!isOAuthPlatform(platform)) return NextResponse.redirect(back);
  const app = appReturnUrl(req.nextUrl.searchParams.get("app"));
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true } });
  if (!store) return NextResponse.redirect(new URL("/onboarding", req.url));
  const started = startConnect(store.id, platform);
  if (!started) return NextResponse.redirect(app ? appResultUrl(app, platform, "problem") : back);
  const response = NextResponse.redirect(started.url);
  const path = `/api/app/sales-channels/${platform}`;
  const secure = req.nextUrl.protocol === "https:";
  response.cookies.set(nonceCookieName(platform), started.nonce, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path,
    maxAge: Math.floor(STATE_MAX_AGE_MS / 1000),
  });
  // Set or cleared every time, so a web Connect after an app one still ends on /channels.
  if (app) response.cookies.set(appReturnCookieName(platform), app, { httpOnly: true, secure, sameSite: "lax", path, maxAge: Math.floor(STATE_MAX_AGE_MS / 1000) });
  else response.cookies.set(appReturnCookieName(platform), "", { path, maxAge: 0 });
  return response;
});
