import { withSeller } from "@/lib/auth/middleware";
import { ok } from "@/lib/api/response";
import { sellerPayouts } from "@/lib/seller-money.server";

export const dynamic = "force-dynamic";

// Payouts for the phone app (web /home/payouts shows the same): the latest 100 paid orders and where each one's
// money went (online → the payout bank; cash, POS, transfer → kept by the seller), the totals and the payout bank.
// Payouts are sent automatically by Paystack; there's nothing to request.
//   GET → { data: { hasStore, bank, online: { total, count }, offline: { total, count }, orders } }
export const GET = withSeller(async (_req, { user }) => ok(await sellerPayouts(user.id)));
