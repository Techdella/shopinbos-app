import { NextRequest } from "next/server";
import { withAuth } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { WalletBalanceError, withdrawToBank } from "@/lib/wallet/balance.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/app/wallet/withdraw { naira }: send part of the balance to their checked bank (Paystack transfer).
export const POST = withAuth(async (req: NextRequest, { user }) => {
  const body = (await req.json().catch(() => ({}))) as { naira?: unknown };
  try {
    return ok(await withdrawToBank(user.id, Number(body.naira)));
  } catch (error) {
    if (error instanceof WalletBalanceError) return apiError("BAD_REQUEST", error.message);
    console.error("[wallet] withdrawal failed", error);
    return apiError("UNAVAILABLE", "Couldn't start the withdrawal. Try again.", 503);
  }
}, ["seller", "supplier", "logistics_partner"]);
