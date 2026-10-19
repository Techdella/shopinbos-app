import { NextRequest } from "next/server";
import { withSeller } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { checkRateLimit } from "@/lib/rate-limit";
import { resolveBankAccount } from "@/lib/payout-bank";
import { walletBankNames } from "@/lib/wallet/wallet.server";
import { ResolveAccountSchema } from "@/lib/seller-settings-rules";

export const dynamic = "force-dynamic";

// The name on a bank account, so the phone app can ask "Is this your account?" before saving the payout bank
// (POST /api/app/payout-bank saves it).
//   POST { bankName, accountNumber } → { data: { status: "resolved", accountName } | { status: "not_found" | "unavailable" } }
// Paystack's lookup, else Korapay's. "unavailable" (neither answered): the seller types the account name instead.

export const POST = withSeller(async (req: NextRequest, { user }) => {
  // Looking up names is a lookup service; keep it to what one person needs.
  if (!checkRateLimit(`resolve-account:${user.id}`, { maxRequests: 10, windowMs: 60_000 }).allowed) {
    return apiError("RATE_LIMITED", "Too many tries. Wait a minute and try again.", 429);
  }
  const parsed = ResolveAccountSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Check your bank details.");
  if (!(await walletBankNames()).includes(parsed.data.bankName)) return apiError("BAD_REQUEST", "Choose your bank from the list.");
  return ok(await resolveBankAccount(parsed.data.bankName, parsed.data.accountNumber));
});
