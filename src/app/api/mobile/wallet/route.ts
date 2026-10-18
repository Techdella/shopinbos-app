import { NextRequest } from "next/server";
import { ok } from "@/lib/api/response";
import { PAYSTACK_BANK_CODES } from "@/lib/payout-bank";
import { cashOwedToSeller } from "@/lib/logistics/seller-payins.server";
import { loadWalletView } from "@/lib/wallet/wallet.server";
import type { WalletRole } from "@/lib/wallet/rules";
import { withWalletOwner } from "./_shared";

export const dynamic = "force-dynamic";

// The wallet screen: ID check, bank, what Paystack paid in and settled, and (sellers) cash on delivery a delivery
// partner still owes them. `banks` is the list the bank picker shows.
export const GET = withWalletOwner(async (_req: NextRequest, { user }) => {
  const role = user.role as WalletRole;
  const [view, cashToReceive] = await Promise.all([loadWalletView({ id: user.id, role }), role === "seller" ? cashOwedToSeller(user.id) : Promise.resolve([])]);
  return ok({ role, ownerName: user.name, view, cashToReceive, banks: Object.keys(PAYSTACK_BANK_CODES).sort((a, b) => a.localeCompare(b)) });
});
