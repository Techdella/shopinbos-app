import { NextRequest } from "next/server";
import { withAuth } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { ensureTopUpAccount, walletBalanceView } from "@/lib/wallet/balance.server";
import { WalletIdentityError, verifyWalletNin } from "@/lib/wallet/identity.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/app/wallet/identity { nin, firstName, lastName, dateOfBirth }: checks the owner's NIN, then asks Paystack
// for their wallet account number in that name (src/lib/wallet/identity.server.ts) → { message, wallet }.
export const POST = withAuth(async (req: NextRequest, { user }) => {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  try {
    const result = await verifyWalletNin(user.id, body);
    await ensureTopUpAccount(user.id).catch((error) => console.error("[wallet] account after NIN", error));
    return ok({ message: result.message, wallet: await walletBalanceView(user.id) });
  } catch (error) {
    if (error instanceof WalletIdentityError) return apiError(error.status === 429 ? "RATE_LIMITED" : error.status >= 500 ? "UNAVAILABLE" : "BAD_REQUEST", error.message, error.status);
    console.error("[wallet] NIN check failed", error);
    return apiError("UNAVAILABLE", "We couldn't check your NIN just now. Try again.", 503);
  }
}, ["seller", "supplier", "logistics_partner"]);
