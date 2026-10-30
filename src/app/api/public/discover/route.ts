import { NextRequest, NextResponse } from "next/server";
import { cachedPublic, publicCacheKey } from "@/lib/api/public-cache";
import { handleOptions, withCors } from "@/lib/api/cors";
import { apiError } from "@/lib/api/response";
import { discoverFeed } from "@/lib/product-videos/discover.server";
import { areaKey, readDiscoverCursor } from "@shared/product-videos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/public/discover?area=&cursor=   (no sign-in; for Shopinbos Plug)
//   → { data: [{ id, videoUrl, posterUrl, durationMs, width, height, caption, views, createdAt,
//                product: { id, name, price, currency, shortCode, url }, shop: { handle, name, url } }],
//       meta: { nextCursor } }
// Product videos with "Show on Plug Discover" on, from shops where the post_to_plug pilot switch is on, newest first
// (src/lib/product-videos/discover.server.ts). area: a shop's area, city or state ("Yaba", "Lagos"). cursor: meta.nextCursor
// of the page before. No one's personal details. Cached for a minute (Redis and the CDN).

const DISCOVER_TTL_S = 60;
const CACHE = "public, max-age=60, s-maxage=60, stale-while-revalidate=120";

export async function OPTIONS(req: NextRequest) {
  return handleOptions(req);
}

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const area = areaKey(params.get("area"));
  const rawCursor = params.get("cursor");
  const cursor = rawCursor ? readDiscoverCursor(rawCursor) : null;
  if (rawCursor && !cursor) return withCors(req, apiError("BAD_REQUEST", "That cursor isn't valid."));
  try {
    const page = await cachedPublic(publicCacheKey("discover", { area, cursor: rawCursor ?? "" }), DISCOVER_TTL_S, () => discoverFeed({ area, cursor }));
    return withCors(req, NextResponse.json({ data: page.videos, meta: { nextCursor: page.nextCursor } }), { cacheControl: CACHE });
  } catch (error) {
    console.error("[discover] feed failed", error);
    return withCors(req, apiError("UNAVAILABLE", "Discover isn't available right now.", 503));
  }
}
