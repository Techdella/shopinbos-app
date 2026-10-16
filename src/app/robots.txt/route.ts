import { NextResponse } from "next/server";
import { appRobotsTxt, SEO_FILE_CACHE_CONTROL } from "@/lib/seo/indexing";

// robots.txt of the app host (app.shopinbos.com). Signed-in areas stay out of search; stores served at /s/<slug>
// stay crawlable. Store subdomains and custom domains never reach this: src/proxy.ts sends their /robots.txt to the
// store's own (src/app/s/[slug]/robots.txt), so nothing here can block a store.

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  const origin = new URL(request.url).origin;
  return new NextResponse(appRobotsTxt({ sitemapUrl: `${origin}/sitemap.xml` }), {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": SEO_FILE_CACHE_CONTROL },
  });
}
