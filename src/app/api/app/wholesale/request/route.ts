import { NextRequest } from "next/server";
import { withSeller } from "@/lib/auth/middleware";
import { ok, apiError } from "@/lib/api/response";
import { WholesaleOrderCreateSchema } from "@/lib/schemas";
import type { AuthUser } from "@/lib/auth/types";
import { WHOLESALE_PAYMENT_NOTE, placeWholesaleOrder } from "@/lib/supplier-orders/wholesale.server";

// A seller places a wholesale order with a supplier: at least the minimum order, priced at the supplier's tier
// for that quantity. No payment is taken here: the supplier confirms first, then the seller pays in Shopinbos by
// card (PATCH ../[id] { action: "pay" }) or directly against the invoice (`payment` in the response says so). The
// supplier sees it in /supplier/orders. `sample: true` orders one piece at the dropship price to try it (one per
// product, shared/samples.ts): no minimum order, labelled "Sample" for the supplier, paid the same way.

export const POST = withSeller(async (req: NextRequest, { user }: { user: AuthUser }) => {
  const body = await req.json().catch(() => null);
  const parsed = WholesaleOrderCreateSchema.safeParse(body);

  if (!parsed.success) {
    return apiError("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Invalid input");
  }

  const { supplierId, supplierProductId, quantity, deliveryAddress, notes, sample } = parsed.data;
  const result = await placeWholesaleOrder({ sellerId: user.id, supplierId, supplierProductId, quantity: sample ? 1 : quantity, deliveryAddress, notes, sample });
  if (!result.ok) return apiError(result.code, result.message);

  return ok({ ...result.data, payment: { method: "invoice", note: WHOLESALE_PAYMENT_NOTE } }, 201);
});
