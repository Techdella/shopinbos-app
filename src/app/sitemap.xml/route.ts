import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { buildPlatformSubdomainOrigin, storeSubdomainsEnabled } from "@/lib/domains/storefront";
import { SEO_FILE_CACHE_CONTROL } from "@/lib/seo/indexing";
import { SITEMAP_MAX_URLS, sitemapIndexXml } from "@/lib/seo/sitemap";

// The sitemap of the app host and the bare root domain (mybos.store): an index of every live store's sitemap on a
// platform address, so search engines find new stores without a link to them. Until store subdomains are switched
// on those are app.shopinbos.com/s/<slug>/sitemap.xml; after, <slug>.<root>/sitemap.xml, which the root domain's
// Search Console property covers. Stores with their own domain list their pages there (src/app/s/[slug]/sitemap.xml).

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
    .catch(() => []);
  const subdomains = storeSubdomainsEnabled();
  const loc = (slug: string) => (subdomains ? `${buildPlatformSubdomainOrigin(slug)}/sitemap.xml` : `${origin}/s/${encodeURIComponent(slug)}/sitemap.xml`);
  const xml = sitemapIndexXml(rows.map((row) => ({ loc: loc(row.slug), lastmod: row.updatedAt })));
  return new NextResponse(xml, { headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": SEO_FILE_CACHE_CONTROL, "X-Robots-Tag": "noindex" } });
}
