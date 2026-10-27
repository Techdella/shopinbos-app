import { NextRequest, NextResponse } from "next/server";
import { GOOGLE_CSS, rewriteFontCss, safeFamily } from "@/lib/google-fonts-proxy";

export const runtime = "nodejs";

// GET /api/fonts/css?family=Inter:wght@400;600&family=… → Google's font CSS, fetched by the server and pointed at
// /api/fonts/file, so the browser only ever talks to Shopinbos (src/lib/google-fonts-proxy.ts).

export async function GET(request: NextRequest) {
  const families = request.nextUrl.searchParams.getAll("family").map(safeFamily);
  if (!families.length || families.length > 4 || families.some((family) => !family)) return new NextResponse("Bad font", { status: 400 });
  const url = new URL(GOOGLE_CSS);
  for (const family of families) url.searchParams.append("family", family!);
  url.searchParams.set("display", "swap");
  // A current browser's user agent gets woff2.
  const reply = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36" }, signal: AbortSignal.timeout(8_000) }).catch(() => null);
  if (!reply?.ok) return new NextResponse("/* font unavailable */", { status: 200, headers: { "Content-Type": "text/css; charset=utf-8", "Cache-Control": "public, max-age=300" } });
  return new NextResponse(rewriteFontCss(await reply.text()), { headers: { "Content-Type": "text/css; charset=utf-8", "Cache-Control": "public, max-age=86400, s-maxage=604800" } });
}
