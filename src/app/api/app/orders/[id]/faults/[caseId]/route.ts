import { z } from "zod";
import { db } from "@/lib/db/client";
import { withSeller } from "@/lib/auth/middleware";
import { ok, apiError } from "@/lib/api/response";
import { sellerDecidesFault } from "@/lib/faults/customer.server";
import { sellerOrderMoney } from "@/lib/faults/seller.server";

// The seller's decision on an outcome Shopinbos suggested for their order (out of stock, a late part the customer
// asked to cancel, a delivery that came back, a return that's back). The shop is the seller's business: nothing
// happens until they accept it. The phone's order screen; the web uses the server action (src/app/actions/faults.ts).
//   POST { accept: true }   it applies now (refund guided, money owed between the businesses, everyone told)
//   POST { accept: false }  the seller handles it themselves: nothing happens
// Answers { data: { message, money } } (the order's money after the change).

const Body = z.object({ accept: z.boolean() });

export const POST = withSeller(async (req, { user, params }) => {
  const { id, caseId } = await params;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("BAD_REQUEST", "Accept it, or say you'll handle it yourself.");
  const order = await db.retailOrder.findFirst({ where: { id: String(id), store: { userId: user.id } } });
  if (!order) return apiError("NOT_FOUND", "We couldn't find this order.", 404);
  const result = await sellerDecidesFault(user.id, String(caseId), parsed.data.accept);
  if (!result.ok) return apiError("CONFLICT", result.error, 409);
  return ok({ message: result.message, money: await sellerOrderMoney({ ...order, total: Number(order.total) }) });
});
