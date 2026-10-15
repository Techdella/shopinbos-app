import { NextRequest, NextResponse } from "next/server";
import { withSeller } from "@/lib/auth/middleware";
import { finishGmailConnect } from "@/lib/email-channel/gmail.server";
import { sellerEmailStore } from "@/lib/email-channel/http.server";
import { checkGmailState, GMAIL_COOKIE_PATH, GMAIL_NONCE_COOKIE, GMAIL_PKCE_COOKIE } from "@/lib/email-channel/pure";
import { EmailSetupError } from "@/lib/email-channel/server";
import { credentialKey } from "@/lib/inbox/crypto";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET: Google sends the seller back here. Only a fresh state we signed for this seller's store, from the browser
// holding the nonce cookie, is accepted; the code is swapped for tokens with the PKCE verifier from the other cookie.
// Ends on /home/inbox/email?gmail=connected|cancelled|invalid_state|failed (the page says what happened).
export const GET = withSeller(async (req: NextRequest, { user }) => {
  const back = new URL("/home/inbox/email", req.url);
  const query = req.nextUrl.searchParams;
  const key = credentialKey();
  const store = await sellerEmailStore(user.id);
  const nonce = req.cookies.get(GMAIL_NONCE_COOKIE)?.value;
  const verifier = req.cookies.get(GMAIL_PKCE_COOKIE)?.value;
  const valid = Boolean(key && store && verifier && checkGmailState(query.get("state"), { storeId: store.id, nonceCookie: nonce }, key));

  if (!valid || !store) {
    back.searchParams.set("gmail", "invalid_state");
  } else if (query.get("error") || !query.get("code")) {
    back.searchParams.set("gmail", "cancelled");
  } else {
    try {
      await finishGmailConnect(store, query.get("code")!, verifier!);
      back.searchParams.set("gmail", "connected");
    } catch (error) {
      console.error("[gmail] connect failed", error instanceof Error ? error.message.slice(0, 200) : "unknown");
      back.searchParams.set("gmail", error instanceof EmailSetupError && error.code === "SCOPES" ? "scopes" : "failed");
    }
  }
  const response = NextResponse.redirect(back);
  response.cookies.set(GMAIL_NONCE_COOKIE, "", { path: GMAIL_COOKIE_PATH, maxAge: 0 });
  response.cookies.set(GMAIL_PKCE_COOKIE, "", { path: GMAIL_COOKIE_PATH, maxAge: 0 });
  return response;
});
