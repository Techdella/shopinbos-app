import { db } from "@/lib/db/client";
import { requireRole } from "@/lib/server-auth";
import { DataTable, RolePage, formatDate } from "@/components/role/RolePage";

export default async function AdminMarketplacePage(props: { searchParams?: Promise<{ q?: string }> }) {
  await requireRole(["admin"], "/admin/login");

  const searchParams = await props.searchParams;
  const searchQuery = searchParams?.q?.trim();

  const where: Record<string, unknown> = {
    status: "published",
    supplier: { status: "active", verificationStatus: "verified" },
  };
  if (searchQuery) {
    where.OR = [
      { name: { contains: searchQuery, mode: "insensitive" } },
      { slug: { contains: searchQuery, mode: "insensitive" } },
    ];
  }

  const products = await db.supplierProduct.findMany({
    where,
    orderBy: [{ trendScore: "desc" }, { updatedAt: "desc" }],
    take: 50,
    select: {
      id: true,
      name: true,
      slug: true,
      trendScore: true,
      updatedAt: true,
      supplier: { select: { displayName: true } },
      category: { select: { name: true } },
    },
  });

  return (
    <RolePage
      role="admin"
      eyebrow="Admin marketplace"
      title="Public Marketplace"
      description="These are the records eligible for WordPress sync."
      metrics={[
        { label: "Public products", value: String(products.length) },
        { label: "Trending", value: String(products.filter((product) => product.trendScore > 0).length) },
      ]}
    >
      <div className="mb-4">
        <form method="GET" className="flex flex-wrap items-center gap-2">
          <input
            name="q"
            type="search"
            placeholder="Search public products..."
            defaultValue={searchQuery ?? ""}
            className="rounded-[12px] border border-[rgb(14_42_56_/_0.12)] bg-white px-3 py-2 text-[13px] text-navy outline-none min-w-[200px]"
          />
          <button type="submit" className="rounded-pill bg-mint px-4 py-2 text-sm font-semibold text-navy">
            Search
          </button>
          {searchQuery ? (
            <a href="/admin/marketplace" className="text-sm text-muted underline">Clear</a>
          ) : null}
        </form>
      </div>
      <DataTable
        title="WordPress-Sync Eligible Products"
        empty="No published products from verified active suppliers."
        rows={products}
        columns={[
          { label: "Product", value: (row) => row.name },
          { label: "Slug", value: (row) => row.slug },
          { label: "Supplier", value: (row) => row.supplier.displayName },
          { label: "Category", value: (row) => row.category.name },
          { label: "Trend", value: (row) => row.trendScore },
          { label: "Updated", value: (row) => formatDate(row.updatedAt) },
        ]}
      />
    </RolePage>
  );
}
