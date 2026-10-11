import { withSeller } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { getSellerDashboard } from "@/lib/dashboard";

export const dynamic = "force-dynamic";

// Seller home dashboard for the mobile app (the web /home page calls getSellerDashboard directly).
export const GET = withSeller(async (_req, { user }) => {
  const dashboard = await getSellerDashboard(user.id);
  if (!dashboard) return apiError("NOT_FOUND", "Store not found", 404);
  return ok(dashboard);
});
