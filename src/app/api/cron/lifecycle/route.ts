import { NextRequest, NextResponse } from "next/server";
import { cronDenied } from "@/lib/auth/cron-request";
import { sendLifecycleEmails } from "@/lib/setup/lifecycle.server";
import { sendOnboardingNudges } from "@/lib/onboarding/rex-build.server";
import { provisionPendingWallets, returnQueuedWithdrawals } from "@/lib/wallet/balance.server";
import { recordSettlements } from "@/lib/wallet/settlements.server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Setup nudges for new sellers (src/lib/setup/lifecycle.ts), hourly: Supabase pg_cron ("lifecycle-emails") with
// `Authorization: Bearer $CRON_SECRET`, or a signed QStash call (docs/qstash.md). Also sets up the wallets of
// businesses that haven't been back since wallets came in (their "wallet is ready" email follows), and nudges sellers who
// stopped part-way through Rex's guided build (src/lib/onboarding/rex-build.server.ts sendOnboardingNudges).
export async function GET(req: NextRequest) {
  const denied = await cronDenied(req);
  if (denied) return denied;
  try {
    const wallets = await provisionPendingWallets().catch((error) => {
      console.error("[cron lifecycle] wallets failed", error instanceof Error ? error.message : "unknown");
      return { checked: 0 };
    });
    // Withdrawals have stopped (the balance is spend-only): any still in line go back on the balance.
    const withdrawals = await returnQueuedWithdrawals().catch((error) => {
      console.error("[cron lifecycle] returning queued withdrawals failed", error instanceof Error ? error.message : "unknown");
      return { returned: 0 };
    });
    // Paystack's settlements to each business's bank: on their statement, and "Shopinbos paid ₦X into your bank".
    const settlements = await recordSettlements().catch((error) => {
      console.error("[cron lifecycle] settlements failed", error instanceof Error ? error.message : "unknown");
      return { checked: 0, recorded: 0 };
    });
    // Sellers who stopped part-way through Rex's build: Peggy's WhatsApp nudge after a quiet day (two at most).
    const onboardingNudges = await sendOnboardingNudges().catch((error) => {
      console.error("[cron lifecycle] onboarding nudges failed", error instanceof Error ? error.message : "unknown");
      return { checked: 0, sent: 0 };
    });
    return NextResponse.json({ data: { ...(await sendLifecycleEmails()), wallets, withdrawals, settlements, onboardingNudges } });
  } catch (error) {
    console.error("[cron lifecycle] failed", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: "Lifecycle emails failed" } }, { status: 500 });
  }
}
