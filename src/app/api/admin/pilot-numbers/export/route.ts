import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/auth/middleware";
import { pilotShopNumbers } from "@/lib/pilot-numbers.server";
import { pilotCsv } from "@shared/pilot-numbers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

// GET /api/admin/pilot-numbers/export: every pilot shop's numbers (shared/pilot-numbers.ts) as CSV. No personal data:
// shop names, handles and counts only. Analytics section (the API middleware checks the admin role).
export const GET = withAdmin(async () => {
  const rows = await pilotShopNumbers();
  return new NextResponse(pilotCsv(rows), {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="pilot-numbers-${new Date().toISOString().slice(0, 10)}.csv"`, "cache-control": "private, no-store" },
  });
});
