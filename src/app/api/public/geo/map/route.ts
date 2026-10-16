import { NextResponse, type NextRequest } from "next/server";
import { staticMapImage } from "@/lib/geo/google-maps.server";
import { limited, pointFrom } from "../_shared";

// GET /api/public/geo/map?lat=&lng=[&w=600&h=240&z=16] → PNG with a pin (Maps Static API through us, so the key
// stays on the server and img-src stays 'self'). Points are rounded to ~1 m so repeat views hit the CDN.

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const point = pointFrom(params);
  if (!point) return new NextResponse(null, { status: 400 });
  const blocked = await limited(req);
  if (blocked) return new NextResponse(null, { status: 429 });
  const rounded = { lat: Number(point.lat.toFixed(5)), lng: Number(point.lng.toFixed(5)) };
  const image = await staticMapImage(rounded, { width: Number(params.get("w")) || undefined, height: Number(params.get("h")) || undefined, zoom: Number(params.get("z")) || undefined });
  if (!image) return new NextResponse(null, { status: 404, headers: { "Cache-Control": "public, max-age=300" } });
  return new NextResponse(image.body, { headers: { "Content-Type": image.contentType, "Cache-Control": "public, max-age=86400, s-maxage=604800, immutable" } });
}
