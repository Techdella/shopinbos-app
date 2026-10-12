import { NextRequest } from "next/server";
import { z } from "zod";
import { withSeller } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { cancelWholesaleOrder } from "@/lib/supplier-orders/wholesale.server";

export const dynamic = "force-dynamic";

// The seller's own wholesale order. PATCH { action: "cancel", reason? } cancels it while the supplier hasn't
// started packing (pending or confirmed); the stock it reserved goes back to the supplier.

const Body = z.object({
  action: z.literal("cancel"),
  reason: z.string().trim().max(500).optional(),
});

export const PATCH = withSeller(async (req: NextRequest, { user, params }) => {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("BAD_REQUEST", "Say what to do with this order.");
  const result = await cancelWholesaleOrder({ sellerId: user.id, orderId: String(params.id), reason: parsed.data.reason });
  if (!result.ok) return apiError(result.code, result.message);
  return ok(result.data);
});
