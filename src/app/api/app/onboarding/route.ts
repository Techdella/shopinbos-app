import { withSeller } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { getSellerOnboardingStatus } from "@/lib/onboarding-status";

export const dynamic = "force-dynamic";

export const GET = withSeller(async (_req, { user }) => {
  const status = await getSellerOnboardingStatus(user.id);
  if (!status) return apiError("NOT_FOUND", "Store not found", 404);
  return ok(status);
});
