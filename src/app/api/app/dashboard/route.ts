import { withSeller } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { getSellerDashboard } from "@/lib/dashboard";
import { db } from "@/lib/db/client";
import { sellerCountdowns } from "@/lib/store-campaigns/server";
import { sortForWidget } from "@/lib/store-campaigns/status";

export const dynamic = "force-dynamic";

// Seller home dashboard for the mobile app (the web /home page calls getSellerDashboard directly). `campaigns` is the
// "Active & upcoming campaigns" list (up to 5 live or scheduled countdowns) with the server time for the timers.
export const GET = withSeller(async (_req, { user }) => {
  const dashboard = await getSellerDashboard(user.id);
  if (!dashboard) return apiError("NOT_FOUND", "Store not found", 404);
  const now = new Date();
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true, brandSettings: true } });
  const campaigns = store ? sortForWidget(await sellerCountdowns(store, now).catch(() => []), 5) : [];
  return ok({ ...dashboard, campaigns, serverNow: now.toISOString() });
});
