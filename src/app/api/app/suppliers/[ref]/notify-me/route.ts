import { withSeller } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { checkRateLimitShared, rateLimitKey } from "@/lib/rate-limit";
import { ProductRequestError, askForProducts, stopAsking } from "@/lib/suppliers/product-requests.server";

export const dynamic = "force-dynamic";

// "Notify me when they add products" for one supplier ([ref] is its slug or id), on the web and in the phone app.
// POST   → follows them and tells the supplier this shop is waiting (in the app, email, WhatsApp); { waiting }
// DELETE → stop (unfollow)

function failed(error: unknown) {
  if (error instanceof ProductRequestError) return apiError(error.status === 404 ? "NOT_FOUND" : "BAD_REQUEST", error.message, error.status);
  console.error("[notify-me]", error);
  return apiError("INTERNAL_ERROR", "Something went wrong. Try again.", 500);
}

export const POST = withSeller(async (_req, { user, params }) => {
  const burst = await checkRateLimitShared(rateLimitKey("supplier-notify-me", user.id), { maxRequests: 20, windowMs: 60 * 60_000 });
  if (!burst.allowed) return apiError("RATE_LIMITED", "That's a lot of suppliers at once. Try again later.", 429);
  try {
    const { waiting } = await askForProducts(user.id, String(params.ref));
    return ok({ following: true, waiting });
  } catch (error) {
    return failed(error);
  }
});

export const DELETE = withSeller(async (_req, { user, params }) => {
  try {
    await stopAsking(user.id, String(params.ref));
    return ok({ following: false });
  } catch (error) {
    return failed(error);
  }
});
