import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { withSeller } from "@/lib/auth/middleware";
import { gmailRedirectUri } from "@/lib/email-channel/gmail.server";
import { sellerEmailStore } from "@/lib/email-channel/http.server";
import { GMAIL_COOKIE_PATH, GMAIL_NONCE_COOKIE, GMAIL_PKCE_COOKIE, GMAIL_STATE_MAX_AGE_MS, gmailAuthUrl, pkcePair, signGmailState } from "@/lib/email-channel/pure";
import { googleConfigured } from "@/lib/email-channel/server";
import { credentialKey } from "@/lib/inbox/crypto";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET: the "Connect Gmail" button. Sends the seller to Google with a signed state (store + nonce + time) and a PKCE
// challenge; the nonce and the PKCE verifier go in httpOnly cookies, so the callback only finishes in this browser.
export const GET = withSeller(async (req: NextRequest, { user }) => {
  const back = new URL("/home/inbox/email", req.url);
  const key = credentialKey();
  if (!googleConfigured() || !key) {
    back.searchParams.set("gmail", "not_configured");
    return NextResponse.redirect(back);
  }
  const store = await sellerEmailStore(user.id);
  if (!store) return NextResponse.redirect(new URL("/home", req.url));
  const nonce = randomBytes(18).toString("base64url");
  const pkce = pkcePair();
  const state = signGmailState({ storeId: store.id, nonce, iat: Date.now() }, key);
  const response = NextResponse.redirect(gmailAuthUrl({ clientId: process.env.GOOGLE_CLIENT_ID!.trim(), redirectUri: gmailRedirectUri(), state, challenge: pkce.challenge }));
  const cookie = { httpOnly: true, secure: req.nextUrl.protocol === "https:", sameSite: "lax" as const, path: GMAIL_COOKIE_PATH, maxAge: Math.floor(GMAIL_STATE_MAX_AGE_MS / 1000) };
  response.cookies.set(GMAIL_NONCE_COOKIE, nonce, cookie);
  response.cookies.set(GMAIL_PKCE_COOKIE, pkce.verifier, cookie);
  return response;
});
