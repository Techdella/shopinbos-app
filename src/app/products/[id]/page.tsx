import { requireRole } from "@/lib/server-auth";
import { db } from "@/lib/db/client";
import { notFound } from "next/navigation";
import { ProductForm } from "@/app/components/ProductForm";
import { AppPage, PillLink } from "@/components/app-kit";
import { sellerFrame } from "@/components/seller-core";
import { buildStorefrontOrigin } from "@/lib/domains/storefront";
import { getT } from "@/lib/i18n/server";

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
    },
  });

  if (!product) {
    notFound();
  }

  const [categories, others] = await Promise.all([
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
  ]);

  return (
    <AppPage
      frame={sellerFrame(user, store)}
      title={product.name}
      sub={t("edit.sub")}
      actions={<PillLink href="/products" icon="arrowLeft">{t("allProducts")}</PillLink>}
    >
      <ProductForm
        product={product as any}
        categories={categories}
        isEdit
        storeOrigin={buildStorefrontOrigin({ slug: store.slug, customDomain: store.customDomain })}
        storeName={store.name}
        storeProducts={others.map((entry) => ({ id: entry.id, name: entry.name, image: entry.images[0] ?? null, price: entry.retailPrice }))}
      />
    </AppPage>
  );
}
