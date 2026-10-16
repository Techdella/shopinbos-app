import { withSeller } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { db } from "@/lib/db/client";
import { getSellerAds, sellerWhatsapp } from "@/lib/ads";
import { metaAdsStatus, syncMetaCampaign } from "@/lib/ad-campaigns/meta.server";
import { buildStorefrontUrl } from "@/lib/domains/storefront";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

// Ads for the mobile app (the web's /home/ads and /home/ads/new read these on the server): the campaigns with
// their numbers, the "boost it yourself" ads, the requests to the Shopinbos ads team, the Meta connection, the
// products that can be advertised and the seller's details for a team request. Campaign actions, drafts, Peggy's
// words and team requests use the same /api/app/ads/* routes as the web.
export const GET = withSeller(async (_req, { user }) => {
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true, name: true, slug: true, customDomain: true } });
  if (!store) return apiError("NOT_FOUND", "Set up your store first.", 404);

  // Like the web page: running Meta campaigns pull fresh numbers when they're more than 15 minutes old.
  const stale = await db.adCampaign
    .findMany({ where: { storeId: store.id, mode: "meta", status: { in: ["running", "paused"] }, OR: [{ lastSyncAt: null }, { lastSyncAt: { lt: new Date(Date.now() - 15 * 60_000) } }] }, take: 5 })
    .catch(() => []);
  await Promise.all(stale.map((campaign) => syncMetaCampaign(campaign).catch(() => null)));

  const me = await db.user.findUnique({ where: { id: user.id }, select: { name: true, phone: true, email: true } });
  const [ads, meta, requests, products, whatsapp] = await Promise.all([
    getSellerAds(store.id),
    metaAdsStatus(store.id),
    db.adServiceRequest.findMany({ where: { storeId: store.id }, orderBy: { createdAt: "desc" }, take: 20 }).catch(() => []),
    db.storeProduct.findMany({
      where: { storeId: store.id, status: "published", NOT: { images: { isEmpty: true } } },
      orderBy: [{ soldStock: "desc" }, { createdAt: "desc" }],
      take: 200,
      select: { id: true, name: true, retailPrice: true, images: true },
    }),
    sellerWhatsapp(store.id, me?.phone ?? null),
  ]);

  const campaigns = ads.filter((ad) => ad.mode !== "manual").map((ad) => {
    const creatives = Array.isArray(ad.creatives) ? (ad.creatives as Array<{ kind?: string; mediaUrl?: string; thumbUrl?: string | null; headline?: string; primaryText?: string }>) : [];
    const request = requests.find((row) => row.campaignId === ad.id);
    return {
      id: ad.id,
      name: ad.name ?? ad.headline,
      mode: ad.mode,
      platform: ad.platform,
      status: ad.status,
      objective: ad.objective,
      products: ad.productIds.length || 1,
      ads: creatives.length || 1,
      image: ad.imageUrl ?? creatives.find((creative) => creative.kind === "image")?.mediaUrl ?? creatives[0]?.thumbUrl ?? ad.product?.image ?? null,
      words: creatives.slice(0, 5).map((creative) => ({ headline: creative.headline ?? "", primaryText: creative.primaryText ?? "" })),
      dailyBudget: ad.dailyBudget,
      currency: ad.currency,
      days: ad.days,
      startAt: ad.startAt?.toISOString() ?? null,
      endAt: ad.endAt?.toISOString() ?? null,
      stats: { spend: ad.stats.spend, clicks: ad.stats.clicks, impressions: ad.impressions, reach: ad.reach, orders: ad.stats.orders, revenue: ad.stats.revenue },
      syncError: ad.syncError,
      lastSyncAt: ad.lastSyncAt?.toISOString() ?? null,
      request: request ? { status: request.status } : null,
    };
  });

  const boosts = ads.filter((ad) => ad.mode === "manual").map((ad) => ({
    id: ad.id,
    platform: ad.platform,
    destination: ad.destination,
    headline: ad.headline,
    primaryText: ad.primaryText,
    image: ad.imageUrl ?? ad.product?.image ?? null,
    productName: ad.product?.name ?? null,
    dailyBudget: ad.dailyBudget,
    days: ad.days,
    status: ad.status,
    link: ad.link,
    day: ad.day,
    stats: { spend: ad.stats.spend, clicks: ad.stats.clicks, orders: ad.stats.orders, revenue: ad.stats.revenue },
  }));

  return ok({
    meta,
    campaigns,
    boosts,
    requests: requests.map((row) => ({ id: row.id, platform: row.platform, status: row.status, businessName: row.businessName, setupFee: row.setupFee, createdAt: row.createdAt.toISOString(), paid: Boolean(row.paidAt), campaignId: row.campaignId })),
    products: products.map((product) => ({ id: product.id, name: product.name, price: Number(product.retailPrice) || 0, image: product.images[0] ?? null })),
    hasWhatsapp: Boolean(whatsapp),
    contact: { name: me?.name ?? "", phone: me?.phone ?? "", email: me?.email ?? user.email ?? "", businessName: store.name, website: buildStorefrontUrl(store, "/") },
  });
});
