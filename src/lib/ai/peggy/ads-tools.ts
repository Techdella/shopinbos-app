import "server-only";

import { db } from "@/lib/db/client";
import { checkConfirmationCode, confirmationCode } from "@/lib/marketing/brand";
import { CampaignError, launchCampaign, saveCampaignDraft, writeAdCopy } from "@/lib/ad-campaigns/campaigns.server";
import { MetaAdsError, metaAdsStatus, setMetaCampaignActive, syncMetaCampaign } from "@/lib/ad-campaigns/meta.server";
import { createAdRequest } from "@/lib/ad-campaigns/requests.server";
import { naira } from "@shared/onboarding";
import { AD_REQUEST_STATUS_LABEL, AD_SETUP_FEES, campaignTotal, type AdCreative, type AdRequestStatus } from "@shared/ad-campaigns";
import type { PeggyToolInput } from "./pure";
import { findProduct, ToolError, type PeggyToolContext, type ToolOutput } from "./tools";

// Peggy runs ads: overview, draft campaigns (several products, Peggy's words), launch / pause / resume on the
// seller's own Meta ad account (spending needs the seller's yes), and requests for the Shopinbos ads team.

const ADS_HREF = "/home/ads";

async function findCampaign(ctx: PeggyToolContext, query: string) {
  const q = query.trim();
  const rows = await db.adCampaign.findMany({ where: { storeId: ctx.store.id, mode: { in: ["meta", "managed"] } }, orderBy: { createdAt: "desc" }, take: 60 });
  const exact = rows.find((row) => row.id === q) ?? rows.find((row) => (row.name ?? "").toLowerCase() === q.toLowerCase());
  if (exact) return exact;
  const partial = rows.filter((row) => (row.name ?? row.headline).toLowerCase().includes(q.toLowerCase()));
  if (partial.length === 1) return partial[0];
  if (partial.length > 1) throw new ToolError(`"${query}" matches ${partial.length} campaigns: ${partial.slice(0, 6).map((row) => `${row.name ?? row.headline} (id ${row.id})`).join("; ")}. Ask which one, or use the id.`);
  throw new ToolError(`No campaign matches "${query}". Use ads_overview to see them.`);
}

function money(amount: number, currency: string) {
  return currency === "NGN" ? naira(amount) : `${amount.toLocaleString()} ${currency}`;
}

async function overview(ctx: PeggyToolContext): Promise<ToolOutput> {
  const [meta, campaigns, requests] = await Promise.all([
    metaAdsStatus(ctx.store.id),
    db.adCampaign.findMany({ where: { storeId: ctx.store.id }, orderBy: { createdAt: "desc" }, take: 20, include: { orders: { select: { status: true, total: true } } } }),
    db.adServiceRequest.findMany({ where: { storeId: ctx.store.id }, orderBy: { createdAt: "desc" }, take: 10 }).catch(() => []),
  ]);
  const metaLine = !meta.configured
    ? "Meta ads from Shopinbos aren't switched on yet; the Shopinbos team can run Meta or TikTok ads (ads_request_help)."
    : meta.status === "connected"
      ? `Meta ads connected: ad account ${meta.accountName ?? meta.accountId}, Page ${meta.pageName ?? "?"}, currency ${meta.currency}.`
      : meta.status === "needs_account"
        ? "Meta ads signed in but no ad account and Page picked yet: the seller picks them at /home/ads."
        : "Meta ads not connected: the seller taps Connect Meta ads at /home/ads.";
  const lines = campaigns.map((row) => {
    const orders = row.orders.filter((order) => !["cancelled", "refunded", "returned"].includes(order.status)).length;
    const how = row.mode === "meta" ? "Facebook & Instagram (own ad account)" : row.mode === "managed" ? `${row.platform === "tiktok" ? "TikTok" : "Meta"}, run by the Shopinbos team` : `${row.platform}, boosted by hand`;
    return `- ${row.name ?? row.headline} (id ${row.id}): ${row.status}, ${how}, ${money(row.dailyBudget, row.currency)}/day for ${row.days} days; spent ${money(row.spend, row.currency)}, ${row.impressions} seen, ${row.clicks} taps, ${orders} orders${row.syncError ? `; Facebook said: ${row.syncError}` : ""}`;
  });
  const requestLines = requests.map((row) => `- ${row.platform === "tiktok" ? "TikTok" : "Meta"} request for ${row.businessName}: ${AD_REQUEST_STATUS_LABEL[row.status as AdRequestStatus] ?? row.status}`);
  return {
    content: [metaLine, lines.length ? `Campaigns:\n${lines.join("\n")}` : "No campaigns yet.", requestLines.length ? `Requests to the ads team:\n${requestLines.join("\n")}` : ""].filter(Boolean).join("\n\n"),
  };
}

