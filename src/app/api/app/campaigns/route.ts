import { created, ok } from "@/lib/api/response";
import { campaignRoute, readCampaignBody } from "@/lib/store-campaigns/api";
import { CreateCampaignSchema } from "@/lib/store-campaigns/schemas";
import { createCampaign, listCampaigns } from "@/lib/store-campaigns/server";
import { CAMPAIGN_TABS, inCampaignTab, type CampaignTab } from "@/lib/store-campaigns/status";

// Seasonal campaigns (Marketing > Seasonal campaigns). GET lists the store's campaigns with their status worked out
// from the dates (?status=all|live|scheduled|drafts|ended|archived) and the server time for live timers; POST makes
// a blank campaign or one from a preset ({ preset: "black_friday" }).

export const GET = campaignRoute(async ({ req, store }) => {
  const now = new Date();
  const wanted = req.nextUrl.searchParams.get("status");
  const tab: CampaignTab = (CAMPAIGN_TABS as readonly string[]).includes(wanted ?? "") ? (wanted as CampaignTab) : "all";
  const campaigns = (await listCampaigns(store.id, now)).filter((campaign) => inCampaignTab(campaign, tab, now.getTime()));
  return ok({ campaigns, serverNow: now.toISOString() });
});

export const POST = campaignRoute(async ({ req, store, t }) => {
  const input = await readCampaignBody(req, CreateCampaignSchema);
  const campaign = await createCampaign(store, input, t);
  return created({ campaign, serverNow: new Date().toISOString() });
});
