import { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, ok } from "@/lib/api/response";
import { linkWalletBank } from "@/lib/wallet/wallet.server";
import type { WalletRole } from "@/lib/wallet/rules";
import { withWalletOwner } from "../_shared";

const Body = z.object({ bankName: z.string().max(80), accountNumber: z.string().max(20) });

// Step 2: the bank Paystack settles to (a Paystack subaccount in the business's name, src/lib/wallet).
export const POST = withWalletOwner(async (req: NextRequest, { user }) => {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", "Choose your bank and enter your account number.", 400);
  const result = await linkWalletBank({ id: user.id, role: user.role as WalletRole }, parsed.data);
  return result.ok ? ok(result) : apiError("NOT_LINKED", result.error, 422);
});
