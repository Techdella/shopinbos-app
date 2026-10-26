import { NextRequest } from "next/server";
import { z } from "zod";
import { withLogistics } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { confirmSellerPayIn } from "@/lib/logistics/seller-payins.server";
import { partnerForUser } from "../../_shared";

const Body = z.object({ reference: z.string().min(1).max(60) });

// After the Paystack page closes: asks Paystack whether the pay-in went through and settles the cash jobs (once).
export const POST = withLogistics(async (req: NextRequest, { user }) => {
  const partner = await partnerForUser(user.id);
  if (!partner) return apiError("NOT_FOUND", "Delivery partner profile not found", 404);
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", "Missing the payment reference.", 400);
  const result = await confirmSellerPayIn(parsed.data.reference, partner.id);
  return ok(result.ok ? { paid: true, settled: result.settled } : { paid: false, pending: Boolean(result.retry || result.pending), message: result.error });
});
