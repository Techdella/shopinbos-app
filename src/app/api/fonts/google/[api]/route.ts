import { NextRequest, NextResponse } from "next/server";
import { googleFontsUpstream, rewriteFontCss } from "@/lib/google-fonts-proxy";

export const runtime = "nodejs";

// GET /api/fonts/google/<css|css2|icon>?family=… → Google's font stylesheet fetched by the server, with every font
// file pointed at /api/fonts/file, so the visitor's browser only talks to Shopinbos. Used by the imported HTML store
// templates (public/store-templates); see src/lib/google-fonts-proxy.ts.

const CSS_HEADERS = { "Content-Type": "text/css; charset=utf-8" };

export async function GET(request: NextRequest, { params }: { params: Promise<{ api: string }> }) {
  const upstream = googleFontsUpstream((await params).api, request.nextUrl.searchParams);
  if (!upstream) return new NextResponse("/* not a font request */", { status: 400, headers: CSS_HEADERS });
  // A current browser's user agent gets woff2.
  const reply = await fetch(upstream, { headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36" }, signal: AbortSignal.timeout(8_000) }).catch(() => null);
  if (!reply?.ok) return new NextResponse("/* font unavailable */", { headers: { ...CSS_HEADERS, "Cache-Control": "public, max-age=300" } });
  return new NextResponse(rewriteFontCss(await reply.text()), { headers: { ...CSS_HEADERS, "Cache-Control": "public, max-age=86400, s-maxage=604800" } });
}
