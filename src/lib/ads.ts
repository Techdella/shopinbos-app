import { db } from "@/lib/db/client";
import { buildStorefrontUrl } from "@/lib/domains/storefront";
import { PAID_ORDER_STATUSES } from "@/lib/insights";
import { AD_PLATFORMS, adAdvice, costPerOrder, daysRunning, plannedBudget } from "@shared/ads";

// Server side of /home/ads and /r/ad/<code>.

export function appOrigin() {
  return (process.env.NEXT_PUBLIC_APP_URL ?? "https://app.shopinbos.com").replace(/\/$/, "");
}

export function trackingUrl(code: string) {
  return `${appOrigin()}/r/ad/${code}`;
}

/** The seller's WhatsApp number in wa.me form (digits, country code), if we know one. */
export function waDigits(phone: string | null | undefined) {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (digits.length < 8) return null;
  return digits.startsWith("0") ? `234${digits.slice(1)}` : digits;
}

export async function sellerWhatsapp(storeId: string, userPhone: string | null) {
  const chat = await db.liveChatConfig.findUnique({ where: { storeId }, select: { whatsappNumber: true } });
  return waDigits(chat?.whatsappNumber) ?? waDigits(userPhone);
}

/** Where a tap on the ad lands: a WhatsApp chat with a pre-filled message, or the product page tagged with the ad. */
export function adLandingUrl(
  ad: { code: string; platform: string; destination: string; headline: string },
  store: { slug: string; customDomain: string | null },
  productId: string | null,
  whatsapp: string | null,
) {
  if (ad.destination === "whatsapp" && whatsapp) {
    const text = `Hi! I saw your ad for ${ad.headline.split(" · ")[0]}. Is it available? (ref ${ad.code})`;
    return `https://wa.me/${whatsapp}?text=${encodeURIComponent(text)}`;
  }
  const ref = AD_PLATFORMS.find((platform) => platform.key === ad.platform)?.ref ?? "ig";
  const url = new URL(buildStorefrontUrl(store, productId ? `/product/${productId}` : "/"));
  url.searchParams.set("ad", ad.code);
  url.searchParams.set("ref", ref);
  return url.toString();
}

const PAID = new Set<string>(PAID_ORDER_STATUSES);

export async function getSellerAds(storeId: string, now = new Date()) {
  const ads = await db.adCampaign.findMany({
    where: { storeId },
    orderBy: { createdAt: "desc" },
    include: { orders: { select: { status: true, total: true } } },
  });
  const productIds = [...new Set(ads.map((ad) => ad.storeProductId).filter((id): id is string => Boolean(id)))];
  const products = productIds.length
    ? await db.storeProduct.findMany({ where: { id: { in: productIds }, storeId }, select: { id: true, name: true, images: true, retailPrice: true } })
    : [];
  const byId = new Map(products.map((product) => [product.id, product]));

  return ads.map(({ orders, ...ad }) => {
    const live = orders.filter((order) => !["cancelled", "refunded", "returned"].includes(order.status));
    const stats = {
      status: ad.status,
      startedAt: ad.startedAt,
      days: ad.days,
      dailyBudget: ad.dailyBudget,
      spend: ad.spend,
      clicks: ad.clicks,
      orders: live.length,
      revenue: live.filter((order) => PAID.has(order.status)).reduce((sum, order) => sum + Number(order.total), 0),
    };
    const product = ad.storeProductId ? byId.get(ad.storeProductId) ?? null : null;
    return {
      ...ad,
      product: product ? { id: product.id, name: product.name, image: product.images[0] ?? null, price: product.retailPrice } : null,
      link: trackingUrl(ad.code),
      stats,
      planned: plannedBudget(ad.dailyBudget, ad.days),
      costPerOrder: costPerOrder(stats),
      day: daysRunning(ad.startedAt, now),
      advice: adAdvice(stats, now),
    };
  });
}

export type SellerAd = Awaited<ReturnType<typeof getSellerAds>>[number];
