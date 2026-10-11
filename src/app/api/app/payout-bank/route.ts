import { NextRequest } from "next/server";
import { z } from "zod";
import { withSeller } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { db } from "@/lib/db/client";
import { linkSellerPayoutBank, SELLER_PAYOUT_BANKS } from "@/lib/payout-bank";

export const dynamic = "force-dynamic";

// Seller payout bank for the mobile app (the web app uses the linkBankAccount server action; same logic).

export const GET = withSeller(async (_req, { user }) => {
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { brandSettings: true } });
  const settings = (store?.brandSettings ?? {}) as Record<string, unknown>;
  const bank = (settings.payoutBank ?? null) as { bankName?: string; accountName?: string; accountNumberMask?: string } | null;
  return ok({
    banks: SELLER_PAYOUT_BANKS,
    current: bank ? { bankName: bank.bankName ?? null, accountName: bank.accountName ?? null, accountNumberMask: bank.accountNumberMask ?? null } : null,
  });
});

const Body = z.object({
  bankName: z.string().refine((value) => SELLER_PAYOUT_BANKS.includes(value), "Choose your bank from the list."),
  accountNumber: z.string().trim(),
  accountName: z.string().trim().min(2).max(120),
});

export const POST = withSeller(async (req: NextRequest, { user }) => {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Check your bank details.");
  const result = await linkSellerPayoutBank(user.id, parsed.data.bankName, parsed.data.accountNumber, parsed.data.accountName);
  if (!result.success) return apiError("BAD_REQUEST", result.error ?? "Couldn't add that bank account.");
  return ok({ linked: true });
});
