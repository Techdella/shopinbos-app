import { NextRequest, NextResponse } from "next/server";
import { cronAuthorization } from "@/lib/auth/cron";
import { expireUnpaidOrders, unpaidOrderTtl } from "@/lib/commerce/order-expiry.server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Cancels unpaid card/transfer store orders older than UNPAID_ORDER_TTL_MINUTES (default 30) and gives their
// stock back (the store's, or the supplier's for dropship). Pay-on-delivery and paid orders are never touched.
// Called every 5 minutes by Supabase pg_cron (docs/migrations/2026-10-14-expire-orders-cron.sql) with
// `Authorization: Bearer $CRON_SECRET`. Checkout also runs it cheaply, so it works before the job is scheduled.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: { code: "NOT_CONFIGURED", message: "CRON_SECRET is not set" } }, { status: 503 });
  if (cronAuthorization(req.headers.get("authorization"), secret) !== "ok") {
    return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Invalid cron secret" } }, { status: 401 });
  }
  try {
    let checked = 0;
    let expired = 0;
    // A few passes of 200 so a backlog clears in one call without running long.
    for (let pass = 0; pass < 5; pass += 1) {
      const result = await expireUnpaidOrders({ limit: 200 });
      checked += result.checked;
      expired += result.expired;
      if (result.checked < 200) break;
    }
    return NextResponse.json({ data: { checked, expired, ttlMinutes: unpaidOrderTtl() } });
  } catch (error) {
    console.error("[cron expire-orders] failed", error);
    return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: "Could not expire unpaid orders" } }, { status: 500 });
  }
}
