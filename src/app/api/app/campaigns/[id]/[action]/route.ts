import { ok } from "@/lib/api/response";
import { apiError } from "@/lib/api/response";
import { campaignRoute } from "@/lib/store-campaigns/api";
import { campaignAction, campaignPreviewLink, duplicateCampaign, type CampaignAction } from "@/lib/store-campaigns/server";

// Lifecycle actions: POST /api/app/campaigns/:id/pause | resume | end-now | archive | unarchive | duplicate, and
// preview-token (a signed link that shows the store as if the campaign were live, for 7 days; body { at? } to
// preview a moment in time).

const ACTIONS: CampaignAction[] = ["pause", "resume", "end-now", "archive", "unarchive"];

export const POST = campaignRoute(async ({ req, store, params, t }) => {
  const action = params.action;
  if (action === "duplicate") return ok({ campaign: await duplicateCampaign(store, params.id, t), serverNow: new Date().toISOString() });
  if (action === "preview-token") {
    const body = (await req.json().catch(() => null)) as { at?: unknown } | null;
    return ok(await campaignPreviewLink(store, params.id, typeof body?.at === "string" ? body.at : null));
  }
  if (!ACTIONS.includes(action as CampaignAction)) return apiError("NOT_FOUND", "Unknown action", 404);
  return ok({ campaign: await campaignAction(store, params.id, action as CampaignAction), serverNow: new Date().toISOString() });
});
