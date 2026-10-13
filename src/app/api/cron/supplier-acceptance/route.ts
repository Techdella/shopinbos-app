import { NextRequest, NextResponse } from "next/server";
import { cronAuthorization } from "@/lib/auth/cron";
import { runSupplierAcceptance } from "@/lib/supplier-orders/acceptance.server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// New supplier orders that weren't accepted in time (4 hours for orders shops sold, 24 hours for bulk orders;
// SUPPLIER_ACCEPT_HOURS_DROPSHIP / SUPPLIER_ACCEPT_HOURS_WHOLESALE): reminds the supplier an hour before, then
// expires the order, gives its stock back, tells the shop what it can do and counts it against the supplier.
// Race-safe: each expiry is a conditional update, so an accept that lands at the same moment wins.
// Called every 5 minutes by Supabase pg_cron (docs/migrations/2026-10-18-supplier-acceptance-pickup.sql) with
// `Authorization: Bearer $CRON_SECRET`.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: { code: "NOT_CONFIGURED", message: "CRON_SECRET is not set" } }, { status: 503 });
  if (cronAuthorization(req.headers.get("authorization"), secret) !== "ok") {
    return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Invalid cron secret" } }, { status: 401 });
  }
  try {
    const result = await runSupplierAcceptance(new Date());
    return NextResponse.json({ data: result });
  } catch (error) {
    console.error("[cron supplier-acceptance] failed", error);
    return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: "Could not check supplier orders" } }, { status: 500 });
  }
}
