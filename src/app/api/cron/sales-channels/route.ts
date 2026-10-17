import { NextRequest, NextResponse } from "next/server";
import { cronAuthorization } from "@/lib/auth/cron";
import { syncDueConnections } from "@/lib/sales-channels/server";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

// Sell everywhere: re-syncs connected Facebook & Instagram, TikTok and Google catalogs that haven't synced for
// 6 hours (refreshes Google tokens, pushes products to Meta, updates "{n} products showing"; expired Meta tokens
// turn into "Connect again"). Called every 2 hours by Supabase pg_cron (docs/migrations/2026-10-22-sales-channels.sql)
// with `Authorization: Bearer $CRON_SECRET`. The WhatsApp catalog has its own cron (/api/cron/whatsapp-catalog).
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: { code: "NOT_CONFIGURED", message: "CRON_SECRET is not set" } }, { status: 503 });
  if (cronAuthorization(req.headers.get("authorization"), secret) !== "ok") {
    return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Invalid cron secret" } }, { status: 401 });
  }
  try {
    return NextResponse.json({ data: await syncDueConnections() });
  } catch (error) {
    console.error("[cron sales-channels] failed", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: "Sales channel sync failed" } }, { status: 500 });
  }
}
