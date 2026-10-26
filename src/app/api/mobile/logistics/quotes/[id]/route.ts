import { NextRequest } from "next/server";
import { z } from "zod";
import { withLogistics } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { replyToQuote } from "@/lib/logistics/quotes";
import { isOnboardingComplete } from "@/lib/role-queries";
import { partnerForUser } from "../../_shared";

export const dynamic = "force-dynamic";

// Answer one price request from the delivery partner app: POST { intent: "respond", price, note? } or
// { intent: "decline", note? }. The same rules as the web's /logistics/quotes form (src/lib/logistics/quotes.ts).

const Body = z.discriminatedUnion("intent", [
  z.object({ intent: z.literal("respond"), price: z.number().positive("Enter your price."), note: z.string().max(1000).optional() }),
  z.object({ intent: z.literal("decline"), note: z.string().max(1000).optional() }),
]);

export const POST = withLogistics(async (req: NextRequest, { user, params }) => {
  const partner = await partnerForUser(user.id);
  if (!partner) return apiError("NOT_FOUND", "Delivery partner profile not found", 404);
  if (!isOnboardingComplete(partner) || partner.verificationStatus !== "verified") {
    return apiError("VERIFICATION_REQUIRED", "You can answer price requests once your company is checked.", 403);
  }
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Check the price and try again.");
  const input = parsed.data;
  const result = await replyToQuote({
    partnerId: partner.id,
    quoteId: String(params.id),
    intent: input.intent === "decline" ? "reject" : "respond",
    quotedPrice: input.intent === "respond" ? input.price : undefined,
    partnerResponse: input.note,
  });
  if (!result.ok) return apiError(result.code, result.error, result.code === "NOT_FOUND" ? 404 : result.code === "CONFLICT" ? 409 : 400);
  return ok(result.quote);
});
