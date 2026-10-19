import { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, ok } from "@/lib/api/response";
import { checkRateLimitShared, rateLimitKey } from "@/lib/rate-limit";
import { nairaToKobo } from "@/lib/money-owed/rules";
import { confirmDebtPayment, creditorCancels, creditorConfirmsPaid, raiseClaim, respondToClaim, startDebtPayment } from "@/lib/money-owed/money-owed.server";
import { withWalletOwner } from "../_shared";

export const dynamic = "force-dynamic";

// Money owed between businesses in the phone app (the same as the web wallet's Money owed, src/lib/money-owed).
// The list comes with GET /api/mobile/wallet (view.owed); this does the actions, one POST each:
//   { action: "pay", debtId }                 → { reference, authorizationUrl }: Paystack, split to their bank
//   { action: "pay-confirm", reference }      → { paid, message? }: after the Paystack page closes
//   { action: "respond", debtId, accept, response? }  accept a claim, or dispute it for the team to decide
//   { action: "confirm-paid", debtId }        the business owed was paid another way
//   { action: "cancel", debtId }              the business owed withdraws the claim or lets the rest go
//   { action: "claim", target, targetId, reason, amount, details }   sellers: claim from a supplier or partner
const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("pay"), debtId: z.string().min(1).max(40) }),
  z.object({ action: z.literal("pay-confirm"), reference: z.string().min(1).max(60) }),
  z.object({ action: z.literal("respond"), debtId: z.string().min(1).max(40), accept: z.boolean(), response: z.string().max(2000).optional() }),
  z.object({ action: z.literal("confirm-paid"), debtId: z.string().min(1).max(40) }),
  z.object({ action: z.literal("cancel"), debtId: z.string().min(1).max(40) }),
  z.object({ action: z.literal("claim"), target: z.enum(["supplier_order", "wholesale_order", "booking"]), targetId: z.string().min(1).max(40), reason: z.string().max(40), amount: z.string().max(20), details: z.string().max(2000) }),
]);

export const POST = withWalletOwner(async (req: NextRequest, { user }) => {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", "Fill in every part first.", 400);
  const body = parsed.data;
  if (body.action === "pay") {
    const started = await startDebtPayment({ id: user.id, email: user.email ?? null }, body.debtId);
    return started.ok ? ok({ reference: started.reference, authorizationUrl: started.authorizationUrl }) : apiError("NOT_STARTED", started.error, 409);
  }
  if (body.action === "pay-confirm") {
    const result = await confirmDebtPayment(body.reference, user.id);
    return ok(result.ok ? { paid: true } : { paid: false, message: result.error });
  }
  if (body.action === "claim") {
    if (user.role !== "seller") return apiError("FORBIDDEN", "Only the shop on the order can claim.", 403);
    if (!(await checkRateLimitShared(rateLimitKey("money-owed-claim", user.id), { maxRequests: 10, windowMs: 60 * 60_000 })).allowed) return apiError("RATE_LIMITED", "Too many claims at once. Try again later.", 429);
    const result = await raiseClaim(user, { target: body.target, targetId: body.targetId, reason: body.reason, amountKobo: nairaToKobo(body.amount), details: body.details });
    return result.ok ? ok(result) : apiError("NOT_SAVED", result.error, 409);
  }
  const result =
    body.action === "respond" ? await respondToClaim(user, body.debtId, body.accept, body.response ?? "")
    : body.action === "confirm-paid" ? await creditorConfirmsPaid(user, body.debtId)
    : await creditorCancels(user, body.debtId);
  return result.ok ? ok(result) : apiError("NOT_SAVED", result.error, 409);
});
