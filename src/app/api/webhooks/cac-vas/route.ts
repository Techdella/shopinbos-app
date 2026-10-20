import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { checkRateLimit } from "@/lib/rate-limit";
import { refreshRegistration } from "@/lib/business-registration/service.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// CAC VAS status webhook (vas.cac.gov.ng → Registrations → Business Name → Update Callback URL):
//   https://app.shopinbos.com/api/webhooks/cac-vas
// CAC posts here when a business name application changes status (approved, queried…). The body is only used to
// find which application it's about: its status is then read from CAC's own API (refreshRegistration), so a forged
// call can't approve or query anything. Unknown references are ignored. The 10-minute cron covers missed calls.

/** Every "VAS…" transaction reference anywhere in the payload (CAC hasn't documented its shape). */
function references(value: unknown, found = new Set<string>(), depth = 0): Set<string> {
  if (depth > 5 || found.size > 10) return found;
  if (typeof value === "string") {
    if (/^VAS[0-9A-Za-z]{8,40}$/.test(value.trim())) found.add(value.trim());
  } else if (Array.isArray(value)) {
    for (const item of value) references(item, found, depth + 1);
  } else if (value && typeof value === "object") {
    for (const item of Object.values(value)) references(item, found, depth + 1);
  }
  return found;
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!checkRateLimit(`cac-vas-webhook:${ip}`, { maxRequests: 60, windowMs: 60_000 }).allowed) {
    return NextResponse.json({ received: false }, { status: 429 });
  }
  const body = await req.json().catch(() => null);
  const refs = [...references(body)];
  if (!refs.length) return NextResponse.json({ received: true });
  const rows = await db.businessRegistration.findMany({ where: { transactionRef: { in: refs }, status: { in: ["submitted", "queried"] } }, take: 5 });
  for (const row of rows) {
    await refreshRegistration(row).catch((error) => console.error("[cac-vas webhook] status read failed", row.id, error instanceof Error ? error.message : error));
  }
  return NextResponse.json({ received: true });
}
