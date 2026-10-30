import { withAuth } from "@/lib/auth/middleware";
import { ok } from "@/lib/api/response";
import { resellableProducts, resellerSales } from "@/lib/resell/service.server";
import { resellFailure, resellOff, resellOnForRequest } from "@/lib/resell/route-helpers.server";

export const dynamic = "force-dynamic";

// For resellers (any signed-in account resell is on for): the products they may resell, with their own link when
// they have one, and their sales and what the shops owe them.
//   GET → { data: { products: [...], sales: [...], totals: { owed, ready, paid, count, value } } }
export const GET = withAuth(async (req, { user }) => {
  if (!(await resellOnForRequest(req, user.id))) return resellOff();
  try {
    const [products, mine] = await Promise.all([resellableProducts(user.id), resellerSales(user.id)]);
    return ok({ products, sales: mine.sales, totals: mine.totals });
  } catch (error) {
    return resellFailure(error);
  }
});