async function createCampaign(ctx: PeggyToolContext, input: PeggyToolInput<"ads_create_campaign">): Promise<ToolOutput> {
  const products = [];
  for (const query of input.products) products.push(await findProduct(ctx, query));
  const unique = [...new Map(products.map((product) => [product.id, product])).values()];
  const withPhoto = unique.filter((product) => product.images?.[0]);
  if (!withPhoto.length) throw new ToolError("None of those products has a photo, and every ad needs a picture or video. Ask the seller to add photos first.");
  const objective = input.objective ?? "traffic";
  const mode = input.mode;
  const meta = mode === "meta" ? await metaAdsStatus(ctx.store.id) : null;
  const currency = meta?.status === "connected" ? meta.currency : "NGN";
  const copy = await writeAdCopy(ctx.store, withPhoto.map((product) => product.id), objective);
  const creatives: AdCreative[] = withPhoto.map((product) => {
    const words = copy.find((item) => item.productId === product.id);
    return { productId: product.id, kind: "image", mediaUrl: product.images[0], thumbUrl: null, videoProjectId: null, headline: words?.headline ?? product.name.slice(0, 80), primaryText: words?.primaryText ?? product.name, cta: objective === "whatsapp" ? "CONTACT_US" : "SHOP_NOW" };
  });
  if (input.video) {
    const videos = await db.videoProject.findMany({ where: { storeId: ctx.store.id, videoUrl: { not: null } }, orderBy: { updatedAt: "desc" }, take: 40 }).catch(() => []);
    const video = videos.find((row) => row.id === input.video) ?? videos.find((row) => row.title.toLowerCase().includes(input.video!.toLowerCase()));
    if (!video?.videoUrl) throw new ToolError(`No saved video matches "${input.video}". The seller saves videos in the video studio (/home/video).`);
    const first = creatives[0];
    creatives.unshift({ productId: video.productId && withPhoto.some((p) => p.id === video.productId) ? video.productId : first.productId, kind: "video", mediaUrl: video.videoUrl, thumbUrl: video.posterUrl, videoProjectId: video.id, headline: first.headline, primaryText: first.primaryText, cta: first.cta });
  }
  const dailyBudget = input.dailyBudget ?? (currency === "NGN" ? 5000 : 5);
  const days = input.days ?? 7;
  try {
    const saved = await saveCampaignDraft(ctx.store.id, {
      name: input.name ?? (withPhoto.length === 1 ? `${withPhoto[0].name} campaign` : `${withPhoto.length} products campaign`),
      mode,
      platform: mode === "managed" ? input.platform ?? "meta" : "meta",
      objective,
      productIds: withPhoto.map((product) => product.id),
      audience: { countries: ["NG"], states: input.states ?? [], ageMin: input.ageMin ?? 18, ageMax: Math.max(input.ageMin ?? 18, input.ageMax ?? 55), gender: input.gender ?? "all", interests: input.interests ?? [] },
      creatives,
      dailyBudget,
      currency,
      startAt: input.startDate ?? new Date().toISOString(),
      days,
    });
    const next =
      mode === "meta"
        ? meta?.status === "connected"
          ? "Launch it with ads_launch_campaign once the seller has checked it (that's when Meta starts charging)."
          : "Meta ads aren't connected yet: the seller connects at /home/ads, then it can be launched."
        : `The Shopinbos team runs it after the ${naira(AD_SETUP_FEES[input.platform ?? "meta"])} setup fee: use ads_request_help with this campaign.`;
    const summary = `Saved the draft campaign "${saved.name}": ${withPhoto.length} product${withPhoto.length === 1 ? "" : "s"}, ${creatives.length} ad${creatives.length === 1 ? "" : "s"}, ${money(dailyBudget, currency)}/day for ${days} days (up to ${money(campaignTotal(dailyBudget, days), currency)}). Nothing is spent yet.`;
    return { content: `${summary} Ads: ${creatives.map((c) => `"${c.headline}"`).join(", ")}. Campaign id: ${saved.id}. ${next}`, action: { summary, href: ADS_HREF } };
  } catch (error) {
    throw new ToolError(error instanceof CampaignError ? error.message : "The campaign couldn't be saved.");
  }
}

