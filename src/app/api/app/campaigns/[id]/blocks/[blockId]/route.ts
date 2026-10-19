import { ok } from "@/lib/api/response";
import { campaignRoute, readCampaignBody } from "@/lib/store-campaigns/api";
import { UpdateBlockSchema } from "@/lib/store-campaigns/schemas";
import { deleteBlock, updateBlock } from "@/lib/store-campaigns/server";

// PATCH switches a campaign block on or off and saves its settings; DELETE removes it.

export const PATCH = campaignRoute(async ({ req, store, params }) => {
  const input = await readCampaignBody(req, UpdateBlockSchema);
  return ok({ campaign: await updateBlock(store, params.id, params.blockId, input), serverNow: new Date().toISOString() });
});

export const DELETE = campaignRoute(async ({ store, params }) => {
  return ok({ campaign: await deleteBlock(store, params.id, params.blockId), serverNow: new Date().toISOString() });
});
