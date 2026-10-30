import { NextRequest, NextResponse } from "next/server";
import { cronDenied } from "@/lib/auth/cron-request";
import { sendDueCampaigns } from "@/lib/campaigns/send";
import { sweepAbandonedCartMessages } from "@/lib/notifications/customer-messages";
import { resumeFollowerBlasts } from "@/lib/followers/blasts.server";
import { processDueEnrollments, sweepAbandonedCarts, sweepBirthdays, sweepBrowseAbandonment, sweepWinBack } from "@/lib/automations/flow-engine";

export const maxDuration = 300;

// The marketing scheduler: sends scheduled campaigns, enrolls contacts in flows (abandoned carts,
// saved-but-didn't-buy, win-back, birthdays), sends WhatsApp/SMS cart reminders, runs every flow step whose wait is over, and finishes follower blasts.
// Called every 10 minutes by Supabase pg_cron (docs/migrations/2026-10-12-marketing.sql) with
// `Authorization: Bearer $CRON_SECRET`.
export async function GET(req: NextRequest) {
  const denied = await cronDenied(req);
  if (denied) return denied;
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
  // Order messages: the one WhatsApp/SMS cart reminder stores switched on in Marketing › Order messages.
  const cartMessages = await safely("cart messages", () => sweepAbandonedCartMessages(now));
  const steps = await safely("steps", () => processDueEnrollments(new Date()));
  // Notify my followers: blasts still queued, or whose sending run stopped (time limit, crash).
  const followerBlasts = await safely("follower blasts", () => resumeFollowerBlasts(new Date()));
  return NextResponse.json({ data: { campaigns, enrolled, cartMessages, steps, followerBlasts } });
}
