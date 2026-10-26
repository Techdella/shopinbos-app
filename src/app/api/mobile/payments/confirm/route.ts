import { NextRequest } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { confirmAppPayment, isAppPaymentReference } from "@/lib/payments/app-return.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/mobile/payments/confirm { reference } → { outcome: "paid" | "pending" | "cancelled", paid, message? }
// After the phone's Paystack page closes (src/lib/payments/app-return.server.ts): asks Paystack and applies the
// payment once, for every kind the app pays (a seller's cash, a delivery fee, a wholesale order, money owed, prints,
// an ads setup fee). The payment must be the signed-in person's. The webhook and the return page do the same.

const Body = z.object({ reference: z.string().trim().min(6).max(80) });

export const POST = withAuth(
  async (req: NextRequest, { user }) => {
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success || !isAppPaymentReference(parsed.data.reference)) return apiError("VALIDATION_ERROR", "Missing the payment reference.", 400);
    const result = await confirmAppPayment(parsed.data.reference, user.id);
    return ok({ ...result, paid: result.outcome === "paid" });
  },
  ["seller", "supplier", "logistics_partner"],
);
