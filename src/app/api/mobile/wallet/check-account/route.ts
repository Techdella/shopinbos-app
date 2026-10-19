import { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, ok } from "@/lib/api/response";
import { checkRateLimitShared, rateLimitKey } from "@/lib/rate-limit";
import { checkWalletAccount } from "@/lib/wallet/wallet.server";
import { withWalletOwner } from "../_shared";

const Body = z.object({ bankName: z.string().max(80), accountNumber: z.string().max(20) });

// The name on an account before it's saved (Paystack's lookup), so the person confirms it's theirs. Limited so it
// can't be used to look up strangers' accounts in bulk.
export const POST = withWalletOwner(async (req: NextRequest, { user }) => {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", "Choose your bank and enter your account number.", 400);
  if (!(await checkRateLimitShared(rateLimitKey("wallet-account-check", user.id), { maxRequests: 10, windowMs: 60_000 })).allowed) {
    return ok({ status: "unavailable" as const });
  }
  return ok(await checkWalletAccount(parsed.data));
});
