import { NextResponse } from "next/server";

// The server clock, so countdowns in the seller backend and on stores agree even when a phone's clock is wrong
// (src/hooks/useServerClock.ts). Never cached.

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({ data: { serverNow: Date.now() } }, { headers: { "Cache-Control": "no-store, max-age=0" } });
}
