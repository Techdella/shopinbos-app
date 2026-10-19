import { NextRequest } from "next/server";
import { withSeller } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { startDeliveryFeePayment } from "@/lib/logistics/delivery-fee-payments.server";

// Starts the card payment of one booking's delivery fee, split straight to the delivery partner's bank
// (src/lib/logistics/delivery-fee-payments.server.ts). The app opens authorizationUrl, then calls ../../fee-confirm.
export const POST = withSeller(async (_req: NextRequest, { user, params }) => {
  const id = String(params.id ?? "").slice(0, 40);
  const started = await startDeliveryFeePayment({ id: user.id, email: user.email }, id);
  if (!started.ok) return apiError("NOT_STARTED", started.error, 409);
  return ok({ reference: started.reference, authorizationUrl: started.authorizationUrl });
});
