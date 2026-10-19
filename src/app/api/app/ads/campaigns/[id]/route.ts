import { NextRequest } from "next/server";
import { z } from "zod";
import { withSeller } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { db } from "@/lib/db/client";
import { CampaignError, launchCampaign } from "@/lib/ad-campaigns/campaigns.server";
import { MetaAdsError, setMetaCampaignActive, syncMetaCampaign } from "@/lib/ad-campaigns/meta.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const ActionSchema = z.object({ action: z.enum(["launch", "pause", "resume", "sync", "end"]) });

// One campaign: POST { action } launches it on Meta, pauses or resumes it, pulls its numbers, or ends it.
export const POST = withSeller(async (req: NextRequest, { user, params }) => {
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true } });
  if (!store) return apiError("NOT_FOUND", "Set up your store first.", 404);
  const { id } = await params;
  const campaign = await db.adCampaign.findFirst({ where: { id, storeId: store.id } });
  if (!campaign) return apiError("NOT_FOUND", "That campaign isn't here any more.", 404);
  const parsed = ActionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("BAD_REQUEST", "Say what to do with the campaign.");
  try {
    switch (parsed.data.action) {
      case "launch":
        return ok(await launchCampaign(store.id, campaign.id));
      case "sync":
        return ok((await syncMetaCampaign(campaign)) ?? campaign);
      case "pause":
      case "resume":
        if (campaign.mode === "meta") await setMetaCampaignActive(campaign, parsed.data.action === "resume");
        else await db.adCampaign.update({ where: { id: campaign.id }, data: parsed.data.action === "pause" ? { status: "paused", pausedAt: new Date() } : { status: "running", startedAt: campaign.startedAt ?? new Date() } });
        return ok(await db.adCampaign.findUnique({ where: { id: campaign.id } }));
      case "end":
        if (campaign.mode === "meta" && campaign.status === "running") await setMetaCampaignActive(campaign, false);
        return ok(await db.adCampaign.update({ where: { id: campaign.id }, data: { status: "ended" } }));
    }
  } catch (error) {
    const message = error instanceof CampaignError || error instanceof MetaAdsError ? error.message : "That didn't work. Try again.";
    return apiError("BAD_REQUEST", message);
  }
});

export const DELETE = withSeller(async (_req: NextRequest, { user, params }) => {
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true } });
  if (!store) return apiError("NOT_FOUND", "Set up your store first.", 404);
  const { id } = await params;
  const campaign = await db.adCampaign.findFirst({ where: { id, storeId: store.id }, select: { id: true, status: true, mode: true } });
  if (!campaign) return apiError("NOT_FOUND", "That campaign isn't here any more.", 404);
  if (campaign.mode === "meta" && campaign.status === "running") return apiError("BAD_REQUEST", "End the campaign first, so it stops spending on Facebook.");
  await db.adCampaign.delete({ where: { id: campaign.id } });
  return ok({ id: campaign.id });
});
