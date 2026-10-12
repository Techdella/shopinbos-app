import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api/response";
import { db } from "@/lib/db/client";
import { feedFetcher } from "@/lib/social/feeds";
import { catalogFeedCsv, feedTokenMatches } from "@/lib/whatsapp-catalog/pure";
import { buildCatalogItems, storeIsLive } from "@/lib/whatsapp-catalog/server";
import { noteFeedFetch } from "@/lib/social/server";

// The store's WhatsApp catalog feed in Meta's CSV format:
//   /api/public/store/<slug>/catalog-feed.csv?token=<feed token>
// The seller pastes it into Meta Commerce Manager as a scheduled data feed (no extra API permissions needed).
// Only published products of a live store. The token (rotatable on the WhatsApp catalog page) keeps the feed from
// being scraped by guessing slugs; a wrong or missing token answers 404 like an unknown store.

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const token = req.nextUrl.searchParams.get("token");
  const notFound = () => apiError("NOT_FOUND", "Feed not found", 404);

  const store = await db.store.findUnique({ where: { slug }, select: { id: true, name: true, slug: true, customDomain: true, currency: true, status: true, brandSettings: true } }).catch(() => null);
  if (!store) return notFound();
  const row = await db.whatsAppCatalog.findUnique({ where: { storeId: store.id }, select: { feedToken: true } }).catch(() => null);
  if (!row || !feedTokenMatches(token, row.feedToken)) return notFound();
  if (!(await storeIsLive(store))) return apiError("NOT_FOUND", "This store isn't live yet", 404);

  const build = await buildCatalogItems(store);
  const userAgent = req.headers.get("user-agent") ?? "";
  if (feedFetcher(userAgent) === "meta") {
    await db.whatsAppCatalog.update({ where: { storeId: store.id }, data: { feedFetchedAt: new Date() } }).catch(() => null);
    // The WhatsApp card on /channels reads this (the old whatsapp.csv URL redirects here).
    await noteFeedFetch(store.id, "whatsapp", userAgent);
  }
  return new NextResponse(catalogFeedCsv(build), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `inline; filename="${store.slug}-whatsapp-catalog.csv"`,
      // Cacheable for 15 minutes; the token is part of the URL, so a rotated token is a different cache entry.
      "Cache-Control": "public, max-age=900, s-maxage=900, stale-while-revalidate=3600",
      "X-Robots-Tag": "noindex",
      "X-Feed-Items": String(build.items.length),
    },
  });
}
