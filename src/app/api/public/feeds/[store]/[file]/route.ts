import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { apiError } from "@/lib/api/response";
import { buildStorefrontUrl } from "@/lib/domains/storefront";
import { feedCsv, feedFetcher, feedXml, parseFeedFile } from "@/lib/social/feeds";
import { buildStoreFeed, noteFeedFetch } from "@/lib/social/server";

// Public product feeds: /api/public/feeds/<store slug>/{google,meta,tiktok,whatsapp}.{xml,csv}
// Paste the URL into Google Merchant Center, Meta Commerce Manager (Facebook, Instagram, WhatsApp) or TikTok
// Catalog Manager as a scheduled feed. No keys needed; only published products with a price and a photo.

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ store: string; file: string }> }) {
  const { store: slug, file } = await params;
  const parsed = parseFeedFile(file);
  if (!parsed) return apiError("NOT_FOUND", "Feeds are google, meta, tiktok or whatsapp, as .xml or .csv", 404);

  const store = await db.store.findUnique({ where: { slug }, select: { id: true, name: true, slug: true, customDomain: true, status: true } });
  if (!store || store.status !== "active") return apiError("NOT_FOUND", "Store not found", 404);

  const build = await buildStoreFeed(store, parsed.channel);
  const userAgent = req.headers.get("user-agent") ?? "";
  const fetcher = feedFetcher(userAgent);
  // A Meta crawler fetching the WhatsApp feed is the WhatsApp catalog.
  if (fetcher) await noteFeedFetch(store.id, fetcher === "meta" && parsed.channel === "whatsapp" ? "whatsapp" : fetcher, userAgent);

  const body = parsed.format === "xml" ? feedXml(parsed.channel, { name: store.name, url: buildStorefrontUrl(store) }, build) : feedCsv(parsed.channel, build);
  return new NextResponse(body, {
    headers: {
      "Content-Type": parsed.format === "xml" ? "application/xml; charset=utf-8" : "text/csv; charset=utf-8",
      "Content-Disposition": `inline; filename="${store.slug}-${file}"`,
      "Cache-Control": "public, max-age=900, s-maxage=900",
      "X-Feed-Items": String(build.items.length),
    },
  });
}
