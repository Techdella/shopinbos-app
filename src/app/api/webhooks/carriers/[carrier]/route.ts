import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { carrierFor } from "@/lib/logistics/carriers";
import { syncCarrierJobs } from "@/lib/logistics/carriers/jobs.server";
import { checkRateLimitShared, rateLimitKey, requestIp } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Status callbacks from delivery companies we book through their API: /api/webhooks/carriers/fez, /sendstack,
// /sendbox (set in each carrier's dashboard, or sent per shipment). The body only says which job changed: we read
// its status from the carrier's API again (as GET /api/cron/carrier-sync does), so a forged callback can't move a
// job. Always answers 200 for a known carrier, so carriers don't retry forever.
export async function POST(req: NextRequest, { params }: { params: Promise<{ carrier: string }> }) {
  const { carrier: key } = await params;
  const carrier = carrierFor({ carrier: key });
  if (!carrier?.webhookRef) return NextResponse.json({ error: { code: "NOT_FOUND", message: "Unknown carrier" } }, { status: 404 });

  if (!(await checkRateLimitShared(rateLimitKey(`carrier-webhook:${carrier.id}`, requestIp(req.headers)), { maxRequests: 120, windowMs: 60_000 })).allowed) {
    return NextResponse.json({ error: { code: "RATE_LIMITED", message: "Too many requests" } }, { status: 429 });
  }

  const payload = await req.json().catch(() => null);
  const ref = carrier.webhookRef(payload);
  if (ref) {
    const booking = await db.deliveryBooking.findFirst({ where: { externalCarrier: carrier.id, externalRef: ref }, select: { id: true } });
    if (booking) await syncCarrierJobs({ ids: [booking.id] }).catch((error) => console.error(`[carrier webhook] ${carrier.id} sync failed`, error));
  }
  return NextResponse.json({ data: { received: true } });
}
