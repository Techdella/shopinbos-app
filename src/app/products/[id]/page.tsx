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

  const [categories, others, readiness, channels] = await Promise.all([
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
  ]);

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
    </AppPage>
  );
}
