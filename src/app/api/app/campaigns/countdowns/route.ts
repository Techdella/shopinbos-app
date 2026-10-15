import { ok } from "@/lib/api/response";
import { campaignRoute } from "@/lib/store-campaigns/api";
import { sellerCountdowns } from "@/lib/store-campaigns/server";
import { sortForWidget } from "@/lib/store-campaigns/status";

// The dashboard's "Active & upcoming campaigns": up to 5 live or scheduled countdowns (campaigns, countdown pop-ups
// and countdown sections), live first, with the server time for the timers.

export const GET = campaignRoute(async ({ store }) => {
  const now = new Date();
  const items = sortForWidget(await sellerCountdowns(store, now), 5);
  return ok({ items, serverNow: now.toISOString() });
});
