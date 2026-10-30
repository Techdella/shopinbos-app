import { NextRequest, NextResponse } from "next/server";
import { appReturnUrl } from "@/lib/sales-channels/pure";
import { getLocale, getT } from "@/lib/i18n/server";
import { appConnectedPageHtml } from "@shared/app-connect";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/mobile/auth-return?to=<the app's address>&code=…  (apps/mobile/src/lib/auth.ts signInWithGoogle)
// Where Google sign-in from the phone app ends. Supabase only returns to addresses on its allow-list and otherwise
// drops people on the web app; https://app.shopinbos.com/** is always on it, so the app asks to come back here and
// this page passes the sign-in code on to the app (shopinbos://auth/callback?code=…), which closes the in-app
// browser. A page with a "Back to the app" button rather than a redirect, for Chrome on Android (as
// /api/mobile/connected). Only the app's own scheme is followed; the code is useless without the app's PKCE secret.

export async function GET(req: NextRequest) {
  const to = appReturnUrl(req.nextUrl.searchParams.get("to"));
  if (!to) return NextResponse.redirect(new URL("/login", req.url));
  const back = new URL(to);
  for (const key of ["code", "error", "error_description"]) {
    const value = req.nextUrl.searchParams.get(key);
    if (value) back.searchParams.set(key, value.slice(0, 500));
  }
  const t = await getT("social");
  const html = appConnectedPageHtml(back.toString(), { lang: await getLocale(), title: t("appBack.title"), body: t("appBack.body"), button: t("appBack.button") });
  return new NextResponse(html, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
}
