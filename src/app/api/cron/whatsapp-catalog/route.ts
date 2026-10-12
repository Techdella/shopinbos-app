import { NextRequest, NextResponse } from "next/server";
import { cronAuthorization } from "@/lib/auth/cron";
import { syncDueStores } from "@/lib/whatsapp-catalog/server";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

// WhatsApp catalog sync: pushes product changes for stores flagged dirty by markCatalogDirty, checks Meta's answer
// for batches in flight, and re-checks every connected catalog every 6 hours (stock changes from orders).
// Called every 15 minutes by Supabase pg_cron (docs/migrations/2026-10-15-whatsapp-catalog.sql) with
// `Authorization: Bearer $CRON_SECRET`.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: { code: "NOT_CONFIGURED", message: "CRON_SECRET is not set" } }, { status: 503 });
  if (cronAuthorization(req.headers.get("authorization"), secret) !== "ok") {
    return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Invalid cron secret" } }, { status: 401 });
  }
  try {
    return NextResponse.json({ data: await syncDueStores() });
  } catch (error) {
    console.error("[cron whatsapp-catalog] failed", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: "WhatsApp catalog sync failed" } }, { status: 500 });
  }
}
