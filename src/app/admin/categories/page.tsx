import { upsertCategory } from "@/app/actions/admin";
import { AppPage, Card, CardHead, EmptyState, ListCard, Pill, SplitLayout, Thumb } from "@/components/app-kit";
import { CountRow, Field, adminFrame, buttonClass, fieldClass } from "@/components/admin/AdminKit";
import { db } from "@/lib/db/client";
import { requireRole } from "@/lib/server-auth";

type CategoryRow = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  imageUrl: string | null;
  parentId: string | null;
  sortOrder: number;
};

/** Create (no category) or edit form; posts to upsertCategory like before. */
function CategoryForm({ category, options, idPrefix }: { category?: CategoryRow; options: Array<{ id: string; name: string }>; idPrefix: string }) {
  return (
    <form action={upsertCategory} className="grid gap-4">
      {category && <input type="hidden" name="categoryId" value={category.id} />}
      <input type="hidden" name="redirectTo" value="/admin/categories" />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" htmlFor={`${idPrefix}-name`}>
          <input id={`${idPrefix}-name`} name="name" defaultValue={category?.name} placeholder="Food & Groceries" className={fieldClass} />
        </Field>
        <Field label="Slug" htmlFor={`${idPrefix}-slug`}>
          <input id={`${idPrefix}-slug`} name="slug" defaultValue={category?.slug} placeholder="food-groceries" className={fieldClass} />
        </Field>
        <Field label="Image URL" htmlFor={`${idPrefix}-image`}>
          <input id={`${idPrefix}-image`} name="imageUrl" defaultValue={category?.imageUrl ?? ""} placeholder="https://..." className={fieldClass} />
        </Field>
        <Field label="Sort order" htmlFor={`${idPrefix}-sort`}>
          <input id={`${idPrefix}-sort`} name="sortOrder" type="number" defaultValue={category?.sortOrder ?? 0} className={fieldClass} />
        </Field>
      </div>
      <Field label="Parent category" htmlFor={`${idPrefix}-parent`}>
        <select id={`${idPrefix}-parent`} name="parentId" defaultValue={category?.parentId ?? ""} className={fieldClass}>
          <option value="">No parent</option>
          {options.map((option) => (
            <option key={option.id} value={option.id}>{option.name}</option>
          ))}
        </select>
      </Field>
      <Field label="Description" htmlFor={`${idPrefix}-description`}>
        <textarea id={`${idPrefix}-description`} name="description" rows={3} defaultValue={category?.description ?? ""} className={`${fieldClass} py-2.5 leading-[1.5]`} />
      </Field>
      <div>
        <button type="submit" className={buttonClass(category ? "ink" : "accent")}>{category ? "Save changes" : "Save category"}</button>
      </div>
    </form>
  );
}

export default async function AdminCategoriesPage() {
  const user = await requireRole(["admin"], "/admin/login");

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

  const names = new Map(categories.map((category) => [category.id, category.name]));
  const linked = categories.reduce((total, category) => total + category._count.supplierProducts, 0);

  return (
    <AppPage
      frame={adminFrame(user, "Search categories")}
      title="Categories"
      sub="The groups buyers browse on the public marketplace. Suppliers file products under them and the website builds a landing page for each."
    >
      <CountRow
        items={[
          { label: "Categories", value: categories.length },
          { label: "Top level", value: categories.filter((category) => !category.parentId).length },
          { label: "Linked products", value: linked },
        ]}
      />

      <SplitLayout
        main={
          categories.length === 0 ? (
            <EmptyState icon="box" title="No categories yet">Create the first one with the form. It appears on the marketplace straight away.</EmptyState>
          ) : (
            <ListCard>
              {categories.map((category) => (
                <li key={category.id} className="px-4 py-3.5 sm:px-5">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2 sm:flex-nowrap">
                    <Thumb src={category.imageUrl} label={category.name} size={44} />
                    <div className="min-w-0 flex-1">
                      <h2 className="m-0 truncate text-[15px] font-extrabold">{category.name}</h2>
                      <div className="truncate text-[13px] text-app-ink-soft">
                        /{category.slug}
                        {category.parentId && ` · under ${names.get(category.parentId) ?? "another category"}`}
                      </div>
                    </div>
                    <Pill tone={category._count.supplierProducts > 0 ? "success" : "muted"}>{category._count.supplierProducts} products</Pill>
                    <span className="shrink-0 text-[13px] text-app-ink-soft">Order {category.sortOrder}</span>
                  </div>
                  <details className="group mt-2">
                    <summary className="inline-flex min-h-[40px] cursor-pointer list-none items-center rounded-full text-[13px] font-bold text-app-ink-soft hover:text-app-ink [&::-webkit-details-marker]:hidden">
                      <span className="group-open:hidden">Edit {category.name}</span>
                      <span className="hidden group-open:inline">Close</span>
                    </summary>
                    <div className="mt-1 rounded-[16px] bg-app-canvas p-4">
                      <CategoryForm
                        category={category}
                        idPrefix={`cat-${category.id}`}
                        options={categories.filter((option) => option.id !== category.id)}
                      />
                    </div>
                  </details>
                </li>
              ))}
            </ListCard>
          )
        }
        side={
          <Card className="p-5">
            <CardHead title="New category" sub="Slug is made from the name if you leave it empty." className="mb-4" />
            <CategoryForm idPrefix="new-category" options={categories} />
          </Card>
        }
      />
    </AppPage>
  );
}
