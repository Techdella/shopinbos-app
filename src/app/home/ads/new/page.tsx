import type { Metadata } from "next";
import { requireRole } from "@/lib/server-auth";
import { db } from "@/lib/db/client";
import { SellerPage, storeSummary } from "@/components/seller/SellerPage";
import { sellerWhatsapp } from "@/lib/ads";
import { metaAdsStatus } from "@/lib/ad-campaigns/meta.server";
import { buildStorefrontUrl } from "@/lib/domains/storefront";
import { getT } from "@/lib/i18n/server";
import { getPriceBook } from "@/lib/pricing/price-book.server";
import { adPrices } from "@shared/platform-pricing";
import { CampaignWizard } from "./CampaignWizard";
import { PromoBanner } from "@/components/pricing/PromoBanner";
import { PageTip } from "@/components/learn/PageTip";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  const t = await getT("ads");
  return { title: t("c.title") };
}

// Start a campaign (?video=<VideoProject id> starts with that video as an ad; ?product= with that product).
export default async function NewCampaignPage({ searchParams }: { searchParams: Promise<{ video?: string; product?: string }> }) {
  const query = await searchParams;
  const user = await requireRole(["seller"], "/login");
  const tipT = await getT("tips");
  const t = await getT("ads");
  const prices = adPrices(await getPriceBook());
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true, name: true, slug: true, customDomain: true, logoUrl: true } });
  const [products, videos, meta, whatsapp] = store
    ? await Promise.all([
        db.storeProduct.findMany({
          where: { storeId: store.id, status: "published", NOT: { images: { isEmpty: true } } },
          orderBy: [{ soldStock: "desc" }, { createdAt: "desc" }],
          take: 200,
          select: { id: true, name: true, retailPrice: true, images: true },
        }),
        db.videoProject
          .findMany({ where: { storeId: store.id, videoUrl: { not: null } }, orderBy: { updatedAt: "desc" }, take: 30, select: { id: true, title: true, videoUrl: true, posterUrl: true, productId: true } })
          .catch(() => []),
        metaAdsStatus(store.id),
        sellerWhatsapp(store.id, user.phone ?? null),
      ])
    : [[], [], null, null];

  return (
    <SellerPage user={user} store={storeSummary(store)} title={t("c.title")} sub={t("c.sub")}>
      <PageTip className="mb-5">{tipT("ads.new")}</PageTip>
      <PromoBanner role="seller" className="mb-5" />
      <CampaignWizard
        products={products.map((product) => ({ id: product.id, name: product.name, price: product.retailPrice, image: product.images[0] ?? null }))}
        videos={videos.flatMap((video) => (video.videoUrl ? [{ id: video.id, title: video.title, videoUrl: video.videoUrl, posterUrl: video.posterUrl, productId: video.productId }] : []))}
        meta={meta ?? { configured: false, status: "off", accountId: null, accountName: null, pageName: null, currency: "NGN" }}
        initialVideoId={query.video ?? null}
        initialProductIds={query.product ? [query.product] : []}
        hasWhatsapp={Boolean(whatsapp)}
        prices={prices}
        contact={{ name: user.name ?? "", phone: user.phone ?? "", email: user.email ?? "", businessName: store?.name ?? "", website: store ? buildStorefrontUrl(store, "/") : "" }}
      />
    </SellerPage>
  );
}
