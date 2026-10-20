import { NextRequest } from "next/server";
import { z } from "zod";
import { withSeller } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { confirmWholesalePayment } from "@/lib/supplier-orders/wholesale-payments.server";

export const dynamic = "force-dynamic";

// POST /api/app/wholesale/pay-confirm { reference }: after the card payment (the app's browser closed), ask Paystack
// and mark the wholesale order paid (src/lib/supplier-orders/wholesale-payments.server.ts). The webhook does the same.
const Body = z.object({ reference: z.string().min(6).max(60) });

export const POST = withSeller(async (req: NextRequest, { user }) => {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("BAD_REQUEST", "Missing the payment reference.");
  const result = await confirmWholesalePayment(parsed.data.reference, user.id);
  if (!result.ok) return apiError(result.retry ? "RETRY" : "NOT_PAID", result.error, result.retry ? 503 : 409);
  return ok({ paid: true, orderId: result.orderId });
});
