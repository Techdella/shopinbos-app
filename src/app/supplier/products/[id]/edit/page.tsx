import { notFound } from "next/navigation";
import { db } from "@/lib/db/client";
import { requireRole } from "@/lib/server-auth";
import { ensureSupplierAccess, getSupplierForUser } from "@/lib/role-queries";
import { AppPage, PillLink } from "@/components/app-kit";
import { supplierFrame } from "@/components/supplier/supplier-kit";
import { updateSupplierProduct } from "@/app/actions/supplier";
import { SupplierProductForm } from "@/components/supplier/SupplierProductForm";

export default async function EditSupplierProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ error?: string; saved?: string }>;
}) {
  const user = await requireRole(["supplier"], "/supplier/login");
  const supplier = await getSupplierForUser(user);
  ensureSupplierAccess(supplier);
  const { id } = await params;
  const query = searchParams ? await searchParams : {};

  const [product, categories] = await Promise.all([
    db.supplierProduct.findFirst({
      where: { id, supplierId: supplier.id },
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        categoryId: true,
        images: true,
        status: true,
        wholesalePrice: true,
        wholesalePriceTo: true,
        suggestedRetailPrice: true,
        currency: true,
        stockQuantity: true,
        moq: true,
        pricingTiers: true,
        dropshipAvailable: true,
        bulkOrderAvailable: true,
        sampleAvailable: true,
        deliveryRegions: true,
        processingTime: true,
        updatedAt: true,
        category: { select: { name: true, slug: true } },
      },
    }),
    db.category.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true, slug: true },
    }),
  ]);

  if (!product) notFound();

  return (
    <AppPage
      frame={supplierFrame(user, supplier)}
      title={product.name}
      sub={`${product.category.name} · keep prices for shops, photos, how many you have and delivery up to date. Changes to a live product go back through review.`}
      actions={
        <>
          <PillLink href="/supplier/products">All products</PillLink>
          <PillLink href="/supplier/products/new" icon="plus">New product</PillLink>
        </>
      }
    >
      <SupplierProductForm
        mode="edit"
        action={updateSupplierProduct}
        categories={categories}
        product={product}
        error={query?.error}
        saved={query?.saved === "1"}
      />
    </AppPage>
  );
}
