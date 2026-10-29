import { NextRequest, NextResponse } from "next/server";
import { appReturnUrl } from "@/lib/sales-channels/pure";
import { getLocale, getT } from "@/lib/i18n/server";
import { appConnectedPageHtml } from "@shared/app-connect";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/mobile/connected?to=<the app's address>  (shared/app-connect.ts)
// Where connecting WhatsApp, Facebook & Instagram or Google from the phone app ends: a small page that sends the
// in-app browser to shopinbos://connected?channel=…&status=…, which closes it and returns to the app. A page rather
// than a redirect, so there's a "Back to the app" button for Chrome on Android, which only opens an app's address
// after a tap once a sign-in has taken a while. Only the app's own scheme (and Expo Go on this network) is followed;
// anything else goes to the web's Sell everywhere page, so this can't send people elsewhere. No sign-in needed: the
// page carries nothing but the result, and the app checks the connection again with its own sign-in.

export async function GET(req: NextRequest) {
  const to = appReturnUrl(req.nextUrl.searchParams.get("to"));
  if (!to) return NextResponse.redirect(new URL("/channels", req.url));
  const t = await getT("social");
  const html = appConnectedPageHtml(to, { lang: await getLocale(), title: t("appBack.title"), body: t("appBack.body"), button: t("appBack.button") });
  return new NextResponse(html, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
}
