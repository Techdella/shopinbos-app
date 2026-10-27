import type { Metadata } from "next";
import { requireRole } from "@/lib/server-auth";
import { db } from "@/lib/db/client";
import { SellerPage, storeSummary } from "@/components/seller/SellerPage";
import { getSellerAds, sellerWhatsapp } from "@/lib/ads";
import Link from "next/link";
import { AdsManager } from "./AdsManager";
import { CampaignList } from "./CampaignList";
import { MetaConnectCard } from "./MetaConnectCard";
import { metaAdsStatus, syncMetaCampaign } from "@/lib/ad-campaigns/meta.server";
import { adRequestStatusLabel } from "@/lib/ad-campaigns/requests.server";
import { Notice } from "@/components/app-ui";
import { Icon } from "@/components/ui/Icon";
import { isOwnImageUrl } from "@/lib/ai/images";
import { getT } from "@/lib/i18n/server";
import { PageTip } from "@/components/learn/PageTip";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  const t = await getT("ads");
  return { title: t("title") };
}

export default async function AdsPage({ searchParams }: { searchParams: Promise<{ image?: string; product?: string; meta?: string; setup?: string; done?: string }> }) {
  const query = await searchParams;
  const user = await requireRole(["seller"], "/login");
  const tipT = await getT("tips");
  const t = await getT("ads");
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true, name: true, slug: true, logoUrl: true } });
  // Running Meta campaigns pull fresh numbers when they're more than 15 minutes old.
  if (store) {
    const stale = await db.adCampaign
      .findMany({ where: { storeId: store.id, mode: "meta", status: { in: ["running", "paused"] }, OR: [{ lastSyncAt: null }, { lastSyncAt: { lt: new Date(Date.now() - 15 * 60_000) } }] }, take: 5 })
      .catch(() => []);
    await Promise.all(stale.map((campaign) => syncMetaCampaign(campaign)));
  }
  const [meta, requests] = store
    ? await Promise.all([metaAdsStatus(store.id), db.adServiceRequest.findMany({ where: { storeId: store.id }, orderBy: { createdAt: "desc" }, take: 20 }).catch(() => [])])
    : [null, []];
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

  const manual = ads.filter((ad) => ad.mode === "manual");
  const campaigns = ads.filter((ad) => ad.mode !== "manual");
  const notice =
    query.meta === "connected" ? { tone: "success" as const, text: t("m.nowConnected") } :
    query.meta === "needs_account" ? { tone: "info" as const, text: t("m.pickNow") } :
    query.meta === "problem" || query.meta === "unavailable" ? { tone: "error" as const, text: t("m.problem") } :
    query.setup === "paid" ? { tone: "success" as const, text: t("r.paid") } :
    query.setup === "failed" ? { tone: "error" as const, text: t("r.failed") } :
    query.setup === "pending" ? { tone: "info" as const, text: t("r.pending") } :
    query.done === "launched" ? { tone: "success" as const, text: t("c.launched") } :
    query.done === "draft" ? { tone: "info" as const, text: t("c.saved") } : null;

  return (
    <SellerPage
      user={user}
      store={storeSummary(store)}
      title={t("title")}
      sub={t("c.homeSub")}
    >
      <div className="grid gap-5">
        <PageTip>{tipT("ads")}</PageTip>
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[22px] bg-app-ink p-5 text-white">
          <div>
            <h2 className="m-0 text-[19px] font-extrabold">{t("c.startTitle")}</h2>
            <p className="m-0 mt-1 text-[13.5px] text-white/80">{t("c.startHint")}</p>
          </div>
          <Link href="/home/ads/new" className="inline-flex min-h-[48px] items-center gap-2 rounded-full bg-white px-5 text-[15px] font-bold text-app-ink no-underline">
            <Icon name="plus" size={16} /> {t("c.start")}
          </Link>
        </div>
        {notice ? <Notice tone={notice.tone}>{notice.text}</Notice> : null}
        {meta ? <MetaConnectCard status={meta} /> : null}
        <CampaignList
          campaigns={campaigns.map((ad) => {
            const creatives = Array.isArray(ad.creatives) ? (ad.creatives as Array<{ kind?: string; mediaUrl?: string; thumbUrl?: string | null }>) : [];
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
              dailyBudget: ad.dailyBudget,
              currency: ad.currency,
              days: ad.days,
              startAt: ad.startAt?.toISOString() ?? null,
              endAt: ad.endAt?.toISOString() ?? null,
              stats: { spend: ad.stats.spend, clicks: ad.stats.clicks, impressions: ad.impressions, reach: ad.reach, orders: ad.stats.orders, revenue: ad.stats.revenue },
              syncError: ad.syncError,
              lastSyncAt: ad.lastSyncAt?.toISOString() ?? null,
              request: request ? { status: request.status, label: adRequestStatusLabel(request.status) } : null,
            };
          })}
          requests={requests.map((row) => ({ id: row.id, platform: row.platform, status: row.status, label: adRequestStatusLabel(row.status), businessName: row.businessName, setupFee: row.setupFee, createdAt: row.createdAt.toISOString(), paid: Boolean(row.paidAt) }))}
        />
        <details className="rounded-[22px] border border-app-line bg-white p-5" open={manual.length > 0 && campaigns.length === 0}>
          <summary className="cursor-pointer text-[16px] font-extrabold">{t("c.boostYourself")}</summary>
          <p className="m-0 mt-1 text-[13px] text-app-ink-soft">{t("c.boostHint")}</p>
          <div className="mt-4">
            <AdsManager
              image={query.image && isOwnImageUrl(query.image) ? query.image : null}
              initialProductId={query.product}
              storeName={store?.name ?? ""}
              hasWhatsapp={Boolean(whatsapp)}
              products={products.map((product) => ({ id: product.id, name: product.name, price: product.retailPrice, image: product.images[0] ?? null }))}
              ads={manual.map((ad) => ({
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
          </div>
        </details>
      </div>
    </SellerPage>
  );
}
