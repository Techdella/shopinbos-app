import "server-only";

import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { firstJsonObject, generateText } from "@/lib/ai/text";
import { isOwnImageUrl } from "@/lib/ai/images";
import { naira } from "@shared/onboarding";
import { adCode } from "@shared/ads";
import { AD_OBJECTIVE_INFO, campaignWindow, type AdObjective, type CampaignInput } from "@shared/ad-campaigns";
import { getPriceBook } from "@/lib/pricing/price-book.server";
import { launchMetaCampaign, MetaAdsError, metaAdsStatus } from "./meta.server";

// Ad campaigns for /home/ads/new and Peggy: save a draft (several products, audience, ads), write the ad words,
// and launch through Meta. Managed campaigns are launched by the Shopinbos team (requests.server.ts).

export class CampaignError extends Error {}

async function storeProducts(storeId: string, ids: string[]) {
  const rows = await db.storeProduct.findMany({ where: { storeId, id: { in: ids } }, select: { id: true, name: true, retailPrice: true, images: true, description: true } });
  return new Map(rows.map((row) => [row.id, row]));
}

/** Saves a campaign as a draft (new, or replacing an unlaunched draft's details). */
export async function saveCampaignDraft(storeId: string, input: CampaignInput, existingId?: string | null) {
  // The naira minimum is set in Admin › Pricing (the input schema only checks the lowest it can be).
  const minNgn = (await getPriceBook())["ads.min_daily_budget"];
  if (input.currency === "NGN" && input.dailyBudget < minNgn) throw new CampaignError(`The smallest daily budget is ${naira(minNgn)}.`);
  const products = await storeProducts(storeId, input.productIds);
  const productIds = input.productIds.filter((id) => products.has(id));
  if (!productIds.length) throw new CampaignError("Those products aren't in your store.");
  const productImages = new Set([...products.values()].flatMap((product) => product.images));
  for (const creative of input.creatives) {
    if (!isOwnImageUrl(creative.mediaUrl) && !productImages.has(creative.mediaUrl)) throw new CampaignError("Use pictures and videos saved in your shop for the ads.");
    if (creative.productId && !products.has(creative.productId)) throw new CampaignError("An ad points at a product that isn't in this campaign.");
  }
  const { start, end } = campaignWindow(input.startAt, input.days);
  const first = input.creatives[0];
  const data = {
    name: input.name,
    mode: input.mode,
    platform: input.mode === "meta" ? "meta" : input.platform,
    objective: input.objective,
    destination: input.objective === "whatsapp" ? "whatsapp" : "store",
    productIds,
    storeProductId: productIds[0],
    audience: input.audience as unknown as Prisma.InputJsonValue,
    creatives: input.creatives as unknown as Prisma.InputJsonValue,
    headline: first.headline,
    primaryText: first.primaryText,
    imageUrl: first.kind === "image" ? first.mediaUrl : first.thumbUrl ?? null,
    dailyBudget: input.dailyBudget,
    currency: input.currency,
    days: input.days,
    startAt: start,
    endAt: end,
  };
  if (existingId) {
    const existing = await db.adCampaign.findFirst({ where: { id: existingId, storeId }, select: { id: true, status: true, external: true } });
    if (!existing) throw new CampaignError("That campaign isn't here any more.");
    if (existing.status !== "draft" || existing.external) throw new CampaignError("This campaign has already started; change it on the platform or start a new one.");
    return db.adCampaign.update({ where: { id: existing.id }, data });
  }
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = adCode();
    if (await db.adCampaign.findUnique({ where: { code }, select: { id: true } })) continue;
    return db.adCampaign.create({ data: { ...data, storeId, code } });
  }
  throw new CampaignError("Couldn't save the campaign. Try again.");
}

/** Peggy writes a headline and ad text for each product (falls back to plain lines when AI is off). */
export async function writeAdCopy(store: { id: string; name: string }, productIds: string[], objective: AdObjective) {
  const products = await storeProducts(store.id, productIds);
  const out: Array<{ productId: string; headline: string; primaryText: string }> = [];
  for (const id of productIds) {
    const product = products.get(id);
    if (!product) continue;
    const price = naira(product.retailPrice);
    const fallback = {
      headline: `${product.name} · ${price}`.slice(0, 80),
      primaryText: objective === "whatsapp" ? `${product.name} is here for ${price}. Send us a WhatsApp message to order and we'll deliver to you.` : `${product.name}, now ${price}. Tap Shop now to order from ${store.name}; we deliver to your door.`,
    };
    const raw = await generateText(
      [
        `Write a Facebook and Instagram ad for ${store.name}, a Nigerian online shop. Goal: ${AD_OBJECTIVE_INFO[objective].hint}`,
        `Product: ${product.name}, ${price}.${product.description ? ` Details: ${product.description.slice(0, 400)}` : ""}`,
        'Return JSON only: {"headline": "max 7 words", "primaryText": "2-3 short sentences, under 45 words, warm Nigerian English, mention the price once, end with what to tap"}.',
        "No emojis, no hashtags, no claims that aren't in the details.",
      ].join("\n"),
    ).catch(() => null);
    const copy = firstJsonObject(raw);
    out.push({
      productId: id,
      headline: typeof copy?.headline === "string" && copy.headline.trim() ? copy.headline.trim().slice(0, 80) : fallback.headline,
      primaryText: typeof copy?.primaryText === "string" && copy.primaryText.trim() ? copy.primaryText.trim().slice(0, 500) : fallback.primaryText,
    });
  }
  return out;
}

/** Launches a Meta campaign in the seller's own ad account. */
export async function launchCampaign(storeId: string, id: string) {
  const campaign = await db.adCampaign.findFirst({ where: { id, storeId } });
  if (!campaign) throw new CampaignError("That campaign isn't here any more.");
  if (campaign.mode !== "meta") throw new CampaignError("Only Facebook & Instagram campaigns on your own ad account launch from here.");
  if (campaign.external && (campaign.external as { campaignId?: string }).campaignId && campaign.status !== "draft") throw new CampaignError("This campaign is already on Facebook.");
  const meta = await metaAdsStatus(storeId);
  if (meta.status !== "connected") throw new CampaignError(meta.status === "needs_account" ? "Pick your ad account and Facebook Page first." : "Connect your Meta ad account first.");
  const products = await storeProducts(storeId, campaign.productIds);
  try {
    await launchMetaCampaign(campaign, new Map([...products.values()].map((product) => [product.id, { name: product.name, price: naira(product.retailPrice) }])));
  } catch (error) {
    throw new CampaignError(error instanceof MetaAdsError ? `Facebook said: ${error.message}` : "Facebook didn't accept the campaign. Try again.");
  }
  return db.adCampaign.findUnique({ where: { id: campaign.id } });
}
