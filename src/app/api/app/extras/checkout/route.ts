import { NextRequest } from "next/server";
import { appPurchaseRefusal } from "@/lib/app-session.server";
import { withAuth } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { ExtraError, startExtraCheckout } from "@/lib/plans/extras.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Buy an add-on or boost (shared/plan-extras.ts): { kind, quantity, target?, returnTo } → { authorizationUrl }.
export const POST = withAuth(async (req: NextRequest, { user }) => {
  const refusal = appPurchaseRefusal(req);
  if (refusal) return refusal;
  if (user.staff) return apiError("FORBIDDEN", "Only the store owner can buy add-ons.", 403);
  const body = (await req.json().catch(() => ({}))) as { kind?: unknown; quantity?: unknown; target?: unknown; returnTo?: unknown };
  const returnTo = typeof body.returnTo === "string" && body.returnTo.startsWith("/") && !body.returnTo.startsWith("//") ? body.returnTo : "/";
  try {
    return ok(await startExtraCheckout({ user, kind: body.kind, quantity: body.quantity, target: body.target, origin: req.nextUrl.origin, returnTo }));
  } catch (error) {
    if (error instanceof ExtraError) return apiError("BAD_REQUEST", error.message);
    console.error("[extras] checkout failed", error);
    return apiError("UNAVAILABLE", "Couldn't start the payment. Try again.", 503);
  }
});