async function launch(ctx: PeggyToolContext, input: PeggyToolInput<"ads_launch_campaign">): Promise<ToolOutput> {
  const campaign = await findCampaign(ctx, input.campaign);
  if (campaign.mode !== "meta") throw new ToolError("That campaign is run by the Shopinbos team; use ads_request_help to send it to them.");
  if (campaign.status !== "draft") throw new ToolError(`That campaign is already ${campaign.status}.`);
  const meta = await metaAdsStatus(ctx.store.id);
  if (meta.status !== "connected") throw new ToolError("Meta ads aren't connected (or no ad account and Page is picked). The seller does that at /home/ads first.");
  const parts = [ctx.store.id, "ads-launch", campaign.id, String(campaign.dailyBudget), String(campaign.days)];
  if (!checkConfirmationCode(input.confirmCode, parts)) {
    return {
      content: `NOT LAUNCHED YET. Ask the seller to confirm: launch "${campaign.name}" on ad account ${meta.accountName ?? meta.accountId} at ${money(campaign.dailyBudget, campaign.currency)} a day for ${campaign.days} days (up to ${money(campaignTotal(campaign.dailyBudget, campaign.days), campaign.currency)}, charged by Meta to their card)? Confirmation code: ${confirmationCode(parts)}. Only call ads_launch_campaign again with this code after they clearly say yes.${input.confirmCode ? " (The code given was wrong or expired.)" : ""}`,
    };
  }
  try {
    await launchCampaign(ctx.store.id, campaign.id);
  } catch (error) {
    throw new ToolError(error instanceof CampaignError || error instanceof MetaAdsError ? error.message : "Facebook didn't accept the campaign.");
  }
  const summary = `Launched "${campaign.name}" on Facebook & Instagram: ${money(campaign.dailyBudget, campaign.currency)} a day for ${campaign.days} days.`;
  return { content: `${summary} Numbers show on /home/ads as Meta reports them.`, action: { summary, href: ADS_HREF } };
}

async function manage(ctx: PeggyToolContext, input: PeggyToolInput<"ads_manage_campaign">): Promise<ToolOutput> {
  const campaign = await findCampaign(ctx, input.campaign);
  if (campaign.mode !== "meta") throw new ToolError("Only campaigns on the seller's own Meta ad account are managed from here; the Shopinbos team handles theirs.");
  try {
    if (input.action === "sync") {
      const synced = (await syncMetaCampaign(campaign)) ?? campaign;
      return { content: `"${campaign.name}": ${synced.status}, spent ${money(synced.spend, synced.currency)}, ${synced.impressions} seen, ${synced.reach} reached.${synced.syncError ? ` Facebook said: ${synced.syncError}` : ""}` };
    }
    if (input.action === "resume") {
      const parts = [ctx.store.id, "ads-resume", campaign.id];
      if (!checkConfirmationCode(input.confirmCode, parts)) {
        return { content: `NOT RESUMED YET. Ask the seller: start "${campaign.name}" spending again at ${money(campaign.dailyBudget, campaign.currency)} a day? Confirmation code: ${confirmationCode(parts)}. Only call again with this code after they say yes.` };
      }
    }
    if (input.action === "end") await setMetaCampaignActive(campaign, false).then(() => db.adCampaign.update({ where: { id: campaign.id }, data: { status: "ended" } }));
    else await setMetaCampaignActive(campaign, input.action === "resume");
  } catch (error) {
    throw new ToolError(error instanceof MetaAdsError ? error.message : "That didn't work.");
  }
  const summary = `${input.action === "pause" ? "Paused" : input.action === "resume" ? "Resumed" : "Ended"} "${campaign.name}".`;
  return { content: summary, action: { summary, href: ADS_HREF } };
}

async function requestHelp(ctx: PeggyToolContext, input: PeggyToolInput<"ads_request_help">): Promise<ToolOutput> {
  const user = await db.user.findUnique({ where: { id: ctx.userId }, select: { name: true, email: true, phone: true } });
  const phone = user?.phone ?? ctx.userPhone;
  if (!phone) throw new ToolError("The team needs a phone number to call the seller. Ask for their WhatsApp number and add it to their profile first.");
  const campaign = input.campaign ? await findCampaign(ctx, input.campaign) : null;
  const fee = AD_SETUP_FEES[input.platform];
  try {
    const result = await createAdRequest({
      user: { id: ctx.userId, email: user?.email ?? null },
      storeId: ctx.store.id,
      returnTo: ADS_HREF,
      request: {
        platform: input.platform,
        campaignId: campaign?.id ?? null,
        contactName: user?.name?.trim() || ctx.store.name,
        contactPhone: phone,
        contactEmail: user?.email ?? null,
        businessName: ctx.store.name,
        handle: input.handle,
        pageUrl: input.pageUrl,
        website: null,
        adAccountId: null,
        dailyBudget: input.dailyBudget ?? campaign?.dailyBudget ?? 5000,
        days: input.days ?? campaign?.days ?? 7,
        goals: input.goals,
        audience: null,
        notes: input.notes,
      },
    });
    const summary = `Request for the Shopinbos team to run ${input.platform === "tiktok" ? "TikTok" : "Facebook & Instagram"} ads is ready. Pay the ${naira(fee)} setup fee to send it; the team calls within one working day.`;
    return { content: `${summary} The seller taps the card to pay with Paystack.`, action: { summary, href: result.authorizationUrl } };
  } catch (error) {
    throw new ToolError(error instanceof Error ? error.message : "Couldn't start the payment.");
  }
}

export const ADS_TOOL_RUNNERS = {
  ads_overview: overview,
  ads_create_campaign: createCampaign,
  ads_launch_campaign: launch,
  ads_manage_campaign: manage,
  ads_request_help: requestHelp,
};
