import { updateSupplierProductStatus, updateSupplierProductTrend, bulkUpdateSupplierProductStatus } from "@/app/actions/admin";
import { StatusPill } from "@/components/ops/OpsPrimitives";
import { DataTable, RolePage, formatDate, formatMoney } from "@/components/role/RolePage";
import { AutoSubmitSelect } from "@/components/ui/AutoSubmitSelect";
import { db } from "@/lib/db/client";
import { requireRole } from "@/lib/server-auth";

const productStatuses = ["draft", "pending_review", "published", "unpublished", "rejected"];

export default async function AdminSupplierProductsPage(props: { searchParams?: Promise<{ status?: string; q?: string }> }) {
  await requireRole(["admin"], "/admin/login");

  const searchParams = await props.searchParams;
  const statusFilter = searchParams?.status;
  const searchQuery = searchParams?.q?.trim();

  const where: Record<string, unknown> = {};
  if (statusFilter && productStatuses.includes(statusFilter)) {
    where.status = statusFilter;
  }
  if (searchQuery) {
    where.OR = [
      { name: { contains: searchQuery, mode: "insensitive" } },
      { slug: { contains: searchQuery, mode: "insensitive" } },
    ];
  }

  const products = await db.supplierProduct.findMany({
    where,
    orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
    take: 100,
    select: {
      id: true,
      name: true,
      slug: true,
      status: true,
      wholesalePrice: true,
      currency: true,
      trendScore: true,
      updatedAt: true,
      supplier: { select: { displayName: true, verificationStatus: true, status: true } },
      category: { select: { name: true } },
    },
  });

  const selectedIds = products.map((p) => p.id);

  return (
    <RolePage
      role="admin"
      eyebrow="Admin products"
      title="Supplier Products"
      description="Moderate publish status and trend score from the canonical product review queue."
      metrics={[
        { label: "Products", value: String(products.length) },
        { label: "Pending review", value: String(products.filter((product) => product.status === "pending_review").length) },
        { label: "Published", value: String(products.filter((product) => product.status === "published").length) },
        { label: "Trending", value: String(products.filter((product) => product.trendScore > 0).length) },
      ]}
    >
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <form method="GET" className="flex flex-wrap items-center gap-2">
          <AutoSubmitSelect
            name="status"
            defaultValue={statusFilter ?? ""}
            className="rounded-[12px] border border-[rgb(14_42_56_/_0.12)] bg-white px-3 py-2 text-[13px] text-navy outline-none"
          >
            <option value="">All statuses</option>
            {productStatuses.map((s) => (
              <option key={s} value={s}>{s.replace(/_/g, " ")}</option>
            ))}
          </AutoSubmitSelect>
          <input
            name="q"
            type="search"
            placeholder="Search products..."
            defaultValue={searchQuery ?? ""}
            className="rounded-[12px] border border-[rgb(14_42_56_/_0.12)] bg-white px-3 py-2 text-[13px] text-navy outline-none min-w-[200px]"
          />
          <button type="submit" className="rounded-pill bg-mint px-4 py-2 text-sm font-semibold text-navy">
            Filter
          </button>
          {statusFilter || searchQuery ? (
            <a href="/admin/supplier-products" className="text-sm text-muted underline">Clear</a>
          ) : null}
        </form>

        <form action={bulkUpdateSupplierProductStatus} className="flex items-center gap-2">
          {selectedIds.map((id) => (
            <input key={id} type="hidden" name="productIds" value={id} />
          ))}
          <input type="hidden" name="redirectTo" value="/admin/supplier-products" />
          <select
            name="status"
            className="rounded-[12px] border border-[rgb(14_42_56_/_0.12)] bg-white px-3 py-2 text-[13px] text-navy outline-none"
          >
            <option value="">Bulk action...</option>
            {productStatuses.map((s) => (
              <option key={s} value={s}>{s.replace(/_/g, " ")}</option>
            ))}
          </select>
          <button type="submit" className="rounded-pill border border-[rgb(14_42_56_/_0.12)] bg-white px-4 py-2 text-sm font-semibold text-navy">
            Apply to all
          </button>
        </form>
      </div>

      <DataTable
        title="Product Moderation"
        empty="No supplier products yet."
        rows={products}
        columns={[
          {
            label: "Product",
            value: (row) => (
              <div className="min-w-[180px]">
                <div className="font-semibold text-navy">{row.name}</div>
                <div className="text-xs text-muted">/{row.slug}</div>
              </div>
            ),
          },
          {
            label: "Supplier",
            value: (row) => (
              <div className="min-w-[160px]">
                <div>{row.supplier.displayName}</div>
                <div className="mt-1 flex flex-wrap gap-1">
                  <StatusPill status={row.supplier.verificationStatus} />
                  <StatusPill status={row.supplier.status} />
                </div>
              </div>
            ),
          },
          { label: "Category", value: (row) => row.category.name },
          { label: "Status", value: (row) => <StatusPill status={row.status} /> },
          { label: "Price", value: (row) => formatMoney(row.wholesalePrice, row.currency) },
          { label: "Trend", value: (row) => Math.round(row.trendScore) },
          { label: "Updated", value: (row) => formatDate(row.updatedAt) },
          {
            label: "Moderation",
            value: (row) => (
              <div className="grid min-w-[280px] gap-3">
                <form action={updateSupplierProductStatus} className="grid gap-2">
                  <input type="hidden" name="productId" value={row.id} />
                  <input type="hidden" name="redirectTo" value="/admin/supplier-products" />
                  <div className="flex items-center gap-2">
                    <select
                      name="status"
                      defaultValue={row.status}
                      className="flex-1 rounded-[12px] border border-[rgb(14_42_56_/_0.12)] bg-white px-3 py-2 text-[13px] text-navy outline-none"
                    >
                      {productStatuses.map((status) => (
                        <option key={status} value={status}>
                          {status.replace(/_/g, " ")}
                        </option>
                      ))}
                    </select>
                    <button
                      type="submit"
                      className="rounded-pill bg-mint px-4 py-2 text-sm font-semibold text-navy"
                    >
                      Save
                    </button>
                  </div>
                  <input
                    name="note"
                    placeholder="Moderation note..."
                    className="rounded-[12px] border border-[rgb(14_42_56_/_0.12)] bg-white px-3 py-1.5 text-[12px] text-navy outline-none"
                  />
                </form>

                <form action={updateSupplierProductTrend} className="grid gap-2">
                  <input type="hidden" name="productId" value={row.id} />
                  <input type="hidden" name="redirectTo" value="/admin/supplier-products" />
                  <div className="flex items-center gap-2">
                    <input
                      name="trendScore"
                      type="number"
                      min="0"
                      max="1000"
                      defaultValue={Math.round(row.trendScore)}
                      className="flex-1 rounded-[12px] border border-[rgb(14_42_56_/_0.12)] bg-white px-3 py-2 text-[13px] text-navy outline-none"
                    />
                    <button
                      type="submit"
                      className="rounded-pill border border-[rgb(14_42_56_/_0.12)] bg-white px-4 py-2 text-sm font-semibold text-navy"
                    >
                      Save
                    </button>
                  </div>
                </form>
              </div>
            ),
          },
        ]}
      />
    </RolePage>
  );
}
