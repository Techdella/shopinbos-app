import { NextRequest, NextResponse } from "next/server";
import { withSeller } from "@/lib/auth/middleware";
import { db } from "@/lib/db/client";
import { isOAuthPlatform, nonceCookieName, STATE_MAX_AGE_MS } from "@/lib/sales-channels/pure";
import { startConnect } from "@/lib/sales-channels/server";

export const dynamic = "force-dynamic";

// GET: the "Connect" button on /channels. Sends the seller to the platform's sign-in with a signed state, and puts
// the state's nonce in an httpOnly cookie so the callback only finishes in the browser that started it.
export const GET = withSeller(async (req: NextRequest, { user, params }) => {
  const back = new URL("/channels", req.url);
  const platform = params.platform;
  if (!isOAuthPlatform(platform)) return NextResponse.redirect(back);
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true } });
  if (!store) return NextResponse.redirect(new URL("/onboarding", req.url));
  const started = startConnect(store.id, platform);
  if (!started) return NextResponse.redirect(back);
  const response = NextResponse.redirect(started.url);
  response.cookies.set(nonceCookieName(platform), started.nonce, {
    httpOnly: true,
    secure: req.nextUrl.protocol === "https:",
    sameSite: "lax",
    path: `/api/app/sales-channels/${platform}`,
    maxAge: Math.floor(STATE_MAX_AGE_MS / 1000),
  });
  return response;
});
