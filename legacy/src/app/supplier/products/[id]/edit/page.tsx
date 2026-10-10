import { notFound } from "next/navigation";
import { db } from "@/lib/db/client";
import { requireRole } from "@/lib/server-auth";
import { ensureSupplierAccess, getSupplierForUser } from "@/lib/role-queries";
import { RolePage } from "@/components/role/RolePage";
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
    <RolePage
      role="supplier"
      eyebrow="Edit product"
      title={product.name}
      description="Keep trade terms, media, stock, and fulfilment current. Public-facing changes go back through marketplace review."
      actions={[{ label: "New product", href: "/supplier/products/new", icon: "plus" }]}
      metrics={[
        { label: "Status", value: product.status.replace("_", " "), sub: product.category.name, icon: "flag", tone: product.status === "published" ? "teal" : "amber" },
        { label: "Stock", value: String(product.stockQuantity), sub: `MOQ ${product.moq}`, icon: "box", tone: "indigo" },
        { label: "Dropship", value: product.dropshipAvailable ? "On" : "Off", sub: product.bulkOrderAvailable ? "Bulk enabled" : "Bulk off", icon: "truck", tone: "lime" },
      ]}
      assistantNote="Rex keeps an eye on the review path. Save as draft while working, then send it to review when the product is ready for sellers."
    >
      <SupplierProductForm
        mode="edit"
        action={updateSupplierProduct}
        categories={categories}
        product={product}
        error={query?.error}
        saved={query?.saved === "1"}
      />
    </RolePage>
  );
}
