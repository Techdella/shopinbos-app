import { db } from "@/lib/db/client";
import { withSeller } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { storeResellSales } from "@/lib/resell/service.server";
import { resellFailure, resellOff, resellOnForRequest } from "@/lib/resell/route-helpers.server";

export const dynamic = "force-dynamic";

// The shop's resell sales (pilot "resell"): who sold what through their link and the commission the shop owes them
// (Shopinbos records it; the shop pays). Reseller names only, never their phone or email.
//   GET → { data: { sales: [...], totals: { owed, ready, paid, count, value } } }
export const GET = withSeller(async (req, { user }) => {
  if (!(await resellOnForRequest(req, user.id))) return resellOff();
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true } });
  if (!store) return apiError("NOT_FOUND", "Store not found", 404);
  try {
    return ok(await storeResellSales(store.id));
  } catch (error) {
    return resellFailure(error);
  }
});
