import { upsertCategory } from "@/app/actions/admin";
import { TextArea, TextInput } from "@/components/ops/OpsPrimitives";
import { RolePage } from "@/components/role/RolePage";
import { Card } from "@/components/ui/Card";
import { db } from "@/lib/db/client";
import { requireRole } from "@/lib/server-auth";

export default async function AdminCategoriesPage() {
  await requireRole(["admin"], "/admin/login");

  const categories = await db.category.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      imageUrl: true,
      parentId: true,
      sortOrder: true,
      _count: { select: { supplierProducts: true } },
    },
  });

  return (
    <RolePage
      role="admin"
      eyebrow="Admin categories"
      title="Categories"
      description="Manage the taxonomy that powers public marketplace navigation, supplier product placement, and WordPress category landing pages."
      metrics={[
        { label: "Categories", value: String(categories.length) },
        { label: "Root", value: String(categories.filter((category) => !category.parentId).length) },
        { label: "Linked products", value: String(categories.reduce((total, category) => total + category._count.supplierProducts, 0)) },
      ]}
    >
      <div className="grid gap-6">
        <Card>
          <h2 className="m-0 font-display text-[20px] font-semibold text-[var(--color-navy)]">Create category</h2>
          <form action={upsertCategory} className="mt-5 grid gap-4">
            <input type="hidden" name="redirectTo" value="/admin/categories" />
            <div className="grid gap-4 md:grid-cols-2">
              <TextInput label="Name" name="name" placeholder="Food & Groceries" />
              <TextInput label="Slug" name="slug" placeholder="food-groceries" />
              <TextInput label="Image URL" name="imageUrl" placeholder="https://..." />
              <TextInput label="Sort order" name="sortOrder" type="number" defaultValue={0} />
            </div>
            <label className="block">
              <span className="mb-2 block text-[13px] font-semibold text-[var(--color-muted)]">Parent category</span>
              <select
                name="parentId"
                defaultValue=""
                className="w-full rounded-[14px] border border-[rgb(14_42_56_/_0.12)] bg-white px-4 py-3 text-[14px] text-[var(--color-navy)] outline-none"
              >
                <option value="">No parent</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </label>
            <TextArea label="Description" name="description" rows={3} />
            <div>
              <button
                type="submit"
                className="rounded-pill bg-mint px-4 py-2 text-sm font-semibold text-navy"
              >
                Save category
              </button>
            </div>
          </form>
        </Card>

        <div className="grid gap-4 xl:grid-cols-2">
          {categories.map((category) => (
            <Card key={category.id}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="m-0 font-display text-[20px] font-semibold text-[var(--color-navy)]">{category.name}</h2>
                  <p className="mt-1 text-[13px] text-[var(--color-muted)]">
                    /{category.slug} • {category._count.supplierProducts} linked products
                  </p>
                </div>
                <div className="rounded-full bg-[rgb(14_42_56_/_0.05)] px-3 py-1 text-[12px] text-[var(--color-muted)]">
                  sort {category.sortOrder}
                </div>
              </div>

              <form action={upsertCategory} className="mt-5 grid gap-4">
                <input type="hidden" name="categoryId" value={category.id} />
                <input type="hidden" name="redirectTo" value="/admin/categories" />
                <div className="grid gap-4 md:grid-cols-2">
                  <TextInput label="Name" name="name" defaultValue={category.name} />
                  <TextInput label="Slug" name="slug" defaultValue={category.slug} />
                  <TextInput label="Image URL" name="imageUrl" defaultValue={category.imageUrl} placeholder="https://..." />
                  <TextInput label="Sort order" name="sortOrder" type="number" defaultValue={category.sortOrder} />
                </div>
                <label className="block">
                  <span className="mb-2 block text-[13px] font-semibold text-[var(--color-muted)]">Parent category</span>
                  <select
                    name="parentId"
                    defaultValue={category.parentId ?? ""}
                    className="w-full rounded-[14px] border border-[rgb(14_42_56_/_0.12)] bg-white px-4 py-3 text-[14px] text-[var(--color-navy)] outline-none"
                  >
                    <option value="">No parent</option>
                    {categories
                      .filter((option) => option.id !== category.id)
                      .map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.name}
                        </option>
                      ))}
                  </select>
                </label>
                <TextArea label="Description" name="description" defaultValue={category.description} rows={3} />
                <div>
                  <button
                    type="submit"
                    className="rounded-pill border border-[rgb(14_42_56_/_0.12)] bg-white px-4 py-2 text-sm font-semibold text-navy"
                  >
                    Update category
                  </button>
                </div>
              </form>
            </Card>
          ))}
        </div>
      </div>
    </RolePage>
  );
}
