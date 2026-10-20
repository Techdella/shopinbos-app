import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api/response";
import { withAdmin } from "@/lib/auth/middleware";
import { csvCell, KIND_LABELS } from "@/lib/website-leads/pure";
import { LeadsNotReady, listWebsiteLeads } from "@/lib/website-leads/service.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/website-leads/export?kind=&status=&role=&noted=1&q=: the filtered leads as CSV (up to 10,000 rows).
export const GET = withAdmin(async (req: NextRequest) => {
  const params = req.nextUrl.searchParams;
  try {
    const { rows } = await listWebsiteLeads({ kind: params.get("kind") || undefined, status: params.get("status") || undefined, role: params.get("role") || undefined, noted: params.get("noted") === "1", q: params.get("q") || undefined }, 10_000);
    const head = ["Date", "Form", "Name", "Email", "WhatsApp / phone", "Message", "Source", "Page", "Agreed to marketing", "Status", "Note"];
    const lines = rows.map((row) =>
      [row.createdAt.toISOString(), KIND_LABELS[row.kind] ?? row.kind, row.name, row.email, row.phone, row.message, row.source, row.pageUrl, row.consent ? "yes" : "no", row.status, row.note]
        .map(csvCell)
        .join(","),
    );
    return new NextResponse([head.map(csvCell).join(","), ...lines].join("\r\n"), {
      headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="website-leads-${new Date().toISOString().slice(0, 10)}.csv"` },
    });
  } catch (error) {
    if (error instanceof LeadsNotReady) return apiError("NOT_READY", error.message, 503);
    throw error;
  }
});
