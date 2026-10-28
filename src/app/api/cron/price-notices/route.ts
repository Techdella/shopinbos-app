import { NextRequest, NextResponse } from "next/server";
import { cronDenied } from "@/lib/auth/cron-request";
import { applyDuePriceChanges } from "@/lib/marketplace/price-notice.server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Supplier price rises on 7 days' notice (shared/price-notice.ts): makes every waiting price that is due live, then
// pauses any shop's dropship listing that would now lose money on a sale (never sold at a loss) and offers the seller
// "Raise to ₦X". Idempotent (each price is claimed once). Called daily by the QStash schedule "shopinbos-price-notices"
// (scripts/qstash-schedules.mjs) with `Authorization: Bearer $CRON_SECRET` or a QStash signature.
export async function GET(req: NextRequest) {
  const denied = await cronDenied(req);
  if (denied) return denied;
  try {
    const result = await applyDuePriceChanges(new Date());
    return NextResponse.json({ data: result });
  } catch (error) {
    console.error("[cron price-notices] failed", error);
    return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: "Could not apply supplier price changes" } }, { status: 500 });
  }
}
