import { requireRole } from "@/lib/server-auth";
import { db } from "@/lib/db/client";
import { notFound } from "next/navigation";
import { ProductForm } from "@/app/components/ProductForm";
import { AppPage, PillLink } from "@/components/app-kit";
import { sellerFrame } from "@/components/seller-core";
import { buildStorefrontOrigin } from "@/lib/domains/storefront";
import { getT } from "@/lib/i18n/server";
import { PaymentLinkButton } from "@/components/payment-links/PaymentLinkButton";
import { linkProductView } from "@/lib/payment-links/pure";
import { paymentReadiness } from "@/lib/payment-links/service.server";
import { ShareWhatsAppButton } from "@/components/products/ShareWhatsAppButton";
import { storefrontProductUrl } from "@shared/product-codes";
import { storeUrl } from "@/lib/marketing/brand";
import { productChannels } from "@/lib/sales-channels/product-view.server";
import { featureOn } from "@/lib/feature-switches.server";
import { ProductVideosPanel } from "@/components/product-videos/ProductVideosPanel";
import { POST_TO_PLUG } from "@shared/product-videos";
import { ProductResellCard } from "@/components/resell/ProductResellCard";
import { RESELL_FEATURE } from "@shared/resell";
import { ProductPayOptionsCard } from "@/components/together/ProductPayOptionsCard";

export const dynamic = "force-dynamic";

export default async function ProductEditPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params;
  const user = await requireRole(["seller"], "/login");
  const t = await getT("products");

  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true, name: true, slug: true, logoUrl: true, customDomain: true } });
  if (!store) {
    notFound();
  }

  // Only the seller's own products can be opened here.
  const product = await db.storeProduct.findFirst({
    where: { id, storeId: store.id },
    include: {
      category: { select: { id: true, name: true } },
      // Dropship products follow the supplier's preorders (shown on the form).
      supplierProduct: { select: { preorderEnabled: true, preorderShipsAt: true, preorderNote: true } },
    },
  });

  if (!product) {
    notFound();
  }

  const [categories, others, readiness, channels, videosOn] = await Promise.all([
    db.category.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true, slug: true },
    }),
    // For "Customers also like".
    db.storeProduct.findMany({
      where: { storeId: store.id, status: { not: "archived" }, id: { not: product.id } },
      orderBy: { createdAt: "desc" },
      take: 300,
      select: { id: true, name: true, images: true, retailPrice: true },
    }),
    paymentReadiness(store.id),
    productChannels(store.id),
    // Product videos (Post to Plug): only for shops in the pilot.
    featureOn(user.id, POST_TO_PLUG),
  ]);
  // Resell (pilot): "Let resellers sell this" + commission, only for shops in the pilot.
  const resellOn = await featureOn(user.id, RESELL_FEATURE);
  // Other ways to buy (pilots pay_small_small, group_buy, ajo): only for shops in one of them.
  const togetherOn = (await Promise.all(["pay_small_small", "group_buy", "ajo"].map((key) => featureOn(user.id, key)))).some(Boolean);

  return (
    <AppPage
      frame={sellerFrame(user, store)}
      title={product.name}
      sub={product.shortCode ? t("code.sub", { code: product.shortCode }) : t("edit.sub")}
      actions={
        <>
          <PillLink href="/products" icon="arrowLeft" iconOnlyOnPhone>{t("allProducts")}</PillLink>
          {/* Only published products can be paid for (the pay page shows public products only). */}
          {/* Share to WhatsApp: name, price, code and the product's page (live products only). */}
          {product.status === "published" ? <ShareWhatsAppButton product={{ name: product.name, price: product.retailPrice, currency: product.currency, shortCode: product.shortCode, url: storefrontProductUrl(storeUrl(store), product.id) }} /> : null}
          {product.status === "published" ? <PaymentLinkButton product={linkProductView(product)} storeName={store.name} ready={readiness.ready} /> : null}
        </>
      }
    >
      <ProductForm
        product={product as any}
        categories={categories}
        isEdit
        channels={channels}
        storeOrigin={buildStorefrontOrigin({ slug: store.slug, customDomain: store.customDomain })}
        storeName={store.name}
        storeProducts={others.map((entry) => ({ id: entry.id, name: entry.name, image: entry.images[0] ?? null, price: entry.retailPrice }))}
      />
      {videosOn ? <ProductVideosPanel ownerKind="store" productId={product.id} /> : null}
      {resellOn ? <ProductResellCard productId={product.id} price={product.retailPrice} currency={product.currency} /> : null}
      {togetherOn ? <ProductPayOptionsCard productId={product.id} /> : null}
    </AppPage>
  );
}
