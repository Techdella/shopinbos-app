import type { NextRequest } from "next/server";
import { apiError } from "@/lib/api/response";
import { overPublicLimit } from "@/lib/rate-limit";
import { isLatLng, type LatLng } from "@shared/delivery-geo";

// Address entry endpoints (Google Maps + NIPOST postcodes) for the storefront checkout and the portals' address
// fields. Same-origin only (no CORS): every miss is a paid lookup, so other sites can't spend it. Per-IP limit
// "address" in src/lib/rate-limit.ts.

export const NO_STORE = { "Cache-Control": "private, no-store, max-age=0" };

/** A 429 response when this IP used up its address allowance, else null. */
export async function limited(req: NextRequest) {
  if (await overPublicLimit(req.headers, "address")) {
    return apiError("RATE_LIMITED", "Too many address lookups. Type the address instead, or try again in a few minutes.", 429);
  }
  return null;
}

/** ?lat=&lng= as a point, or null. */
export function pointFrom(params: URLSearchParams): LatLng | null {
  const lat = params.get("lat");
  const lng = params.get("lng");
  if (lat === null || lng === null || lat.trim() === "" || lng.trim() === "") return null;
  const point = { lat: Number(lat), lng: Number(lng) };
  return isLatLng(point) ? point : null;
}
