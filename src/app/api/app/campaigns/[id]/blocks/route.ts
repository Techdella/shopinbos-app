import { created } from "@/lib/api/response";
import { campaignRoute, readCampaignBody } from "@/lib/store-campaigns/api";
import { CreateBlockSchema } from "@/lib/store-campaigns/schemas";
import { addBlock } from "@/lib/store-campaigns/server";

// Adds a store-wide block to a campaign: announcement bar, pop-up (a store pop-up made for the campaign, or an
// existing one: { settings: { formId } }), product badge or countdown.

export const POST = campaignRoute(async ({ req, store, params, t }) => {
  const input = await readCampaignBody(req, CreateBlockSchema);
  return created({ campaign: await addBlock(store, params.id, input, t), serverNow: new Date().toISOString() });
});
