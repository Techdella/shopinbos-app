import { NextResponse } from "next/server";
import { SEO_FILE_CACHE_CONTROL } from "@/lib/seo/indexing";
import { renderStoreSitemap } from "@/lib/seo/sitemap";
import { loadStoreSitemapEntries, onRequestHost, storeSearchState, storeUrl } from "@/lib/seo/store-seo.server";

// A live store's sitemap (a sitemap index plus ?part=N files for very large stores), with absolute URLs on the
// store's canonical address. Asked for on another of the store's addresses (its free subdomain when it has its own
// domain, app.shopinbos.com/s/<slug> when it has a subdomain) it permanently redirects to the canonical one, so
// search engines never get the same pages listed twice.

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ slug: string }> };

function notFound() {
  return new NextResponse("Not found", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=300", "X-Robots-Tag": "noindex" } });
}

export async function GET(request: Request, { params }: Context) {
  const { slug } = await params;
  const state = await storeSearchState(slug);
  if (!state?.indexable) return notFound();
  const sitemapUrl = storeUrl(state.store, "/sitemap.xml");
  const { search, searchParams } = new URL(request.url);
  if (!onRequestHost(sitemapUrl, request.headers.get("host"))) return NextResponse.redirect(`${sitemapUrl}${search}`, 301);
  const partParam = searchParams.get("part");
  const part = partParam === null ? null : Number(partParam);
  const xml = renderStoreSitemap(await loadStoreSitemapEntries(slug), sitemapUrl, part);
  if (xml === null) return notFound();
  return new NextResponse(xml, {
    headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": SEO_FILE_CACHE_CONTROL, "X-Robots-Tag": "noindex" },
  });
}
