import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { apiError } from "@/lib/api/response";
import { buildStorefrontUrl } from "@/lib/domains/storefront";
import { feedCsv, feedFetcher, feedXml, parseFeedFile } from "@/lib/social/feeds";
import { buildStoreFeed, noteFeedFetch } from "@/lib/social/server";
import { catalogFeedPath, feedTokenMatches } from "@/lib/whatsapp-catalog/pure";

// Product feeds: /api/public/feeds/<store slug>/{google,meta,tiktok,whatsapp}.{xml,csv}?token=<feed key>
// Paste the URL into Google Merchant Center, Meta Commerce Manager (Facebook, Instagram) or TikTok Catalog Manager
// as a scheduled feed. Only published products with a price and a photo.
//
// The token is the store's private feed key (WhatsAppCatalog.feedToken, rotated from Inbox → WhatsApp catalog), so
// a store's catalog can't be scraped by guessing slugs. A missing or wrong token answers exactly like an unknown
// store. WhatsApp has its own feed in Meta's catalog format (/api/public/store/<slug>/catalog-feed.csv); the old
// whatsapp.* URLs redirect there, but only with a valid token.

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const notFound = () => apiError("NOT_FOUND", "Feed not found", 404);

export async function GET(req: NextRequest, { params }: { params: Promise<{ store: string; file: string }> }) {
  const { store: slug, file } = await params;
  const parsed = parseFeedFile(file);
  if (!parsed) return apiError("NOT_FOUND", "Feeds are google, meta, tiktok or whatsapp, as .xml or .csv", 404);

  const store = await db.store.findUnique({ where: { slug }, select: { id: true, name: true, slug: true, customDomain: true, status: true } }).catch(() => null);
  if (!store || store.status !== "active") return notFound();
  const key = await db.whatsAppCatalog.findUnique({ where: { storeId: store.id }, select: { feedToken: true } }).catch(() => null);
  const token = req.nextUrl.searchParams.get("token");
  if (!key || !feedTokenMatches(token, key.feedToken)) return notFound();

  if (parsed.channel === "whatsapp") {
    // Not cached: the target carries the key, and a rotated key must stop redirecting at once.
    return new NextResponse(null, {
      status: 307,
      headers: { Location: catalogFeedPath(store.slug, key.feedToken), "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex" },
    });
  }

  const build = await buildStoreFeed(store, parsed.channel);
  const userAgent = req.headers.get("user-agent") ?? "";
  const fetcher = feedFetcher(userAgent);
  if (fetcher) await noteFeedFetch(store.id, fetcher, userAgent);

  const body = parsed.format === "xml" ? feedXml(parsed.channel, { name: store.name, url: buildStorefrontUrl(store) }, build) : feedCsv(parsed.channel, build);
  return new NextResponse(body, {
    headers: {
      "Content-Type": parsed.format === "xml" ? "application/xml; charset=utf-8" : "text/csv; charset=utf-8",
      "Content-Disposition": `inline; filename="${store.slug}-${file}"`,
      // The key is part of the URL, so a rotated key is a different cache entry.
      "Cache-Control": "public, max-age=900, s-maxage=900",
      "X-Robots-Tag": "noindex",
      "X-Feed-Items": String(build.items.length),
    },
  });
}
