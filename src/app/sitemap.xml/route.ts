import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { buildPlatformSubdomainOrigin, storeSubdomainsEnabled } from "@/lib/domains/storefront";
import { SEO_FILE_CACHE_CONTROL } from "@/lib/seo/indexing";
import { SITEMAP_MAX_URLS, sitemapIndexXml } from "@/lib/seo/sitemap";

// The app host's sitemap: an index of the sitemaps of every live store on a Shopinbos address, so search engines
// find new stores without anyone submitting them. Each entry is the store's own sitemap on its canonical address
// (<slug>.mybos.store once store subdomains are on, app.shopinbos.com/s/<slug> before), which lists its pages
// (src/app/s/[slug]/sitemap.xml). Submit https://www.mybos.store/sitemap.xml once in Search Console, under a
// Domain property for mybos.store, and every store subdomain is covered. Stores on their own domain are left out:
// that domain isn't ours to verify, and its robots.txt already points at its sitemap.

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const origin = new URL(request.url).origin;
  // Live (active, with a published page or builder snapshot), on no domain of its own, not hidden by the seller:
  // the same rules as src/lib/storefront/store-visibility.ts and src/lib/seo/indexing.ts.
  const rows = await db
    .$queryRawUnsafe<Array<{ slug: string; updatedAt: Date }>>(
      `SELECT s.slug, s."updatedAt" FROM "Store" s
       WHERE s.status = 'active' AND s."customDomain" IS NULL
         AND COALESCE(s."brandSettings"->'seo'->>'hideFromSearch', 'false') <> 'true'
         AND (jsonb_typeof(s."brandSettings"->'editor'->'published') = 'object'
              OR EXISTS (SELECT 1 FROM "StorePage" p WHERE p."storeId" = s.id AND p."isPublished" = true))
       ORDER BY s."updatedAt" DESC
       LIMIT ${SITEMAP_MAX_URLS}`,
    )
    .catch((error) => {
      console.error("[sitemap] couldn't list stores", error instanceof Error ? error.message.slice(0, 200) : "unknown");
      return [];
    });
  const subdomains = storeSubdomainsEnabled();
  const storeSitemap = (slug: string) => (subdomains ? `${buildPlatformSubdomainOrigin(slug)}/sitemap.xml` : `${origin}/s/${encodeURIComponent(slug)}/sitemap.xml`);
  const xml = sitemapIndexXml(rows.map((row) => ({ loc: storeSitemap(row.slug), lastmod: row.updatedAt })));
  return new NextResponse(xml, { headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": SEO_FILE_CACHE_CONTROL, "X-Robots-Tag": "noindex" } });
}
