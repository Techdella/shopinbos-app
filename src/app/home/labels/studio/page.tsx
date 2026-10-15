import type { Metadata } from "next";
import { requireRole } from "@/lib/server-auth";
import { db } from "@/lib/db/client";
import { SellerPage, storeSummary } from "@/components/seller/SellerPage";
import { PillLink } from "@/components/app-kit";
import { getT } from "@/lib/i18n/server";
import { buildStorefrontUrl } from "@/lib/domains/storefront";
import { productLink } from "@/lib/social/server";
import { sellerWhatsapp } from "@/lib/ads";
import { readStoreLook, toHex6 } from "@/app/home/store/look";
import { readBrandAssets } from "@shared/brand-assets";
import { naira } from "@shared/onboarding";
import { isPrintKind, isQrTarget } from "@shared/print-labels";
import { PrintStudio } from "./PrintStudio";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  const t = await getT("orders");
  return { title: t("ps.title") };
}

// Print studio: hang tags, price and barcode labels, QR stickers, package labels and thank-you cards in the store's
// brand, printed on A4 or a label printer, downloaded, or emailed to a print shop. Rex can open it prefilled:
// ?kind=&products=id,id&headline=&note=&qr=&copies=
export default async function PrintStudioPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireRole(["seller"], "/login");
  const t = await getT("orders");
  const query = await searchParams;
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true, name: true, slug: true, customDomain: true, logoUrl: true, brandSettings: true, status: true } });

  const products = store
    ? await db.storeProduct.findMany({
        where: { storeId: store.id, status: { not: "archived" } },
        orderBy: [{ soldStock: "desc" }, { createdAt: "desc" }],
        take: 300,
        select: { id: true, name: true, retailPrice: true, sku: true, barcode: true, images: true },
      })
    : [];
  const tokens = store ? readStoreLook(store).tokens : null;
  const assets = store ? readBrandAssets(store) : null;
  const whatsapp = store ? await sellerWhatsapp(store.id, user.phone ?? null).catch(() => null) : null;
  const preselected = (query.products ?? "").split(",").map((id) => id.trim()).filter((id) => products.some((p) => p.id === id)).slice(0, 60);

  return (
    <SellerPage
      user={user}
      store={storeSummary(store)}
      title={t("ps.title")}
      sub={t("ps.sub")}
      actions={<PillLink href="/home/labels" icon="truck">{t("ps.shipping")}</PillLink>}
    >
      <PrintStudio
        store={
          store
            ? {
                name: store.name,
                url: buildStorefrontUrl(store),
                whatsapp: whatsapp ?? null,
                reviewsUrl: buildStorefrontUrl(store, "/reviews"),
                logo: assets?.logo ?? null,
                icon: assets?.shown.icon ?? null,
                accent: toHex6(tokens?.accent, "#FF6A2B"),
                ink: toHex6(tokens?.ink, "#16141F"),
                paper: toHex6(tokens?.paperBg, "#FFFFFF"),
              }
            : null
        }
        products={products.map((product) => ({
          id: product.id,
          name: product.name,
          price: naira(Number(product.retailPrice) || 0),
          url: store ? productLink(store, product.id) : "",
          sku: product.sku,
          barcode: product.barcode,
          image: product.images[0] ?? null,
        }))}
        initial={{
          kind: isPrintKind(query.kind) ? query.kind : "tag",
          products: preselected,
          headline: query.headline?.slice(0, 60) ?? "",
          note: query.note?.slice(0, 160) ?? "",
          qr: isQrTarget(query.qr) ? query.qr : "product",
          copies: Math.max(1, Math.min(100, Number(query.copies) || 1)),
        }}
      />
    </SellerPage>
  );
}
