import { NextRequest } from "next/server";
import { z } from "zod";
import { withSeller } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { confirmDeliveryFeePayment } from "@/lib/logistics/delivery-fee-payments.server";

const Body = z.object({ reference: z.string().min(1).max(60) });

// After the Paystack page closes: asks Paystack whether the delivery fee was paid and marks the booking (once).
export const POST = withSeller(async (req: NextRequest, { user }) => {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", "Missing the payment reference.", 400);
  const result = await confirmDeliveryFeePayment(parsed.data.reference, user.id);
  return ok(result.ok ? { paid: true } : { paid: false, message: result.error });
});
