import type { Metadata } from "next";
import { requireRole } from "@/lib/server-auth";
import { db } from "@/lib/db/client";
import { buildStorefrontUrl } from "@/lib/domains/storefront";
import { SellerPage, storeSummary } from "@/components/seller/SellerPage";
import { VideoStudio } from "./VideoStudio";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Video studio" };

export default async function VideoStudioPage({ searchParams }: { searchParams: Promise<{ product?: string }> }) {
  const user = await requireRole(["seller"], "/login");
  const { product } = await searchParams;
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true, name: true, slug: true, customDomain: true, logoUrl: true } });
  const products = store
    ? await db.storeProduct.findMany({
        where: { storeId: store.id, status: { not: "archived" }, NOT: { images: { isEmpty: true } } },
        orderBy: [{ soldStock: "desc" }, { createdAt: "desc" }],
        take: 60,
        select: { id: true, name: true, retailPrice: true, images: true, description: true, videoUrl: true },
      })
    : [];
  const storeHost = store ? buildStorefrontUrl(store, "/").replace(/^https?:\/\//, "").replace(/\/$/, "") : "";

  return (
    <SellerPage
      user={user}
      store={storeSummary(store)}
      title="Video studio"
      sub="Photos in, a reel out. Peggy writes the captions and the voiceover in English, Pidgin, Yorùbá or Hausa. Post it on Instagram, TikTok or your WhatsApp status."
    >
      <VideoStudio
        storeName={store?.name ?? "My shop"}
        storeHost={storeHost}
        initialProductId={product ?? null}
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
