import { NextResponse } from "next/server";
import { geoStatus } from "@/lib/geo/address-lookup.server";

// Which address helpers are switched on, so the fields only offer what works (GET /api/public/geo/status).

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({ data: geoStatus() }, { headers: { "Cache-Control": "public, max-age=300" } });
}
