import { z } from "zod";
import { db } from "@/lib/db/client";
import { withSeller } from "@/lib/auth/middleware";
import { ok, apiError } from "@/lib/api/response";
import { decideReturn, markReturnReceived, returnsForOrder } from "@/lib/faults/returns.server";

// The seller answers a customer's return (web order page and the phone's order screen):
//   POST { action: "approve" }                   books the trip back with the partner who delivered it
//   POST { action: "decline", reason }           the customer sees the reason
//   POST { action: "received" }                  it's back: the refund follows the matrix (shared/fault-matrix.ts row 6)
// Answers { data: { returns } } (the order's returns after the change).

const Body = z.object({ action: z.enum(["approve", "decline", "received"]), reason: z.string().trim().max(500).optional() });

export const POST = withSeller(async (req, { user, params }) => {
  const { id, returnId } = await params;
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true, userId: true } });
  if (!store) return apiError("NOT_FOUND", "Store not found", 404);
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("BAD_REQUEST", "Approve, decline or mark it received.");
  const row = await db.returnRequest.findFirst({ where: { id: String(returnId), storeId: store.id, retailOrderId: String(id) }, select: { id: true } });
  if (!row) return apiError("NOT_FOUND", "We couldn't find this return.", 404);
  const result =
    parsed.data.action === "received" ? await markReturnReceived(store, row.id, user.id)
    : await decideReturn(store, row.id, parsed.data.action === "approve", parsed.data.reason ?? null);
  if (!result.ok) return apiError("CONFLICT", result.error, 409);
  return ok({ returns: await returnsForOrder(store.id, String(id)) });
});
