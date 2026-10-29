import { NextRequest } from "next/server";
import { appPurchaseRefusal } from "@/lib/app-session.server";
import { withSeller } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { ThemePurchaseError, startThemeCheckout } from "@/lib/themes/purchase.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Buy one theme without changing plan: { themeId, returnTo } → { authorizationUrl } (Paystack). The seller comes
// back through ./callback to `returnTo` with ?theme=paid|pending|failed.
export const POST = withSeller(async (req: NextRequest, { user }) => {
  const refusal = appPurchaseRefusal(req);
  if (refusal) return refusal;
  const body = (await req.json().catch(() => ({}))) as { themeId?: unknown; returnTo?: unknown };
  const returnTo = typeof body.returnTo === "string" && body.returnTo.startsWith("/") && !body.returnTo.startsWith("//") ? body.returnTo : "/builder/templates";
  try {
    const session = await startThemeCheckout({ user, themeId: typeof body.themeId === "string" ? body.themeId : "", origin: req.nextUrl.origin, returnTo });
    return ok(session);
  } catch (error) {
    if (error instanceof ThemePurchaseError) return apiError("BAD_REQUEST", error.message);
    console.error("[themes] checkout failed", error);
    return apiError("UNAVAILABLE", "Couldn't start the payment. Try again.", 503);
  }
});
