import { NextRequest, NextResponse } from "next/server";
import { cronAuthorization } from "@/lib/auth/cron";
import { runDomainRenewals } from "@/lib/domains/billing.server";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

// Domains bought through Shopinbos (src/lib/domains/billing.server.ts): finishes registrar orders still in progress,
// reminds sellers 30, 7 and 1 days before expiry (bell + email, "Renew for ₦X"), tries the saved card 7 days before,
// and 3 days after an unrenewed expiry takes the domain off the store and the Vercel project. Called daily by
// Supabase pg_cron (docs/migrations/2026-10-24-domain-billing.sql) with `Authorization: Bearer $CRON_SECRET`.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: { code: "NOT_CONFIGURED", message: "CRON_SECRET is not set" } }, { status: 503 });
  if (cronAuthorization(req.headers.get("authorization"), secret) !== "ok") {
    return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Invalid cron secret" } }, { status: 401 });
  }
  try {
    return NextResponse.json({ data: await runDomainRenewals() });
  } catch (error) {
    console.error("[cron domain-renewals] failed", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: "Domain renewals failed" } }, { status: 500 });
  }
}
