import { NextResponse } from "next/server";
import { currentSlugForOldSlug } from "@/lib/store-address.server";
import { SEO_FILE_CACHE_CONTROL, storeRobotsTxt } from "@/lib/seo/indexing";
import { storeSearchState, storeUrl } from "@/lib/seo/store-seo.server";

// robots.txt at the root of a store host: <slug>.mybos.store/robots.txt and the seller's own domain are rewritten
// here by src/proxy.ts (src/lib/storefront/host-routing.ts). Live stores welcome search and AI crawlers and point
// them at the sitemap on the store's canonical address; stores that aren't live, or that the seller hid, keep
// every crawler out.

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ slug: string }> };

function text(body: string) {
  return new NextResponse(body, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": SEO_FILE_CACHE_CONTROL } });
}

export async function GET(_request: Request, { params }: Context) {
  const { slug } = await params;
  const state = await storeSearchState(slug);
  if (!state) {
    // An old address of a renamed store only redirects; crawlers may follow those redirects to the new one.
    const renamed = await currentSlugForOldSlug(slug).catch(() => null);
    return text(renamed ? "User-agent: *\nAllow: /\n" : storeRobotsTxt({ indexable: false }));
  }
  return text(
    storeRobotsTxt({
      indexable: state.indexable,
      sitemapUrl: storeUrl(state.store, "/sitemap.xml"),
      llmsUrl: storeUrl(state.store, "/llms.txt"),
    }),
  );
}
