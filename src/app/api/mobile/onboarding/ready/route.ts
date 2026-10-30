import { withSeller } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { shopReadyFor } from "@/lib/onboarding/rex-build.server";

export const dynamic = "force-dynamic";

// GET /api/mobile/onboarding/ready → { rows, open, done, total, percent, complete, facts }
// Home's "Get your shop ready" (spec F4, shared/seller-onboarding.ts shopReadyChecklist): bank account, delivery
// partner, pay on delivery, share, first post, more products (under four), WhatsApp or Instagram, and the optional
// domain, each worked out from the shop's real state. Done items drop off the list.
export const GET = withSeller(async (_req, { user }) => {
  const ready = await shopReadyFor(user.id);
  if (!ready) return apiError("NOT_FOUND", "Store not found", 404);
  return ok(ready);
});
