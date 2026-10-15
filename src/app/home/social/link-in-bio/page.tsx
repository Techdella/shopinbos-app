import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/server-auth";
import { db } from "@/lib/db/client";
import { SellerPage, storeSummary } from "@/components/seller/SellerPage";
import { getT } from "@/lib/i18n/server";
import { sellerWhatsapp } from "@/lib/ads";
import { loadSellerBio } from "@/lib/bio/service.server";
import { resolveShopperTheme } from "@/components/storefront/shopper/theme";
import { BioEditor } from "./BioEditor";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT("paylinks");
  return { title: t("bio.metaTitle") };
}

export default async function LinkInBioPage() {
  const user = await requireRole(["seller"], "/login");
  const t = await getT("paylinks");
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true, name: true, slug: true, customDomain: true, logoUrl: true, description: true, currency: true, brandSettings: true } });
  if (!store) redirect("/builder?firstRun=1");
  const [page, products, collections, whatsapp] = await Promise.all([
    loadSellerBio(store),
    db.storeProduct.findMany({ where: { storeId: store.id, status: "published" }, orderBy: [{ soldStock: "desc" }, { createdAt: "desc" }], take: 500, select: { id: true, name: true, images: true, retailPrice: true } }),
    db.collection.findMany({ where: { storeId: store.id }, orderBy: { sortOrder: "asc" }, take: 200, select: { id: true, name: true } }),
    sellerWhatsapp(store.id, user.phone ?? null),
  ]);
  const theme = resolveShopperTheme(store.brandSettings);

  return (
    <SellerPage user={user} store={storeSummary(store)} title={t("bio.title")} sub={t("bio.sub")} width="max-w-[1280px]">
      <BioEditor
        slug={store.slug}
        currency={store.currency}
        initial={page}
        products={products.map((product) => ({ id: product.id, name: product.name, image: product.images[0] ?? null, price: Number(product.retailPrice) || 0 }))}
        collections={collections}
        whatsapp={whatsapp ? `+${whatsapp}` : ""}
        storeColours={{ background: theme.paper, text: theme.ink, button: theme.cta, buttonText: theme.ctaText }}
      />
    </SellerPage>
  );
}
