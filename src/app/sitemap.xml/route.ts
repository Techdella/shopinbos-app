import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { storeSubdomainsEnabled } from "@/lib/domains/storefront";
import { SEO_FILE_CACHE_CONTROL } from "@/lib/seo/indexing";
import { SITEMAP_MAX_URLS, sitemapIndexXml } from "@/lib/seo/sitemap";

// The app host's sitemap: an index of the sitemaps of live stores whose canonical address is on this host
// (app.shopinbos.com/s/<slug>, used until store subdomains are switched on). Stores with their own domain or a
// subdomain list their pages there instead (src/app/s/[slug]/sitemap.xml), so nothing is listed twice.

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const origin = new URL(request.url).origin;
  let rows: Array<{ slug: string; updatedAt: Date }> = [];
  if (!storeSubdomainsEnabled()) {
    // Live (active, with a published page or builder snapshot), on no domain of its own, not hidden by the seller:
    // the same rules as src/lib/storefront/store-visibility.ts and src/lib/seo/indexing.ts.
    rows = await db
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
  }
  const xml = sitemapIndexXml(rows.map((row) => ({ loc: `${origin}/s/${encodeURIComponent(row.slug)}/sitemap.xml`, lastmod: row.updatedAt })));
  return new NextResponse(xml, { headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": SEO_FILE_CACHE_CONTROL, "X-Robots-Tag": "noindex" } });
}
