import { NextRequest, NextResponse } from "next/server";
import { handleOptions, withCors } from "@/lib/api/cors";
import { checkRateLimit, rateLimitKey, requestIp } from "@/lib/rate-limit";
import { countDiscoverView } from "@/lib/product-videos/discover.server";
import { videoId } from "@shared/product-videos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/public/discover/view { id }  → 204, always (best effort; for Shopinbos Plug, no sign-in)
// Counts one Discover play of a video. Cheap: per server instance, an IP counts each video at most once every 10
// minutes and at most 120 plays a minute; anything over is quietly not counted.

const CORS = { methods: ["POST", "OPTIONS"] };
const PER_VIDEO = { maxRequests: 1, windowMs: 10 * 60_000 };
const PER_IP = { maxRequests: 120, windowMs: 60_000 };

export async function OPTIONS(req: NextRequest) {
  return handleOptions(req, CORS);
}

export async function POST(req: NextRequest) {
  const done = () => withCors(req, new NextResponse(null, { status: 204 }), CORS);
  const body = (await req.json().catch(() => null)) as { id?: unknown } | null;
  const id = videoId(body?.id);
  if (!id) return done();
  const ip = requestIp(req.headers);
  if (!checkRateLimit(rateLimitKey("discover-view", ip), PER_IP).allowed) return done();
  if (!checkRateLimit(rateLimitKey("discover-view-video", id, ip), PER_VIDEO).allowed) return done();
  await countDiscoverView(id);
  return done();
}
