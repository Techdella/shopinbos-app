import Link from "next/link";
import { redirect } from "next/navigation";
import { AppPage, EmptyState, FilterChips, ListCard, ListRow, Pill, PillLink, SearchForm, Thumb, cx } from "@/components/app-kit";
import { Icon } from "@/components/ui/Icon";
import { sellerFrame } from "@/components/seller-core";
import { requireRole } from "@/lib/server-auth";
import { getSellerWorkspace } from "@/lib/workspace";
import { db } from "@/lib/db/client";
import { stockLabel } from "@/lib/dashboard/compute";
import { naira } from "@shared/onboarding";

export const dynamic = "force-dynamic";

type ProductRow = {
  status: string;
  fulfillmentType: string;
  inventoryType: string;
  currentStock: number;
  lowStockThreshold: number;
};

const isLive = (p: ProductRow) => p.status === "active" || p.status === "published";
const isDropship = (p: ProductRow) => p.fulfillmentType === "dropship" || p.inventoryType === "dropshipping";
const isLow = (p: ProductRow) => !isDropship(p) && p.currentStock <= p.lowStockThreshold;

// Old links used ?status=active|draft|archived; they map onto the new chips.
const FILTERS: Array<{ key: string; label: string; test: (p: ProductRow) => boolean }> = [
  { key: "all", label: "All", test: (p) => p.status !== "archived" },
  { key: "live", label: "Live", test: isLive },
  { key: "draft", label: "Drafts", test: (p) => p.status === "draft" },
  { key: "low_stock", label: "Low stock", test: (p) => p.status !== "archived" && isLow(p) },
  { key: "dropship", label: "Sell without stock", test: (p) => p.status !== "archived" && isDropship(p) },
  { key: "archived", label: "Archived", test: (p) => p.status === "archived" },
];

const VISIBILITY = [
  { key: "all", label: "Anywhere" },
  { key: "storefront", label: "On storefront" },
  { key: "featured", label: "Featured" },
  { key: "collection_only", label: "Collections only" },
  { key: "hidden", label: "Hidden" },
];

