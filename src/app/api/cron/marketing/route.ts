import { NextRequest, NextResponse } from "next/server";
import { sendDueCampaigns } from "@/lib/campaigns/send";
import { processDueEnrollments, sweepAbandonedCarts, sweepBirthdays, sweepBrowseAbandonment, sweepWinBack } from "@/lib/automations/flow-engine";

export const maxDuration = 300;

// The marketing scheduler: sends scheduled campaigns, enrolls contacts in flows (abandoned carts,
// saved-but-didn't-buy, win-back, birthdays) and runs every flow step whose wait is over.
// Called every 10 minutes by Supabase pg_cron (docs/migrations/2026-10-12-marketing.sql) with
// `Authorization: Bearer $CRON_SECRET`.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: { code: "NOT_CONFIGURED", message: "CRON_SECRET is not set" } }, { status: 503 });
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Invalid cron secret" } }, { status: 401 });
  }
  const now = new Date();
  const safely = async <T,>(label: string, run: () => Promise<T>) => {
    try {
      return await run();
    } catch (error) {
      console.error(`[cron marketing] ${label} failed`, error);
      return `failed: ${error instanceof Error ? error.message : String(error)}`;
    }
  };
  const campaigns = await safely("campaigns", () => sendDueCampaigns(now));
  const enrolled = {
    carts: await safely("carts", () => sweepAbandonedCarts(now)),
    browse: await safely("browse", () => sweepBrowseAbandonment(now)),
    winBack: await safely("win-back", () => sweepWinBack(now)),
    birthdays: await safely("birthdays", () => sweepBirthdays(now)),
  };
  const steps = await safely("steps", () => processDueEnrollments(new Date()));
  return NextResponse.json({ data: { campaigns, enrolled, steps } });
}
