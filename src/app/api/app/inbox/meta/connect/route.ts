import { NextRequest, NextResponse } from "next/server";
import { withSeller } from "@/lib/auth/middleware";
import { db } from "@/lib/db/client";
import { isMetaLoginChannel, META_LOGIN_MAX_AGE_S, META_LOGIN_NONCE_COOKIE, startMetaLogin } from "@/lib/inbox/meta-login";

export const dynamic = "force-dynamic";

// GET ?channel=messenger|instagram: "Connect with Facebook" on /home/inbox/channels. The nonce cookie ties the
// callback to this browser.
export const GET = withSeller(async (req: NextRequest, { user }) => {
  const back = new URL("/home/inbox/channels", req.url);
  const channel = req.nextUrl.searchParams.get("channel");
  if (!isMetaLoginChannel(channel)) return NextResponse.redirect(back);
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true } });
  if (!store) return NextResponse.redirect(new URL("/builder?firstRun=1", req.url));
  const started = startMetaLogin(store.id, channel);
  if (!started) {
    back.searchParams.set("meta", "unavailable");
    back.searchParams.set("channel", channel);
    return NextResponse.redirect(back);
  }
  const response = NextResponse.redirect(started.url);
  response.cookies.set(META_LOGIN_NONCE_COOKIE, started.nonce, { httpOnly: true, secure: req.nextUrl.protocol === "https:", sameSite: "lax", path: "/api/app/inbox/meta", maxAge: META_LOGIN_MAX_AGE_S });
  return response;
});
