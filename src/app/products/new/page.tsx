import { requireRole } from "@/lib/server-auth";
import { db } from "@/lib/db/client";
import { ProductForm } from "@/app/components/ProductForm";
import { AppPage, PillLink } from "@/components/app-kit";
import { sellerFrame } from "@/components/seller-core";
import { buildStorefrontOrigin } from "@/lib/domains/storefront";

export const dynamic = "force-dynamic";

export default async function NewProductPage() {
  const user = await requireRole(["seller"], "/login");

  const [categories, store] = await Promise.all([
    db.category.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true, slug: true },
    }),
    db.store.findUnique({ where: { userId: user.id }, select: { name: true, slug: true, logoUrl: true, customDomain: true } }),
  ]);

  return (
    <AppPage
      frame={sellerFrame(user, store)}
      title="New product"
      sub="Add a product to your store. You can save it as a draft and finish later."
      actions={<PillLink href="/products" icon="arrowLeft">All products</PillLink>}
    >
      <ProductForm
        product={null}
        categories={categories}
        isEdit={false}
        storeOrigin={store ? buildStorefrontOrigin({ slug: store.slug, customDomain: store.customDomain }) : ""}
        storeName={store?.name}
      />
    </AppPage>
  );
}
