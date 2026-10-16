import { NextResponse, type NextRequest } from "next/server";
import { apiError } from "@/lib/api/response";
import { resolvePostcode } from "@/lib/geo/address-lookup.server";
import { parseNgPostcode } from "@shared/ng-postcode";
import { limited } from "../_shared";

// GET /api/public/geo/postcode?code=LA-11-W06-TC-10 → { data: GeoAddress } with `postcode.assigned` from NIPOST
// (null when NIPOST isn't configured or didn't answer: the format was still checked).

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const code = parseNgPostcode(req.nextUrl.searchParams.get("code"));
  if (!code) return apiError("BAD_REQUEST", "That isn't a Nigerian postcode. They look like LA-11-W06-TC-10.");
  const blocked = await limited(req);
  if (blocked) return blocked;
  const address = await resolvePostcode(code.canonical);
  if (!address) return apiError("NOT_FOUND", "We couldn't check that postcode.");
  // A building's postcode doesn't move: shared caches may keep the answer for a day.
  return NextResponse.json({ data: address }, { headers: { "Cache-Control": "public, max-age=3600, s-maxage=86400" } });
}
