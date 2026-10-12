import { NextRequest, NextResponse } from "next/server";
import { cronAuthorization } from "@/lib/auth/cron";
import { runLifecycle } from "@/lib/lifecycle/run.server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

// Lifecycle email sweep (src/lib/lifecycle): onboarding nudges, milestones, win-backs, anniversaries and Monday
// summaries for sellers, suppliers, delivery partners and admins. Call with `Authorization: Bearer $CRON_SECRET`,
// hourly (pg_cron: docs/migrations/2026-10-16-lifecycle-emails.sql).
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: { code: "NOT_CONFIGURED", message: "CRON_SECRET is not set" } }, { status: 503 });
  if (cronAuthorization(req.headers.get("authorization"), secret) !== "ok") {
    return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Invalid cron secret" } }, { status: 401 });
  }
  return NextResponse.json({ data: await runLifecycle() });
}
