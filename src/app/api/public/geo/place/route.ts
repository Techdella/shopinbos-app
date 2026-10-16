import { NextResponse, type NextRequest } from "next/server";
import { apiError } from "@/lib/api/response";
import { resolvePlace } from "@/lib/geo/address-lookup.server";
import { NO_STORE, limited } from "../_shared";

// GET /api/public/geo/place?id=<placeId>&session=<token> → { data: GeoAddress }: the picked suggestion as address
// parts, its pin and (in Nigeria) the building's digital postcode.

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id") ?? "";
  if (!id) return apiError("BAD_REQUEST", "Pick an address from the list.");
  const blocked = await limited(req);
  if (blocked) return blocked;
  const address = await resolvePlace(id, req.nextUrl.searchParams.get("session"));
  if (!address) return apiError("NOT_FOUND", "We couldn't load that address. Type it in instead.");
  return NextResponse.json({ data: address }, { headers: NO_STORE });
}
