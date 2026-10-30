import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api/response";
import { withAdmin } from "@/lib/auth/middleware";
import { PayoutsNotReady, ledgerWeek, logLedgerExport, owedByLabel } from "@/lib/payouts/ledger.server";
import { cleanPayday, isPayoutSourceKind, ledgerCsv } from "@shared/payout-ledger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/payouts/export?week=YYYY-MM-DD&status=&kind=&q=: one Friday's payout list as CSV, a line per row,
// with each earner's phone and bank details (to pay by hand). Money section only (the API middleware checks the
// admin role); each earner in it gets an entry in the admin data access log.
export const GET = withAdmin(async (req: NextRequest, { user }) => {
  const params = req.nextUrl.searchParams;
  const status = (["owed", "paid", "void"] as const).find((value) => value === params.get("status")) ?? "";
  const kind = params.get("kind");
  try {
    const week = await ledgerWeek(cleanPayday(params.get("week")), { status, kind: isPayoutSourceKind(kind) ? kind : "", q: (params.get("q") ?? "").slice(0, 80) });
    const rows = week.lines.map((line) => {
      const person = week.earners.get(line.earnerUserId);
      return {
        payday: week.payday,
        earnerName: person?.name ?? "",
        email: person?.email ?? null,
        phone: person?.phone ?? null,
        bankName: person?.bank?.bankName ?? null,
        accountNumber: person?.bank?.accountNumber ?? null,
        accountName: person?.bank?.accountName ?? null,
        owedBy: owedByLabel(line, week.storeName),
        line,
      };
    });
    await logLedgerExport(user.id, week.lines.map((line) => line.earnerUserId), week.payday);
    return new NextResponse(ledgerCsv(rows), {
      headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="payouts-${week.payday}.csv"`, "cache-control": "private, no-store" },
    });
  } catch (error) {
    if (error instanceof PayoutsNotReady) return apiError("NOT_READY", error.message, 503);
    throw error;
  }
});
