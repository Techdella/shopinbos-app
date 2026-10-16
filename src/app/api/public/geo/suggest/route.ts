import { NextResponse, type NextRequest } from "next/server";
import { suggestAddresses } from "@/lib/geo/google-maps.server";
import { countryCode } from "@/lib/logistics/geocode";
import { NO_STORE, limited, pointFrom } from "../_shared";

// GET /api/public/geo/suggest?q=12 allen&country=Nigeria&session=<token>[&lat=&lng=]
// → { data: { suggestions: GeoSuggestion[] } }. Empty without GOOGLE_MAPS_API_KEY or under 3 characters.

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const q = (params.get("q") ?? "").trim();
  if (q.length < 3) return NextResponse.json({ data: { suggestions: [] } }, { headers: NO_STORE });
  const blocked = await limited(req);
  if (blocked) return blocked;
  const suggestions = await suggestAddresses(q, { countryCode: countryCode(params.get("country")), sessionToken: params.get("session"), near: pointFrom(params) });
  return NextResponse.json({ data: { suggestions } }, { headers: NO_STORE });
}
