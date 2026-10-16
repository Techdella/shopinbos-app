import { NextResponse, type NextRequest } from "next/server";
import { apiError } from "@/lib/api/response";
import { resolvePoint } from "@/lib/geo/address-lookup.server";
import { NO_STORE, limited, pointFrom } from "../_shared";

// GET /api/public/geo/reverse?lat=6.6018&lng=3.3515 → { data: GeoAddress } ("use my location").

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const point = pointFrom(req.nextUrl.searchParams);
  if (!point) return apiError("BAD_REQUEST", "We couldn't read your location.");
  const blocked = await limited(req);
  if (blocked) return blocked;
  const address = await resolvePoint(point);
  if (!address) return apiError("NOT_FOUND", "We couldn't find an address at your location. Type it in instead.");
  return NextResponse.json({ data: address }, { headers: NO_STORE });
}
