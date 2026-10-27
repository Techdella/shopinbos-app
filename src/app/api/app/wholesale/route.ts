import { NextRequest } from "next/server";
import { withSeller } from "@/lib/auth/middleware";
import { ok } from "@/lib/api/response";
import { sellerWholesaleRows } from "@/lib/supplier-orders/preorders.server";

export const dynamic = "force-dynamic";

// GET /api/app/wholesale: the seller's wholesale orders, newest first, with whether each can be paid by card now
// (PATCH ./[id] { action: "pay" } starts it) and `pay` ({ step: deposit | balance | full, kobo }) for what that
// payment is. `preorder` ({ shipsOn, stage, readyAt, depositKobo, depositPaid, paidKobo, dueKobo }) when it was a
// preorder (it ships from the supplier's date; a deposit is paid first and the rest once the supplier says the
// stock is ready, shared/preorder.ts), else null. ?preorders=1: only preorders.
export const GET = withSeller(async (req: NextRequest, { user }) => {
  return ok(await sellerWholesaleRows(user.id, { onlyPreorders: req.nextUrl.searchParams.get("preorders") === "1" }));
});
