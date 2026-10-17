import type { Metadata } from "next";
import { requireRole } from "@/lib/server-auth";
import { db } from "@/lib/db/client";
import { SellerPage, storeSummary } from "@/components/seller/SellerPage";
import { PillLink } from "@/components/app-kit";
import { getT } from "@/lib/i18n/server";
import { aiConfigured } from "@/lib/ai/client";
import { buildStorefrontUrl } from "@/lib/domains/storefront";
import { productLink } from "@/lib/social/server";
import { sellerWhatsapp } from "@/lib/ads";
import { isMissingTable } from "@/lib/rate-limit-core";
import { loadPackagingDesign } from "@/lib/packaging/designs.server";
import { readStoreLook, toHex6 } from "@/app/home/store/look";
import { readBrandAssets } from "@shared/brand-assets";
import { guessProductType, isPackFormat, isPackStyle, isProductType } from "@shared/packaging";
import { PackagingStudio } from "./PackagingStudio";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  const t = await getT("packaging");
  return { title: t("title") };
}

// Packaging designer. ?design=<id> opens a saved design; Rex opens it prefilled with ?product=&style=&format=&type=.
export default async function PackagingPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireRole(["seller"], "/login");
  const t = await getT("packaging");
  const query = await searchParams;
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true, name: true, slug: true, customDomain: true, logoUrl: true, brandSettings: true, status: true } });

  const products = store
    ? await db.storeProduct.findMany({
        where: { storeId: store.id, status: { not: "archived" } },
        orderBy: [{ soldStock: "desc" }, { createdAt: "desc" }],
        take: 200,
        select: { id: true, name: true, images: true, description: true, barcode: true, productType: true, category: { select: { name: true } } },
      })
    : [];
  let saved: Awaited<ReturnType<typeof loadPackagingDesign>> = null;
  if (store && query.design) {
    try {
      saved = await loadPackagingDesign(store.id, query.design);
    } catch (error) {
      if (!isMissingTable(error)) throw error;
    }
  }
  const tokens = store ? readStoreLook(store).tokens : null;
  const assets = store ? readBrandAssets(store) : null;
  const whatsapp = store ? await sellerWhatsapp(store.id, user.phone ?? null).catch(() => null) : null;

  return (
    <SellerPage
      user={user}
      store={storeSummary(store)}
      title={saved ? saved.title : t("title")}
      sub={t("sub")}
      actions={<PillLink href="/home/labels" icon="grid">{t("allDesigns")}</PillLink>}
    >
      <PackagingStudio
        aiReady={aiConfigured()}
        brand={{
          name: store?.name ?? "",
          logo: assets?.logo ?? null,
          accent: toHex6(tokens?.accent, "#FF6A2B"),
          ink: toHex6(tokens?.ink, "#16141F"),
          paper: toHex6(tokens?.paperBg, "#FFFFFF"),
          website: store ? buildStorefrontUrl(store) : "",
          whatsapp: whatsapp ?? null,
        }}
        products={products.map((product) => ({
          id: product.id,
          name: product.name,
          images: product.images.slice(0, 4),
          description: product.description,
          barcode: product.barcode,
          url: store ? productLink(store, product.id) : "",
          type: guessProductType(`${product.name} ${product.category?.name ?? ""} ${product.productType ?? ""} ${product.description?.slice(0, 200) ?? ""}`),
        }))}
        saved={saved ? { id: saved.id, title: saved.title, design: saved.design } : null}
        start={{
          productId: query.product ?? null,
          style: isPackStyle(query.style) ? query.style : null,
          format: isPackFormat(query.format) ? query.format : null,
          type: isProductType(query.type) ? query.type : null,
          fromRex: query.from === "rex",
        }}
      />
    </SellerPage>
  );
}
