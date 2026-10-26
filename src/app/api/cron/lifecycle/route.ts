import { NextRequest, NextResponse } from "next/server";
import { cronDenied } from "@/lib/auth/cron-request";
import { sendLifecycleEmails } from "@/lib/setup/lifecycle.server";
import { provisionPendingWallets, sendQueuedWithdrawals } from "@/lib/wallet/balance.server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Setup nudges for new sellers (src/lib/setup/lifecycle.ts), hourly: Supabase pg_cron ("lifecycle-emails") with
// `Authorization: Bearer $CRON_SECRET`, or a signed QStash call (docs/qstash.md). Also sets up the wallets of
// businesses that haven't been back since wallets came in (their "wallet is ready" email follows).
export async function GET(req: NextRequest) {
  const denied = await cronDenied(req);
  if (denied) return denied;
  try {
    const wallets = await provisionPendingWallets().catch((error) => {
      console.error("[cron lifecycle] wallets failed", error instanceof Error ? error.message : "unknown");
      return { checked: 0 };
    });
    // Wallet withdrawals waiting for the Paystack balance go out once it covers them.
    const withdrawals = await sendQueuedWithdrawals().catch((error) => {
      console.error("[cron lifecycle] queued withdrawals failed", error instanceof Error ? error.message : "unknown");
      return { sent: 0, waiting: 0 };
    });
    return NextResponse.json({ data: { ...(await sendLifecycleEmails()), wallets, withdrawals } });
  } catch (error) {
    console.error("[cron lifecycle] failed", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: "Lifecycle emails failed" } }, { status: 500 });
  }
}
