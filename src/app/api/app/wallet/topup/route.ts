import { NextRequest } from "next/server";
import { withAuth } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { WalletBalanceError, startCardTopUp } from "@/lib/wallet/balance.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/app/wallet/topup { naira, returnTo } → { authorizationUrl }: top up by card or bank on Paystack.
export const POST = withAuth(async (req: NextRequest, { user }) => {
  const body = (await req.json().catch(() => ({}))) as { naira?: unknown; returnTo?: unknown };
  const returnTo = typeof body.returnTo === "string" && body.returnTo.startsWith("/") && !body.returnTo.startsWith("//") ? body.returnTo : "/home/wallet";
  try {
    return ok(await startCardTopUp({ userId: user.id, email: user.email, naira: Number(body.naira), origin: req.nextUrl.origin, returnTo }));
  } catch (error) {
    if (error instanceof WalletBalanceError) return apiError("BAD_REQUEST", error.message);
    console.error("[wallet] top-up failed", error);
    return apiError("UNAVAILABLE", "Couldn't start the top-up. Try again.", 503);
  }
}, ["seller", "supplier", "logistics_partner"]);
