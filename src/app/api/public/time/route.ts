import { NextResponse } from "next/server";

// The server clock for storefront countdowns (store hosts only reach /api/public). Same as /api/time.

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({ data: { serverNow: Date.now() } }, { headers: { "Cache-Control": "no-store, max-age=0" } });
}
