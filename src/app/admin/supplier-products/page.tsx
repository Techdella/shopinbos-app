import { updateSupplierProductStatus, updateSupplierProductTrend, bulkUpdateSupplierProductStatus } from "@/app/actions/admin";
import { AppPage, EmptyState, FilterChips, ListCard, PillLink, SearchForm, Thumb } from "@/components/app-kit";
import {
  CountRow,
  DecisionButtons,
  PRODUCT_STATUSES,
  ProductStatusPill,
  VerificationPill,
  adminFrame,
  buttonClass,
  fieldClass,
  formatDate,
  formatMoney,
  productStatusLabel,
  withParams,
} from "@/components/admin/AdminKit";
import { db } from "@/lib/db/client";
import { requireRole } from "@/lib/server-auth";

const productStatuses: readonly string[] = PRODUCT_STATUSES;

export default async function AdminSupplierProductsPage(props: { searchParams?: Promise<{ status?: string; q?: string }> }) {
  const user = await requireRole(["admin"], "/admin/login");

  const searchParams = await props.searchParams;
  const statusFilter = searchParams?.status && productStatuses.includes(searchParams.status) ? searchParams.status : undefined;
  const searchQuery = searchParams?.q?.trim() || undefined;

  const where: Record<string, unknown> = {};
  if (statusFilter) {
    where.status = statusFilter;
  }
  if (searchQuery) {
    where.OR = [
      { name: { contains: searchQuery, mode: "insensitive" } },
      { slug: { contains: searchQuery, mode: "insensitive" } },
    ];
  }

  const [products, byStatus, total, trending] = await Promise.all([
    db.supplierProduct.findMany({
      where,
      orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
      take: 100,
      select: {
        id: true,
        name: true,
        slug: true,
        images: true,
        status: true,
        wholesalePrice: true,
        currency: true,
        trendScore: true,
        updatedAt: true,
        supplier: { select: { displayName: true, verificationStatus: true, status: true } },
        category: { select: { name: true } },
      },
    }),
    db.supplierProduct.groupBy({ by: ["status"], _count: { _all: true } }),
    db.supplierProduct.count(),
    db.supplierProduct.count({ where: { trendScore: { gt: 0 } } }),
  ]);

  const countFor = (status: string) => byStatus.find((row) => row.status === status)?._count._all ?? 0;
  const selectedIds = products.map((p) => p.id);
  const backTo = withParams("/admin/supplier-products", { status: statusFilter, q: searchQuery });

  return (
    <AppPage
      frame={adminFrame(user, "Search supplier products")}
      title="Supplier products"
      sub="Publish what is ready, send back what is not, and nudge good products up the trending list."
      toolbar={
        <>
          <FilterChips
            items={[
              { label: "All", count: total, href: withParams("/admin/supplier-products", { q: searchQuery }), active: !statusFilter },
              ...(["pending_review", "published", "draft", "unpublished", "rejected"] as const).map((status) => ({
                label: productStatusLabel(status),
                count: countFor(status),
                href: withParams("/admin/supplier-products", { status, q: searchQuery }),
                active: statusFilter === status,
              })),
            ]}
          />
          <SearchForm action="/admin/supplier-products" defaultValue={searchQuery} placeholder="Search by name or slug" keep={{ status: statusFilter }} />
        </>
      }
    >
      <CountRow
        items={[
          { label: "All products", value: total },
          { label: "In review", value: countFor("pending_review") },
          { label: "Published", value: countFor("published") },
          { label: "Rejected", value: countFor("rejected") },
          { label: "Trending", value: trending, hint: "Trend score above 0" },
        ]}
      />

      {products.length === 0 ? (
        <EmptyState icon="bag" title={statusFilter || searchQuery ? "No products match" : "No supplier products yet"} action={statusFilter || searchQuery ? <PillLink href="/admin/supplier-products">Clear filters</PillLink> : undefined}>
          {statusFilter || searchQuery ? "Try another filter or search word." : "Products appear here once suppliers add them."}
        </EmptyState>
      ) : (
        <>
          <form action={bulkUpdateSupplierProductStatus} className="mb-4 flex flex-wrap items-center gap-2 rounded-[18px] border border-app-line bg-white px-4 py-3">
            {selectedIds.map((id) => (
              <input key={id} type="hidden" name="productIds" value={id} />
            ))}
            <input type="hidden" name="redirectTo" value={backTo} />
            <label htmlFor="bulk-product-status" className="mr-1 text-[14px] font-bold">
              Set all {products.length} shown to
            </label>
            <select id="bulk-product-status" name="status" required defaultValue="" className={`${fieldClass} w-auto min-w-[180px]`}>
              <option value="" disabled>Choose a status</option>
              {PRODUCT_STATUSES.map((s) => (
                <option key={s} value={s}>{productStatusLabel(s)}</option>
              ))}
            </select>
            <button type="submit" className={buttonClass("white", "sm")}>Apply to all</button>
          </form>

          <ListCard>
            {products.map((row) => (
              <li key={row.id} className="px-4 py-3.5 sm:px-5">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5 lg:flex-nowrap">
                  <Thumb src={row.images[0]} label={row.name} size={48} />
                  <div className="min-w-0 flex-1 basis-[200px]">
                    <div className="truncate text-[15px] font-extrabold">{row.name}</div>
                    <div className="truncate text-[13px] text-app-ink-soft">
                      {row.supplier.displayName} · {row.category.name} · /{row.slug}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <ProductStatusPill status={row.status} />
                    {row.supplier.verificationStatus !== "verified" && <VerificationPill status={row.supplier.verificationStatus} />}
                    {row.supplier.status !== "active" && <span className="text-[12.5px] font-bold text-app-danger">Supplier {row.supplier.status}</span>}
                  </div>
                  <div className="w-full text-[13px] text-app-ink-soft sm:w-auto lg:w-[150px] lg:shrink-0 lg:text-right">
                    <div className="text-[15px] font-extrabold text-app-ink">{formatMoney(row.wholesalePrice, row.currency)}</div>
                    trend {Math.round(row.trendScore)} · {formatDate(row.updatedAt)}
                  </div>
                  {row.status !== "published" && row.status !== "rejected" && (
                    <DecisionButtons
                      action={updateSupplierProductStatus}
                      fields={{ productId: row.id, redirectTo: backTo }}
                      approve="published"
                      reject="rejected"
                      subject={row.name}
                    />
                  )}
                </div>

                <details className="group mt-2">
                  <summary className="inline-flex min-h-[40px] cursor-pointer list-none items-center gap-1 rounded-full text-[13px] font-bold text-app-ink-soft hover:text-app-ink [&::-webkit-details-marker]:hidden">
                    <span className="group-open:hidden">Change status or trend score</span>
                    <span className="hidden group-open:inline">Hide</span>
                  </summary>
                  <div className="mt-1 flex flex-wrap items-end gap-3 rounded-[16px] bg-app-canvas p-3">
                    <form action={updateSupplierProductStatus} className="flex flex-wrap items-end gap-2">
                      <input type="hidden" name="productId" value={row.id} />
                      <input type="hidden" name="redirectTo" value={backTo} />
                      <div className="min-w-[180px]">
                        <label htmlFor={`status-${row.id}`} className="mb-1 block text-[12.5px] font-bold">Status</label>
                        <select id={`status-${row.id}`} name="status" defaultValue={row.status} className={fieldClass}>
                          {PRODUCT_STATUSES.map((status) => (
                            <option key={status} value={status}>{productStatusLabel(status)}</option>
                          ))}
                        </select>
                      </div>
                      <button type="submit" className={buttonClass("ink", "sm")}>Save status</button>
                    </form>
                    <form action={updateSupplierProductTrend} className="flex flex-wrap items-end gap-2">
                      <input type="hidden" name="productId" value={row.id} />
                      <input type="hidden" name="redirectTo" value={backTo} />
                      <div className="w-[130px]">
                        <label htmlFor={`trend-${row.id}`} className="mb-1 block text-[12.5px] font-bold">Trend (0-1000)</label>
                        <input id={`trend-${row.id}`} name="trendScore" type="number" min="0" max="1000" defaultValue={Math.round(row.trendScore)} className={fieldClass} />
                      </div>
                      <button type="submit" className={buttonClass("white", "sm")}>Save trend</button>
                    </form>
                  </div>
                </details>
              </li>
            ))}
          </ListCard>
        </>
      )}
    </AppPage>
  );
}
