import { NextRequest } from "next/server";
import { creditsUrlFor } from "@shared/ai-credits";
import { withAuth } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { CreditError, startCreditCheckout } from "@/lib/ai/credits.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Buy a credit pack: { packId, autoTopUp, returnTo } → { authorizationUrl } (Paystack). With autoTopUp the card is
// saved and charged for the same pack whenever the credits can't cover a request.
export const POST = withAuth(async (req: NextRequest, { user }) => {
  const body = (await req.json().catch(() => ({}))) as { packId?: unknown; autoTopUp?: unknown; returnTo?: unknown };
  const returnTo = typeof body.returnTo === "string" && body.returnTo.startsWith("/") && !body.returnTo.startsWith("//") ? body.returnTo : creditsUrlFor(user.role);
  try {
    const session = await startCreditCheckout({
      user,
      packId: typeof body.packId === "string" ? body.packId : "",
      autoTopUp: body.autoTopUp === true,
      origin: req.nextUrl.origin,
      returnTo,
    });
    return ok(session);
  } catch (error) {
    if (error instanceof CreditError) return apiError("BAD_REQUEST", error.message);
    console.error("[credits] checkout failed", error);
    return apiError("UNAVAILABLE", error instanceof Error ? error.message : "Couldn't start the payment. Try again.", 503);
  }
});
