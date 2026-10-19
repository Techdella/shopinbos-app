import { NextRequest, NextResponse } from "next/server";
import { cronDenied } from "@/lib/auth/cron-request";
import { syncDueStores } from "@/lib/whatsapp-catalog/server";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

// WhatsApp catalog sync: pushes product changes for stores flagged dirty by markCatalogDirty, checks Meta's answer
// for batches in flight, and re-checks every connected catalog every 6 hours (stock changes from orders).
// Called every 15 minutes by Supabase pg_cron (docs/migrations/2026-10-15-whatsapp-catalog.sql) with
// `Authorization: Bearer $CRON_SECRET`.
export async function GET(req: NextRequest) {
  const denied = await cronDenied(req);
  if (denied) return denied;
  try {
    return NextResponse.json({ data: await syncDueStores() });
  } catch (error) {
    console.error("[cron whatsapp-catalog] failed", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: "WhatsApp catalog sync failed" } }, { status: 500 });
  }
}
