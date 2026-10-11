import { AppPage, EmptyState, ListCard, ListRow, Pill, PillLink, SearchForm, Thumb } from "@/components/app-kit";
import { CountRow, adminFrame, formatDate } from "@/components/admin/AdminKit";
import { db } from "@/lib/db/client";
import { requireRole } from "@/lib/server-auth";

export default async function AdminMarketplacePage(props: { searchParams?: Promise<{ q?: string }> }) {
  const user = await requireRole(["admin"], "/admin/login");

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
      images: true,
      trendScore: true,
      updatedAt: true,
      supplier: { select: { displayName: true } },
      category: { select: { name: true } },
    },
  });

  return (
    <AppPage
      frame={adminFrame(user, "Search public products")}
      title="Public marketplace"
      sub="Published products from active, verified suppliers. These are the records the website syncs and shows to buyers."
      toolbar={
        <>
          <div className="flex flex-wrap items-center gap-2 text-[14px] text-app-ink-soft">
            {searchQuery ? (
              <>
                Showing matches for <span className="font-bold text-app-ink">&ldquo;{searchQuery}&rdquo;</span>
                <PillLink href="/admin/marketplace" size="sm">Clear</PillLink>
              </>
            ) : (
              "Top 50 by trend score"
            )}
          </div>
          <SearchForm action="/admin/marketplace" defaultValue={searchQuery} placeholder="Search public products" />
        </>
      }
    >
      <CountRow
        items={[
          { label: "Public products shown", value: products.length },
          { label: "Trending", value: products.filter((product) => product.trendScore > 0).length, hint: "Trend score above 0" },
        ]}
      />

      {products.length === 0 ? (
        <EmptyState icon="monitor" title={searchQuery ? "No public products match" : "Nothing is public yet"}>
          {searchQuery ? "Try another search word." : "A product shows here once it is published and its supplier is active and verified."}
        </EmptyState>
      ) : (
        <ListCard>
          {products.map((row) => (
            <ListRow key={row.id}>
              <Thumb src={row.images[0]} label={row.name} size={48} />
              <div className="min-w-0 flex-1 basis-[200px]">
                <div className="truncate text-[15px] font-extrabold">{row.name}</div>
                <div className="truncate text-[13px] text-app-ink-soft">/{row.slug}</div>
              </div>
              <div className="min-w-0 text-[13.5px] sm:w-[220px] sm:shrink-0">
                <div className="truncate font-bold">{row.supplier.displayName}</div>
                <div className="truncate text-app-ink-soft">{row.category.name}</div>
              </div>
              <Pill tone={row.trendScore > 0 ? "accent" : "muted"}>Trend {Math.round(row.trendScore)}</Pill>
              <span className="shrink-0 text-[13px] text-app-ink-soft sm:w-[100px] sm:text-right">{formatDate(row.updatedAt)}</span>
            </ListRow>
          ))}
        </ListCard>
      )}
    </AppPage>
  );
}
