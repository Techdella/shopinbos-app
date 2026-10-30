import { withAuth } from "@/lib/auth/middleware";
import { ok } from "@/lib/api/response";
import { earnerLedger } from "@/lib/payouts/ledger.server";
import { resellableProducts, resellerSales } from "@/lib/resell/service.server";
import { resellFailure, resellOff, resellOnForRequest } from "@/lib/resell/route-helpers.server";

export const dynamic = "force-dynamic";

// For resellers (any signed-in account resell is on for): the products they may resell, with their own link when
// they have one, their sales and what the shops owe them, and their payout ledger totals (Admin › Payouts: what's on
// the Friday list for them and what was marked paid, airtime rewards included; null until the ledger is set up).
//   GET → { data: { products: [...], sales: [...], totals: { owed, ready, paid, count, value }, ledger: { owed, paid, airtime, lastPaidAt } | null } }
export const GET = withAuth(async (req, { user }) => {
  if (!(await resellOnForRequest(req, user.id))) return resellOff();
  try {
    const [products, mine, ledger] = await Promise.all([resellableProducts(user.id), resellerSales(user.id), earnerLedger(user.id)]);
    return ok({ products, sales: mine.sales, totals: mine.totals, ledger });
  } catch (error) {
    return resellFailure(error);
  }
});
