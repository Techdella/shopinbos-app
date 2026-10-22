import { NextRequest } from "next/server";
import { withAuth } from "@/lib/auth/middleware";
import { ok } from "@/lib/api/response";
import { creditBalance } from "@/lib/ai/credits.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The AI credit balance for the phone app (one shared balance, AiCreditAccount, for Peggy and Rex): { balance, note }.
// Credits are never sold in the app (app store rules): "Top up" is POST /api/mobile/credits/topup-email.
export const GET = withAuth(async (_req: NextRequest, { user }) => {
  const balance = await creditBalance(user.id);
  return ok({ balance, note: balance > 0 ? null : "You're out of credits. Your daily allowance still works, and you can top up on the website." });
}, ["seller", "supplier", "logistics_partner"]);
