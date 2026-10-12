import { NextRequest, NextResponse } from "next/server";
import { verifyEmailToken } from "@/lib/email/tokens";
import { STORE_TOPICS } from "@/lib/email/preferences";
import { saveContactPreferences, unsubscribeUserFromAll } from "@/lib/email/preferences.server";

// RFC 8058 one-click unsubscribe for every marketing and lifecycle email (the List-Unsubscribe header).
// Mail apps POST "List-Unsubscribe=One-Click" here with no cookies and no login: the signed token is the credential,
// so there is no CSRF check (this path is outside the portal API prefixes). Idempotent: repeating it changes nothing.
// GET (a person clicking the link) never unsubscribes: it opens the preference center, which asks first.

export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "no-store" };

async function tokenFrom(req: NextRequest) {
  const fromQuery = req.nextUrl.searchParams.get("token");
  if (fromQuery) return fromQuery;
  const type = req.headers.get("content-type") ?? "";
  if (type.includes("application/x-www-form-urlencoded") || type.includes("multipart/form-data")) {
    const form = await req.formData().catch(() => null);
    const value = form?.get("token");
    return typeof value === "string" ? value : null;
  }
  return null;
}

export async function POST(req: NextRequest) {
  const target = verifyEmailToken(await tokenFrom(req));
  if (!target) return NextResponse.json({ error: { code: "BAD_REQUEST", message: "This unsubscribe link isn't valid." } }, { status: 400, headers });
  try {
    if (target.kind === "contact") {
      // Email only: texts (SMS/WhatsApp) have their own STOP and are managed on the preference page.
      await saveContactPreferences(target.storeId, target.email, { topics: Object.fromEntries(STORE_TOPICS.map((t) => [t.key, false])) }, "one_click");
    } else await unsubscribeUserFromAll(target.userId);
  } catch (error) {
    console.error("[email] one-click unsubscribe failed", error);
    return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: "We couldn't save that. Please try again." } }, { status: 500, headers });
  }
  return NextResponse.json({ data: { unsubscribed: true } }, { status: 200, headers });
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token") ?? "";
  const url = req.nextUrl.clone();
  url.pathname = `/email/preferences/${encodeURIComponent(token)}`;
  url.search = "?unsubscribe=1";
  return NextResponse.redirect(url, 303);
}
