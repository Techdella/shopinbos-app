import { requireRole } from "@/lib/server-auth";
import { db } from "@/lib/db/client";
import { ProductForm } from "@/app/components/ProductForm";
import { AppPage, PillLink } from "@/components/app-kit";
import { sellerFrame } from "@/components/seller-core";

export const dynamic = "force-dynamic";

export default async function NewProductPage() {
  const user = await requireRole(["seller"], "/login");

  const [categories, store] = await Promise.all([
    db.category.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true, slug: true },
    }),
    db.store.findUnique({ where: { userId: user.id }, select: { name: true, slug: true, logoUrl: true } }),
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
      />
    </AppPage>
  );
}
