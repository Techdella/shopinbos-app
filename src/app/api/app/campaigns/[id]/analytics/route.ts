import { ok } from "@/lib/api/response";
import { campaignRoute } from "@/lib/store-campaigns/api";
import { campaignAnalytics } from "@/lib/store-campaigns/server";

// The campaign report: visits, bar clicks, pop-up shown/closed/converted, emails, orders and sales in the campaign
// window, orders that used the linked discount, and the same-length period before it.

export const GET = campaignRoute(async ({ store, params }) => {
  return ok({ analytics: await campaignAnalytics(store, params.id), serverNow: new Date().toISOString() });
});
