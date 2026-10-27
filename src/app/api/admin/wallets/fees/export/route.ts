import { NextRequest, NextResponse } from "next/server";
import { withAdmin } from "@/lib/auth/middleware";
import { EXPORT_PERIODS, feeLines, feesCsv, feesPdf, type ExportPeriod } from "@/lib/wallet/fees-export.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/wallets/fees/export?format=csv|pdf&period=today|week|month|all: what Shopinbos earned, as a file.
export const GET = withAdmin(async (req: NextRequest) => {
  const params = req.nextUrl.searchParams;
  const period = (params.get("period") ?? "all") in EXPORT_PERIODS ? (params.get("period") ?? "all") as ExportPeriod : "all";
  const now = new Date();
  const data = await feeLines(period, now);
  const name = `shopinbos-fees-${period}-${now.toISOString().slice(0, 10)}`;
  if (params.get("format") === "pdf") {
    const bytes = await feesPdf(data, period, now);
    return new NextResponse(Buffer.from(bytes), { headers: { "content-type": "application/pdf", "content-disposition": `attachment; filename="${name}.pdf"` } });
  }
  return new NextResponse(feesCsv(data.lines), { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${name}.csv"` } });
});
