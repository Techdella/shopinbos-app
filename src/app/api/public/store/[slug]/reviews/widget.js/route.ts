import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { buildWidgetScript, publicName, publicReviews, sourceLabel, summarizeReviews } from "@/lib/reviews/pure";
import { loadReviews, reviewUrls } from "@/lib/reviews/server";

export const dynamic = "force-dynamic";

// The embeddable reviews widget: <script src=".../reviews/widget.js" async></script> on any site. Shows the
// average, count and up to ?limit= (default 6, max 12) published reviews, featured ones first.
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const store = await db.store.findUnique({ where: { slug }, select: { id: true, name: true, slug: true, status: true } });
  if (!store || store.status !== "active") {
    return new NextResponse("/* store not found */", { status: 404, headers: { "Content-Type": "application/javascript; charset=utf-8" } });
  }
  const limit = Math.min(12, Math.max(1, Number(req.nextUrl.searchParams.get("limit")) || 6));
  const items = publicReviews(await loadReviews(store.id, { approvedOnly: true, take: 500 }));
  const summary = summarizeReviews(items);
  const script = buildWidgetScript({
    storeName: store.name,
    wallUrl: reviewUrls(store.slug).wall,
    average: summary.average,
    count: summary.count,
    reviews: items
      .filter((item) => (item.body || item.title).trim())
      .slice(0, limit)
      .map((item) => ({ name: publicName(item.authorName), rating: item.rating, text: (item.body || item.title).slice(0, 400), source: sourceLabel(item.source), date: item.createdAt })),
  });
  return new NextResponse(script, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=600, stale-while-revalidate=3600",
      "Cross-Origin-Resource-Policy": "cross-origin",
    },
  });
}
