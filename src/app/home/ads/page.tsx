import type { Metadata } from "next";
import { requireRole } from "@/lib/server-auth";
import { db } from "@/lib/db/client";
import { SellerPage, storeSummary } from "@/components/seller/SellerPage";
import { getSellerAds, sellerWhatsapp } from "@/lib/ads";
import { AdsManager } from "./AdsManager";
import { getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  const t = await getT("ads");
  return { title: t("title") };
}

export default async function AdsPage() {
  const user = await requireRole(["seller"], "/login");
  const t = await getT("ads");
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true, name: true, slug: true, logoUrl: true } });
  const [ads, products, whatsapp] = store
    ? await Promise.all([
        getSellerAds(store.id),
        db.storeProduct.findMany({
          where: { storeId: store.id, status: "published", NOT: { images: { isEmpty: true } } },
          orderBy: [{ soldStock: "desc" }, { createdAt: "desc" }],
          take: 60,
          select: { id: true, name: true, retailPrice: true, images: true },
        }),
        sellerWhatsapp(store.id, user.phone ?? null),
      ])
    : [[], [], null];

  return (
    <SellerPage
      user={user}
      store={storeSummary(store)}
      title={t("title")}
      sub={t("sub")}
    >
      <AdsManager
        storeName={store?.name ?? ""}
        hasWhatsapp={Boolean(whatsapp)}
        products={products.map((product) => ({ id: product.id, name: product.name, price: product.retailPrice, image: product.images[0] ?? null }))}
        ads={ads.map((ad) => ({
          id: ad.id,
          code: ad.code,
          platform: ad.platform,
          destination: ad.destination,
          headline: ad.headline,
          primaryText: ad.primaryText,
          imageUrl: ad.imageUrl ?? ad.product?.image ?? null,
          productName: ad.product?.name ?? null,
          dailyBudget: ad.dailyBudget,
          days: ad.days,
          status: ad.status,
          link: ad.link,
          day: ad.day,
          planned: ad.planned,
          stats: { spend: ad.stats.spend, clicks: ad.stats.clicks, orders: ad.stats.orders, revenue: ad.stats.revenue },
          costPerOrder: ad.costPerOrder,
          advice: ad.advice,
        }))}
      />
    </SellerPage>
  );
}
