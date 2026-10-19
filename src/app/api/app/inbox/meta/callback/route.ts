import { NextRequest, NextResponse } from "next/server";
import { withSeller } from "@/lib/auth/middleware";
import { sellerStore } from "@/lib/inbox/auth";
import { finishMetaLogin, META_LOGIN_MAX_AGE_S, META_LOGIN_NONCE_COOKIE, META_LOGIN_PENDING_COOKIE, readMetaLoginState } from "@/lib/inbox/meta-login";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Facebook sends the seller back here. Ends on /home/inbox/channels?meta=connected|pick|no_page|no_instagram|
// cancelled|problem&channel=…, where the card shows how it went (and, for "pick", which Page to connect).
export const GET = withSeller(async (req: NextRequest, { user }) => {
  const back = new URL("/home/inbox/channels", req.url);
  const query = req.nextUrl.searchParams;
  const store = await sellerStore(user.id);
  const channel = store ? readMetaLoginState(query.get("state"), store.id, req.cookies.get(META_LOGIN_NONCE_COOKIE)?.value) : null;
  const code = query.get("code");
  let pending: string | null = null;

  if (!store || !channel) back.searchParams.set("meta", query.get("error") ? "cancelled" : "problem");
  else if (!code) back.searchParams.set("meta", "cancelled");
  else {
    try {
      const outcome = await finishMetaLogin(store, channel, code);
      back.searchParams.set("meta", outcome.kind);
      if (outcome.kind === "pick") pending = outcome.pending;
      if (outcome.kind === "problem" && outcome.message) console.error("[inbox-meta] connect refused", outcome.message.slice(0, 200));
    } catch (error) {
      console.error("[inbox-meta] connect failed", error instanceof Error ? error.message.slice(0, 200) : "unknown");
      back.searchParams.set("meta", "problem");
    }
  }
  if (channel) {
    back.searchParams.set("channel", channel);
    back.hash = channel;
  }
  const response = NextResponse.redirect(back);
  const secure = req.nextUrl.protocol === "https:";
  response.cookies.set(META_LOGIN_NONCE_COOKIE, "", { path: "/api/app/inbox/meta", maxAge: 0 });
  // Read by the channels page (to list the Pages) and by /api/app/inbox/meta/pick.
  if (pending) response.cookies.set(META_LOGIN_PENDING_COOKIE, pending, { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge: META_LOGIN_MAX_AGE_S });
  return response;
});
