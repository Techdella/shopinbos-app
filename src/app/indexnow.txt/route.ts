import { NextResponse } from "next/server";
import { indexNowKey } from "@/lib/seo/search-ping.server";
import { SEO_FILE_CACHE_CONTROL } from "@/lib/seo/indexing";

// The IndexNow key file. Store subdomains and custom domains pass .txt files through to the app
// (src/lib/storefront/host-routing.ts), so every host answers the same key and IndexNow trusts our pings for it.

export const dynamic = "force-dynamic";

export function GET() {
  const key = indexNowKey();
  if (!key) return new NextResponse("Not found", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  return new NextResponse(key, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": SEO_FILE_CACHE_CONTROL, "X-Robots-Tag": "noindex" } });
}
