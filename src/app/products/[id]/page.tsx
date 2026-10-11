import { requireRole } from "@/lib/server-auth";
import { db } from "@/lib/db/client";
import { notFound } from "next/navigation";
import { ProductForm } from "@/app/components/ProductForm";
import { AppPage, PillLink } from "@/components/app-kit";
import { sellerFrame } from "@/components/seller-core";

export const dynamic = "force-dynamic";

export default async function ProductEditPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params;
  const user = await requireRole(["seller"], "/login");

  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true, name: true, slug: true, logoUrl: true } });
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

  const categories = await db.category.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, name: true, slug: true },
  });

  return (
    <AppPage
      frame={sellerFrame(user, store)}
      title={product.name}
      sub="Edit details, visibility, stock and how the product page looks."
      actions={<PillLink href="/products" icon="arrowLeft">All products</PillLink>}
    >
      <ProductForm
        product={product as any}
        categories={categories}
        isEdit
      />
    </AppPage>
  );
}
