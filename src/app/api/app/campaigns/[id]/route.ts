import { ok } from "@/lib/api/response";
import { campaignRoute, readCampaignBody } from "@/lib/store-campaigns/api";
import { UpdateCampaignSchema } from "@/lib/store-campaigns/schemas";
import { campaignDetail, deleteCampaign, updateCampaign } from "@/lib/store-campaigns/server";

// One seasonal campaign: GET with its look changes, blocks and warnings; PATCH the schedule, name, priority, linked
// discount, look and section changes (a live campaign changes on the store straight away); DELETE a draft, ended or
// archived one.

export const GET = campaignRoute(async ({ store, params }) => {
  return ok({ campaign: await campaignDetail(store, params.id), serverNow: new Date().toISOString() });
});

export const PATCH = campaignRoute(async ({ req, store, params }) => {
  const patch = await readCampaignBody(req, UpdateCampaignSchema);
  return ok({ campaign: await updateCampaign(store, params.id, patch), serverNow: new Date().toISOString() });
});

export const DELETE = campaignRoute(async ({ store, params }) => {
  await deleteCampaign(store, params.id);
  return ok({ deleted: true });
});
