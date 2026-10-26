import { NextRequest } from "next/server";
import { z } from "zod";
import { withSeller } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { cancelWholesaleOrder } from "@/lib/supplier-orders/wholesale.server";
import { startWholesalePayment } from "@/lib/supplier-orders/wholesale-payments.server";
import { appCallbackUrl } from "@/lib/payments/app-return.server";

export const dynamic = "force-dynamic";

// The seller's own wholesale order. PATCH { action: "cancel", reason? } cancels it while the supplier hasn't
// started packing (pending or confirmed); the stock it reserved goes back to the supplier.
// PATCH { action: "pay" } starts the card payment once the supplier accepted it (split straight to the supplier's
// bank, src/lib/supplier-orders/wholesale-payments.server.ts): open authorizationUrl, then POST ../pay-confirm.
// The phone app adds `app` (its return address): Paystack then comes back through /api/mobile/paid.

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("cancel"), reason: z.string().trim().max(500).optional() }),
  z.object({ action: z.literal("pay"), app: z.string().max(300).optional() }),
]);

export const PATCH = withSeller(async (req: NextRequest, { user, params }) => {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("BAD_REQUEST", "Say what to do with this order.");
  if (parsed.data.action === "pay") {
    const started = await startWholesalePayment({ id: user.id, email: user.email }, String(params.id).slice(0, 40), { callbackUrl: appCallbackUrl(parsed.data.app) });
    if (!started.ok) return apiError("NOT_STARTED", started.error, 409);
    return ok({ reference: started.reference, authorizationUrl: started.authorizationUrl, accessCode: started.accessCode });
  }
  const result = await cancelWholesaleOrder({ sellerId: user.id, orderId: String(params.id), reason: parsed.data.reason });
  if (!result.ok) return apiError(result.code, result.message);
  return ok(result.data);
});