function variantCount(variants: unknown) {
  return Array.isArray(variants) ? variants.length : 0;
}

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; filter?: string; visibility?: string; q?: string }>
}) {
  const { status, filter: rawFilter, visibility, q } = await searchParams;
  const user = await requireRole(["seller"], "/login");
  const workspace = await getSellerWorkspace(user.id);
  if (!workspace) return null;
  if (!workspace.store) redirect("/builder?firstRun=1");

  const storeId = workspace.store.id;
  const filterKey = rawFilter ?? (status === "active" || status === "published" ? "live" : status);
  const filter = FILTERS.find((item) => item.key === filterKey) ?? FILTERS[0];
  const visibilityKey = VISIBILITY.some((item) => item.key === visibility) ? visibility! : "all";
  const query = q?.trim() ?? "";

  const all = await db.storeProduct.findMany({
    where: { storeId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      sku: true,
      images: true,
      retailPrice: true,
      compareAtPrice: true,
      currency: true,
      status: true,
      visibility: true,
      fulfillmentType: true,
      inventoryType: true,
      currentStock: true,
      lowStockThreshold: true,
      soldStock: true,
      supplierStock: true,
      variants: true,
      featured: true,
      category: { select: { name: true } },
    },
  });

  const needle = query.toLowerCase();
  const products = all.filter(
    (p) =>
      filter.test(p) &&
      (visibilityKey === "all" || p.visibility === visibilityKey) &&
      (!needle || p.name.toLowerCase().includes(needle) || (p.sku ?? "").toLowerCase().includes(needle)),
  );

  const href = (next: { filter?: string; visibility?: string }) => {
    const params = new URLSearchParams();
    const f = next.filter ?? filter.key;
    const v = next.visibility ?? visibilityKey;
    if (f !== "all") params.set("filter", f);
    if (v !== "all") params.set("visibility", v);
    if (query) params.set("q", query);
    const qs = params.toString();
    return `/products${qs ? `?${qs}` : ""}`;
  };

  const chips = FILTERS.filter((item) => item.key !== "archived" || filter.key === "archived" || all.some(item.test)).map((item) => ({
    label: item.label,
    href: href({ filter: item.key }),
    count: item.key === "all" ? all.filter(item.test).length : undefined,
    active: item.key === filter.key,
  }));

  const money = (amount: number, currency: string) => (currency === "NGN" ? naira(amount) : `${currency} ${Math.round(amount).toLocaleString("en-NG")}`);

  return (
    <AppPage
      frame={sellerFrame(user, workspace.store)}
      title="Products"
      actions={
        <>
          <PillLink href="/products/import" icon="upload">Import</PillLink>
          <a
            href="/api/products/export"
            download
            className="inline-flex min-h-[44px] shrink-0 items-center justify-center gap-2 rounded-full border border-app-line bg-white px-5 text-[14px] font-extrabold text-app-ink no-underline transition hover:border-app-line-strong"
          >
            <Icon name="download" size={16} />
            Export
          </a>
          <PillLink href="/products/new" tone="accent" icon="plus">Add product</PillLink>
        </>
      }
      toolbar={
        <>
          <FilterChips items={chips} />
          <SearchForm
            action="/products"
            defaultValue={query}
            placeholder="Search name or product code"
            keep={{ filter: filter.key === "all" ? undefined : filter.key, visibility: visibilityKey === "all" ? undefined : visibilityKey }}
          />
        </>
      }
    >
      <nav aria-label="Where products show" className="-mt-1 mb-4 flex flex-wrap items-center gap-x-1 gap-y-1 text-[13px] text-app-ink-soft">
        <span className="mr-1">Showing:</span>
        {VISIBILITY.map((item) => (
          <Link
            key={item.key}
            href={href({ visibility: item.key })}
            aria-current={item.key === visibilityKey ? "page" : undefined}
            className={cx(
              "inline-flex min-h-[32px] items-center rounded-full px-2.5 no-underline",
              item.key === visibilityKey ? "bg-white font-bold text-app-ink ring-1 ring-app-line" : "text-app-ink-soft hover:text-app-ink",
            )}
          >
            {item.label}
          </Link>
        ))}
      </nav>

      {all.length === 0 ? (
        <EmptyState
          icon="bag"
          title="No products yet"
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <PillLink href="/products/new" tone="ink" icon="plus">Add product</PillLink>
              <PillLink href="/products/import" icon="upload">Import a CSV</PillLink>
            </div>
          }
        >
          Add your first product, import a list, or pick products to sell without stock from the marketplace.
        </EmptyState>
      ) : products.length === 0 ? (
        <EmptyState icon="search" title="No products match" action={<PillLink href="/products">Show all products</PillLink>}>
          {query ? `Nothing matches “${query}” here.` : "Try a different filter."}
        </EmptyState>
      ) : (
        <ListCard>
          {products.map((p) => {
            const dropship = isDropship(p);
            const stock = stockLabel(p);
            const variants = variantCount(p.variants);
            const detail = [variants > 0 ? `${variants} ${variants === 1 ? "size or colour" : "sizes and colours"}` : p.category?.name ?? p.sku, dropship ? "Sell without stock" : "Own stock"].filter(Boolean).join(" · ");
            const statusPill = isLive(p) ? (
              <Pill tone="success">Live</Pill>
            ) : p.status === "archived" ? (
              <Pill tone="muted">Archived</Pill>
            ) : (
              <Pill tone="muted">Draft</Pill>
            );
            const stockText = dropship
              ? p.supplierStock ? `${p.supplierStock} at supplier` : "Supplier stock"
              : stock.label;
            return (
              <ListRow key={p.id} href={`/products/${p.id}`}>
                <div className="flex w-full min-w-0 items-start gap-3.5 md:items-center md:gap-4">
                  <Thumb src={p.images[0]} label={p.name} />
                  <div className="grid min-w-0 flex-1 items-center gap-x-5 gap-y-2 md:grid-cols-[minmax(0,1.6fr)_minmax(0,1.2fr)_auto] xl:grid-cols-[minmax(0,2fr)_110px_minmax(0,0.9fr)_minmax(0,0.8fr)_120px]">
                    <div className="min-w-0">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="truncate text-[15px] font-extrabold">{p.name}</span>
                        {p.featured && <span className="shrink-0 text-app-accent" title="Featured"><Icon name="star" size={14} /><span className="sr-only">Featured</span></span>}
                      </div>
                      <div className="truncate text-[13px] text-app-ink-soft">
                        {detail}
                        {p.visibility === "hidden" && isLive(p) ? " · Hidden from store" : ""}
                      </div>
                    </div>
                    <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5 text-[13.5px] xl:contents">
                      <span>{statusPill}</span>
                      <span className={cx("font-semibold", !dropship && stock.low ? "text-app-accent-ink" : "text-app-ink-soft")}>{stockText}</span>
                      <span className="text-app-ink-soft">{p.soldStock.toLocaleString("en-NG")} sold</span>
                    </div>
                    <div className="text-[15px] font-extrabold md:text-right">
                      {money(p.retailPrice, p.currency)}
                      {p.compareAtPrice && p.compareAtPrice > p.retailPrice ? (
                        <span className="ml-1.5 text-[12.5px] font-semibold text-app-ink-faint line-through">{money(p.compareAtPrice, p.currency)}</span>
                      ) : null}
                    </div>
                  </div>
                </div>
              </ListRow>
            );
          })}
        </ListCard>
      )}
    </AppPage>
  );
}
