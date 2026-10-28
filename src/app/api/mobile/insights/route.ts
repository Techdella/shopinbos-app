import { NextRequest } from "next/server";
import { withSeller } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { db } from "@/lib/db/client";
import { loadAnalytics } from "@/lib/analytics/load";
import { resolveRange } from "@/lib/analytics/range";
import { insightsSummary } from "@/lib/analytics/mobile-insights";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The phone app's Insights screen (apps/mobile/src/app/insights.tsx, board M-Insights): the web's /home/analytics
// numbers for Today, 7 days or 30 days (?range=today|7d|30d), cut down to what fits a phone: sales, orders, store
// visits and visits that bought with their change, where visitors came from, and the best sellers. Same loader as
// the web page (src/lib/analytics/load.ts), so the numbers match.
const RANGES = new Set(["today", "7d", "30d"]);

export const GET = withSeller(async (req: NextRequest, { user }) => {
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true } });
  if (!store) return apiError("NOT_FOUND", "Set up your shop first.", 404);
  const asked = req.nextUrl.searchParams.get("range") ?? "7d";
  const range = resolveRange({ range: RANGES.has(asked) ? asked : "7d" });
  const { report, countersAvailable } = await loadAnalytics(store.id, range);
  return ok(insightsSummary(report, range.key, countersAvailable));
});
