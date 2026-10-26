import { NextRequest } from "next/server";
import { withAuth } from "@/lib/auth/middleware";
import { ok } from "@/lib/api/response";
import { creditBalance } from "@/lib/ai/credits.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The AI credit balance for the phone app (one shared balance, AiCreditAccount, for Peggy and Rex): { balance, note }.
// Credits are never sold or pointed to in the app (app store rules; docs/store-payments-audit.md).
export const GET = withAuth(async (_req: NextRequest, { user }) => {
  const balance = await creditBalance(user.id);
  // No "top up on the website" here: app store rules (shared/store-payments.ts).
  return ok({ balance, note: balance > 0 ? null : "You're out of AI credits for now. Your plan's credits refill each month." });
}, ["seller", "supplier", "logistics_partner"]);
