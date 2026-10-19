import { NextRequest } from "next/server";
import { z } from "zod";
import { withSeller } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { db } from "@/lib/db/client";
import { linkWalletBank, walletBankNames } from "@/lib/wallet/wallet.server";

export const dynamic = "force-dynamic";

// Seller payout bank for the mobile app (the web app uses the linkBankAccount server action; same logic). Saving it
// also sets up the seller's Shopinbos Wallet, which is where card payments are split to (src/lib/wallet).

export const GET = withSeller(async (_req, { user }) => {
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { brandSettings: true } });
  const settings = (store?.brandSettings ?? {}) as Record<string, unknown>;
  const bank = (settings.payoutBank ?? null) as { bankName?: string; accountName?: string; accountNumberMask?: string } | null;
  return ok({
    banks: await walletBankNames(),
    current: bank ? { bankName: bank.bankName ?? null, accountName: bank.accountName ?? null, accountNumberMask: bank.accountNumberMask ?? null } : null,
  });
});

const Body = z.object({
  bankName: z.string().trim().min(2).max(80),
  accountNumber: z.string().trim(),
  /** Older app builds send the name they showed; the looked-up name is what's saved. */
  accountName: z.string().trim().max(120).optional(),
});

export const POST = withSeller(async (req: NextRequest, { user }) => {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Check your bank details.");
  if (!(await walletBankNames()).includes(parsed.data.bankName)) return apiError("BAD_REQUEST", "Choose your bank from the list.");
  const wallet = await linkWalletBank({ id: user.id, role: "seller" }, { bankName: parsed.data.bankName, accountNumber: parsed.data.accountNumber });
  // linkWalletBank looks the account up and saves it as the payout bank too, under the bank's own name for it.
  if (!wallet.ok) return apiError("BAD_REQUEST", wallet.error);
  return ok({ linked: true });
});
