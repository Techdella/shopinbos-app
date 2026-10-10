import { requireRole } from "@/lib/server-auth";
import { db } from "@/lib/db/client";
import { ProductForm } from "@/app/components/ProductForm";

export const dynamic = "force-dynamic";

export default async function NewProductPage() {
  const user = await requireRole(["seller"], "/login");

  const categories = await db.category.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, name: true, slug: true },
  });

  return (
    <ProductForm
      product={null}
      categories={categories}
      isEdit={false}
    />
  );
}
