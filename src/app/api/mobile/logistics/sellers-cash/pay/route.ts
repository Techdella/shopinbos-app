import { NextRequest } from "next/server";
import { z } from "zod";
import { withLogistics } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { startSellerPayIn } from "@/lib/logistics/seller-payins.server";
import { partnerForUser } from "../../_shared";

const Body = z.object({ sellerId: z.string().min(1).max(40) });

// Starts the Paystack payment of one seller's cash (split to that seller's bank). The app opens authorizationUrl,
// then calls ../confirm with the reference; Paystack's webhook confirms it too.
export const POST = withLogistics(async (req: NextRequest, { user }) => {
  const partner = await partnerForUser(user.id);
  if (!partner) return apiError("NOT_FOUND", "Delivery partner profile not found", 404);
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", "Choose the seller.", 400);
  const started = await startSellerPayIn({ id: partner.id, email: user.email }, parsed.data.sellerId);
  if (!started.ok) return apiError("NOT_STARTED", started.error, 409);
  return ok({ reference: started.reference, authorizationUrl: started.authorizationUrl });
});
