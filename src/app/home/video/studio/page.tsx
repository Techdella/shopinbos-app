import type { Metadata } from "next";
import { requireRole } from "@/lib/server-auth";
import { db } from "@/lib/db/client";
import { buildStorefrontUrl } from "@/lib/domains/storefront";
import { SellerPage, storeSummary } from "@/components/seller/SellerPage";
import { redirect } from "next/navigation";
import { VideoStudio } from "../VideoStudio";
import { isVideoPurpose, readVideoConfig } from "@shared/video-projects";
import { getT } from "@/lib/i18n/server";
import { loadBrandContext } from "@/lib/ai/brand-context.server";
import { elevenLabsReady } from "@/lib/ai/elevenlabs.server";
import { reelBrand } from "@shared/video-style";
import { liveCreditPrices } from "@/lib/ai/credits.server";
import { PageTip } from "@/components/learn/PageTip";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  const t = await getT("video");
  return { title: t("title") };
}

export default async function VideoStudioPage({ searchParams }: { searchParams: Promise<{ product?: string; id?: string; purpose?: string }> }) {
  const user = await requireRole(["seller"], "/login");
  const tipT = await getT("tips");
  const t = await getT("video");
  const { product, id, purpose } = await searchParams;
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true, name: true, slug: true, customDomain: true, logoUrl: true } });
  const products = store
    ? await db.storeProduct.findMany({
        where: { storeId: store.id, status: { not: "archived" }, NOT: { images: { isEmpty: true } } },
        orderBy: [{ soldStock: "desc" }, { createdAt: "desc" }],
        take: 60,
        select: { id: true, name: true, retailPrice: true, images: true, description: true, videoUrl: true },
      })
    : [];
  const project = id && store ? await db.videoProject.findFirst({ where: { id, storeId: store.id } }).catch(() => null) : null;
  if (id && !project) redirect("/home/video");
  const [brand, { costs }] = await Promise.all([store ? loadBrandContext(store.id).catch(() => null) : null, liveCreditPrices()]);
  const storeHost = store ? buildStorefrontUrl(store, "/").replace(/^https?:\/\//, "").replace(/\/$/, "") : "";

  return (
    <SellerPage
      user={user}
      store={storeSummary(store)}
      title={t("title")}
      sub={t("sub")}
    >
      <PageTip className="mb-5">{tipT("video.studio")}</PageTip>
      <VideoStudio
        storeName={store?.name ?? t("myShop")}
        storeHost={storeHost}
        initialProductId={project?.productId ?? product ?? null}
        project={project ? { id: project.id, title: project.title, purpose: isVideoPurpose(project.purpose) ? project.purpose : "social", status: project.status, videoUrl: project.videoUrl, config: readVideoConfig(project.config) } : null}
        purpose={isVideoPurpose(purpose) ? purpose : "social"}
        brand={reelBrand(brand?.colours ?? null, store?.logoUrl ?? brand?.logoUrl ?? null)}
        elevenLabs={elevenLabsReady()}
        costs={{ image: costs.photo ?? costs.image, video: costs.video }}
        products={products.map((item) => ({
          id: item.id,
          name: item.name,
          price: item.retailPrice,
          images: item.images.slice(0, 6),
          description: item.description ?? "",
          hasVideo: Boolean(item.videoUrl),
        }))}
      />
    </SellerPage>
  );
}
