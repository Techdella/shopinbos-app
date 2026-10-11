import Image from "next/image";
import Link from "next/link";
import { addMarketplaceProduct } from "@/app/actions/workspace";
import { requireRole } from "@/lib/server-auth";
import { getSellerWorkspace, safeQuery } from "@/lib/workspace";
import { db } from "@/lib/db/client";
import { redirect } from "next/navigation";
import { SellerPage, storeSummary } from "@/components/seller/SellerPage";
import { AssistantNote, Card, CardHead, EmptyState, FilterChips, Pill, PillLink, SearchForm } from "@/components/app-kit";
import { Icon } from "@/components/ui/Icon";
import { MarketplaceFilters } from "./MarketplaceFilters";

export const dynamic = "force-dynamic";

function fmtMoney(n: number) {
  return "₦" + Math.round(n).toLocaleString("en-NG");
}

function calcMargin(wholesale: number, retail: number) {
  if (!retail || retail === 0) return 0;
  return Math.round(((retail - wholesale) / retail) * 100);
}

type PageProps = {
  searchParams?: Promise<{ category?: string; country?: string; fulfilment?: string; margin?: string; near?: string; q?: string; product?: string; trending?: string; supplier?: string }>;
};

function norm(value?: string | null) {
  return (value ?? "").trim().toLowerCase();
}

/** Marketplace URL that keeps the current filters and changes one of them. */
function withParam(params: Record<string, string | undefined>, key: string, value: string | undefined) {
  const next = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...params, [key]: value })) {
    if (v && k !== "product") next.set(k, v);
  }
  const qs = next.toString();
  return qs ? `/marketplace?${qs}` : "/marketplace";
}

export default async function MarketplacePage({ searchParams }: PageProps) {
  const params = (await searchParams) ?? {};
  const user = await requireRole(["seller"], "/login");
  const workspace = await getSellerWorkspace(user.id);
  if (!workspace) return null;
  if (!workspace.store) redirect("/builder?firstRun=1");

  const store = workspace.store;

  const [verifiedSupplierCount, allProducts, inStore] = await Promise.all([
    safeQuery(() => db.supplier.count({ where: { status: "active", verificationStatus: "verified" } }), 0),
    safeQuery(() => db.supplierProduct.findMany({
      where: { status: "published", supplier: { status: "active", verificationStatus: "verified" } },
      include: { supplier: true, category: true },
      orderBy: [{ trendScore: "desc" }, { createdAt: "desc" }],
      take: 50,
    }), []),
    safeQuery(() => db.storeProduct.findMany({ where: { storeId: store.id, supplierProductId: { not: null } }, select: { supplierProductId: true } }), []),
  ]);
  const addedIds = new Set(inStore.map((row) => row.supplierProductId));

  const selectedCategory = norm(params.category);
  const selectedCountry = norm(params.country);
  const selectedFulfilment = norm(params.fulfilment);
  const selectedMargin = params.margin ? parseInt(params.margin) : 0;
  const selectedNear = norm(params.near);
  const searchQuery = norm(params.q);
  const trendingOnly = params.trending === "true";
  const selectedSupplier = params.supplier?.trim() ?? "";
  const supplierName = selectedSupplier ? allProducts.find((p) => p.supplier?.slug === selectedSupplier)?.supplier.displayName ?? selectedSupplier : "";
  const storeCity = norm(store.city);
  const storeCountry = norm(store.country);
  const preferredCategories = [
    ...new Set(
      workspace.storeProducts
        .map((product) => product.supplierProduct?.category?.name)
        .filter((name): name is string => Boolean(name)),
    ),
  ];

  // Filter options come from what is actually listed.
  const categoryNames = [...new Set(allProducts.map((p) => p.category?.name).filter((n): n is string => Boolean(n)))].sort();
  const countryNames = [...new Set(allProducts.map((p) => p.supplier?.country).filter((n): n is string => Boolean(n)))].sort();

  let products = allProducts;
  if (selectedCategory) {
    products = products.filter((p) => norm(p.category?.name) === selectedCategory);
  }
  if (selectedCountry) {
    products = products.filter((p) => norm(p.supplier?.country) === selectedCountry);
  }
  if (selectedNear === "city" && storeCity) {
    products = products.filter((p) => norm(p.supplier?.city) === storeCity);
  }
  if (selectedNear === "country" && storeCountry) {
    products = products.filter((p) => norm(p.supplier?.country) === storeCountry);
  }
  if (selectedFulfilment === "dropship") {
    products = products.filter((p) => p.dropshipAvailable);
  }
  if (selectedFulfilment === "wholesale") {
    products = products.filter((p) => p.bulkOrderAvailable);
  }
  if (selectedFulfilment === "sample") {
    products = products.filter((p) => p.sampleAvailable);
  }
  if (selectedMargin > 0) {
    products = products.filter((p) => calcMargin(Number(p.wholesalePrice), Number(p.suggestedRetailPrice)) >= selectedMargin);
  }
  if (trendingOnly) {
    products = products.filter((p) => p.trendScore > 0);
  }
  if (selectedSupplier) {
    products = products.filter((p) => p.supplier?.slug === selectedSupplier);
  }
  if (searchQuery) {
    products = products.filter((p) => [
      p.name,
      p.description,
      p.category?.name,
      p.supplier?.displayName,
      p.supplier?.city,
      p.supplier?.country,
    ].some((value) => norm(value).includes(searchQuery)));
  }

  products = [...products].sort((a, b) => {
    if (trendingOnly) return Number(b.trendScore) - Number(a.trendScore);
    const localScore = (product: typeof products[number]) => {
      const cityScore = storeCity && norm(product.supplier?.city) === storeCity ? 3 : 0;
      const countryScore = storeCountry && norm(product.supplier?.country) === storeCountry ? 2 : 0;
      const categoryScore = preferredCategories.some((category) => norm(category) === norm(product.category?.name)) ? 1 : 0;
      return cityScore + countryScore + categoryScore;
    };
    return localScore(b) - localScore(a) || Number(b.trendScore) - Number(a.trendScore);
  });

  const trendingProducts = workspace.trendingProducts;
  const nearbySupplierCount = new Set(
    allProducts
      .filter((product) =>
        (storeCity && norm(product.supplier?.city) === storeCity) ||
        (storeCountry && norm(product.supplier?.country) === storeCountry),
      )
      .map((product) => product.supplierId),
  ).size;
  const peggySuggestions = [
    preferredCategories.length > 0
      ? `Restock around ${preferredCategories.slice(0, 2).join(" and ")} because your catalogue already leans there.`
      : "Start with high-margin dropship products so you can test demand before buying stock.",
    nearbySupplierCount > 0
      ? `${nearbySupplierCount} verified supplier${nearbySupplierCount === 1 ? "" : "s"} match your store location. Pick them for faster delivery.`
      : "No nearby supplier yet, so compare suppliers across the country by trust score and reply time.",
  ];

  const detail = params.product ? allProducts.find((p) => p.id === params.product) ?? null : null;
  const keep: Record<string, string | undefined> = {
    category: selectedCategory || undefined,
    country: selectedCountry || undefined,
    fulfilment: selectedFulfilment || undefined,
    margin: selectedMargin > 0 ? String(selectedMargin) : undefined,
    near: selectedNear || undefined,
    q: params.q || undefined,
    trending: trendingOnly ? "true" : undefined,
    supplier: selectedSupplier || undefined,
  };
  const activeFilters = [
    selectedNear && { label: `Near: ${selectedNear === "city" ? store.city ?? "my city" : store.country}`, key: "near" },
    selectedFulfilment && { label: selectedFulfilment === "sample" ? "Sample first" : selectedFulfilment.charAt(0).toUpperCase() + selectedFulfilment.slice(1), key: "fulfilment" },
    selectedCountry && { label: selectedCountry.replace(/\b\w/g, (c) => c.toUpperCase()), key: "country" },
    selectedMargin > 0 && { label: `Margin ${selectedMargin}%+`, key: "margin" },
    trendingOnly && { label: "Trending", key: "trending" },
    selectedSupplier && { label: `From ${supplierName}`, key: "supplier" },
    searchQuery && { label: `“${params.q}”`, key: "q" },
  ].filter((f): f is { label: string; key: string } => Boolean(f));

  const filters = (
    <MarketplaceFilters
      groups={[
        { l: "Near me", name: "near", opts: [["Same city", "city"], ["Same country", "country"]] },
        { l: "How you sell it", name: "fulfilment", opts: [["Dropship", "dropship"], ["Wholesale", "wholesale"], ["Sample first", "sample"]] },
        ...(countryNames.length > 1 ? [{ l: "Country", name: "country", opts: countryNames.map((c) => [c, c.toLowerCase()]) }] : []),
        { l: "Margin", name: "margin", opts: [["40%+", "40"], ["50%+", "50"], ["60%+", "60"]] },
      ]}
      selected={{
        near: selectedNear,
        fulfilment: selectedFulfilment,
        country: selectedCountry,
        category: selectedCategory,
        margin: selectedMargin > 0 ? String(selectedMargin) : "",
      }}
      query={params.q}
      keep={{ category: keep.category, supplier: keep.supplier, trending: keep.trending }}
    />
  );

  return (
    <SellerPage
      user={user}
      store={storeSummary(store)}
      title="Find products"
      sub={`Products from ${verifiedSupplierCount.toLocaleString()} verified suppliers. Add dropship stock to your store in two taps, or buy wholesale.`}
      actions={
        <>
          <PillLink href="/home/settings?tab=Notifications" icon="bell">Alerts</PillLink>
          <PillLink href="/home/peggy?task=source_products" tone="accent" icon="sparkle">Ask Peggy to source</PillLink>
        </>
      }
    >
      <div className="grid gap-5">
        <FilterChips
          items={[
            { label: "Products", href: "/marketplace", active: true },
            { label: "Suppliers", href: "/marketplace/suppliers" },
            { label: "Delivery partners", href: "/marketplace/logistics" },
          ]}
        />

        <AssistantNote
          who="peggy"
          action={<PillLink href={`/home/peggy?task=marketplace&city=${encodeURIComponent(store.city ?? "")}&country=${encodeURIComponent(store.country)}`} size="sm" tone="ink">Ask Peggy</PillLink>}
        >
          {peggySuggestions.join(" ")}
        </AssistantNote>

        {detail && (
          <Card className="overflow-hidden">
            <div className="grid gap-0 md:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
              <div className="relative aspect-square bg-app-canvas md:aspect-auto md:min-h-[300px]">
                {detail.images?.[0] ? (
                  <Image src={detail.images[0]} alt={detail.name} fill sizes="(min-width: 768px) 320px, 100vw" className="object-cover" unoptimized />
                ) : (
                  <span className="absolute inset-0 grid place-items-center text-app-ink-faint"><Icon name="image" size={40} /></span>
                )}
              </div>
              <div className="grid content-start gap-4 p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="m-0 text-[22px] font-extrabold tracking-[-0.4px]">{detail.name}</h2>
                    <p className="mb-0 mt-1 text-[14px] text-app-ink-soft">
                      <Link href={`/suppliers/${detail.supplier.slug}`} className="font-bold text-app-ink no-underline hover:underline">{detail.supplier.displayName}</Link> · {detail.supplier.city}, {detail.supplier.country}
                    </p>
                  </div>
                  <Link href={withParam(keep, "product", undefined)} aria-label="Close product details" className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-app-line hover:border-app-line-strong">
                    <Icon name="x" size={16} />
                  </Link>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {detail.dropshipAvailable && <Pill tone="success">Dropship</Pill>}
                  {detail.bulkOrderAvailable && <Pill tone="info">Wholesale</Pill>}
                  {detail.sampleAvailable && <Pill>Samples</Pill>}
                  {detail.category?.name && <Pill>{detail.category.name}</Pill>}
                </div>
                <dl className="m-0 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div><dt className="text-[13px] text-app-ink-soft">You pay</dt><dd className="m-0 text-[18px] font-extrabold">{fmtMoney(detail.wholesalePrice)}</dd></div>
                  <div><dt className="text-[13px] text-app-ink-soft">Sell for</dt><dd className="m-0 text-[18px] font-extrabold">{fmtMoney(detail.suggestedRetailPrice)}</dd></div>
                  <div><dt className="text-[13px] text-app-ink-soft">You keep</dt><dd className="m-0 text-[18px] font-extrabold text-app-success">{fmtMoney(detail.suggestedRetailPrice - detail.wholesalePrice)}</dd></div>
                  <div><dt className="text-[13px] text-app-ink-soft">Minimum order</dt><dd className="m-0 text-[18px] font-extrabold">{detail.moq}</dd></div>
                </dl>
                <p className="m-0 whitespace-pre-line text-[14.5px] leading-[1.6]">{detail.description}</p>
                <p className="m-0 text-[13.5px] text-app-ink-soft">
                  {detail.stockQuantity > 0 ? `${detail.stockQuantity.toLocaleString()} in stock` : "Stock not listed"}
                  {detail.processingTime ? ` · ready in ${detail.processingTime}` : ""}
                  {detail.deliveryRegions.length > 0 ? ` · delivers to ${detail.deliveryRegions.join(", ")}` : ""}
                </p>
                <div>
                  {addedIds.has(detail.id) ? (
                    <Pill tone="success" dot>In your store</Pill>
                  ) : (
                    <form action={addMarketplaceProduct}>
                      <input type="hidden" name="supplierProductId" value={detail.id} />
                      <button type="submit" className="inline-flex min-h-[44px] items-center gap-2 rounded-full bg-app-accent px-5 text-[14px] font-extrabold text-white hover:brightness-95">
                        <Icon name="plus" size={16} /> Sell this in my store
                      </button>
                    </form>
                  )}
                </div>
              </div>
            </div>
          </Card>
        )}

        {trendingProducts.length > 0 && !trendingOnly && (
          <Card className="p-5">
            <CardHead
              title="Trending this week"
              sub={`Top dropship picks${trendingProducts[0]?.category?.name ? ` · ${trendingProducts[0].category.name}` : ""}`}
              action={<PillLink href="/marketplace?trending=true" size="sm">See all trending</PillLink>}
            />
            <ul className="-mx-1 mt-4 flex list-none gap-3 overflow-x-auto px-1 pb-1">
              {trendingProducts.slice(0, 6).map((p) => (
                <li key={p.id} className="w-[180px] shrink-0">
                  <Link href={withParam(keep, "product", p.id)} className="block text-app-ink no-underline">
                    <div className="relative aspect-[5/4] overflow-hidden rounded-[14px] bg-app-canvas">
                      {p.images?.[0] ? (
                        <Image src={p.images[0]} alt="" fill sizes="180px" className="object-cover" unoptimized />
                      ) : (
                        <span className="absolute inset-0 grid place-items-center text-app-ink-faint"><Icon name="image" size={24} /></span>
                      )}
                    </div>
                    <div className="mt-2 truncate text-[13.5px] font-extrabold">{p.name}</div>
                    <div className="truncate text-[12.5px] text-app-ink-soft">{p.supplier.displayName}</div>
                    <div className="mt-0.5 text-[12.5px] font-bold text-app-success">{calcMargin(Number(p.wholesalePrice), Number(p.suggestedRetailPrice))}% margin</div>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <FilterChips
            items={[
              { label: "All", href: withParam(keep, "category", undefined), active: !selectedCategory },
              ...categoryNames.map((name) => ({ label: name, href: withParam(keep, "category", name.toLowerCase()), active: selectedCategory === name.toLowerCase() })),
            ]}
          />
          <SearchForm action="/marketplace" defaultValue={params.q} placeholder="Search products, suppliers, cities" keep={{ ...keep, q: undefined }} />
        </div>

        <div className="grid gap-5 lg:grid-cols-[260px_minmax(0,1fr)]">
          <aside className="hidden min-w-0 lg:block">
            <Card className="sticky top-4 p-5">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="m-0 text-[17px] font-extrabold">Filters</h2>
                <Link href="/marketplace" className="text-[14px] font-extrabold text-app-accent-ink no-underline hover:underline">Reset</Link>
              </div>
              {filters}
            </Card>
          </aside>

          <div className="grid min-w-0 content-start gap-4">
            <details className="rounded-[22px] border border-app-line bg-white lg:hidden">
              <summary className="flex min-h-[48px] cursor-pointer list-none items-center justify-between gap-3 px-5 text-[15px] font-extrabold">
                <span className="inline-flex items-center gap-2"><Icon name="filter" size={16} /> Filters{activeFilters.length ? ` · ${activeFilters.length}` : ""}</span>
                <Icon name="chevDown" size={16} />
              </summary>
              <div className="border-t border-app-line p-5">
                {filters}
                <Link href="/marketplace" className="mt-4 inline-block text-[14px] font-extrabold text-app-accent-ink no-underline">Reset filters</Link>
              </div>
            </details>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap gap-1.5">
                {activeFilters.map((f) => (
                  <Link key={f.key} href={withParam(keep, f.key, undefined)} className="inline-flex min-h-[34px] items-center gap-1.5 rounded-full bg-app-ink px-3 text-[13px] font-bold text-white no-underline" aria-label={`Remove filter ${f.label}`}>
                    {f.label} <Icon name="x" size={12} />
                  </Link>
                ))}
              </div>
              <span className="text-[14px] text-app-ink-soft">{products.length} product{products.length === 1 ? "" : "s"}</span>
            </div>

            {products.length === 0 ? (
              <EmptyState icon="search" title={allProducts.length ? "No products match" : "No products yet"} action={allProducts.length ? <PillLink href="/marketplace" tone="ink">Clear filters</PillLink> : undefined}>
                {allProducts.length ? "Try fewer filters or a different search." : "Once verified suppliers list products, they show up here."}
              </EmptyState>
            ) : (
              <ul className="m-0 grid list-none gap-3 p-0 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 min-[1900px]:grid-cols-5">
                {products.map((p) => {
                  const margin = calcMargin(Number(p.wholesalePrice), Number(p.suggestedRetailPrice));
                  const keepAmount = Number(p.suggestedRetailPrice) - Number(p.wholesalePrice);
                  const added = addedIds.has(p.id);
                  return (
                    <li key={p.id} className="flex min-w-0 flex-col rounded-[22px] border border-app-line bg-white p-2.5">
                      <Link href={withParam(keep, "product", p.id)} className="relative block aspect-square overflow-hidden rounded-[16px] bg-app-canvas" aria-label={`View ${p.name}`}>
                        {p.images?.[0] ? (
                          <Image src={p.images[0]} alt="" fill sizes="(min-width: 1536px) 22vw, (min-width: 1280px) 28vw, (min-width: 640px) 45vw, 100vw" className="object-cover" unoptimized />
                        ) : (
                          <span className="absolute inset-0 grid place-items-center text-app-ink-faint"><Icon name="image" size={32} /></span>
                        )}
                        <span className="absolute left-2.5 top-2.5 flex flex-wrap gap-1">
                          {p.dropshipAvailable && <span className="rounded-full bg-white/95 px-2.5 py-1 text-[11.5px] font-bold">Dropship</span>}
                          {!p.dropshipAvailable && p.bulkOrderAvailable && <span className="rounded-full bg-white/95 px-2.5 py-1 text-[11.5px] font-bold">Wholesale</span>}
                        </span>
                      </Link>
                      <div className="flex flex-1 flex-col px-1.5 pb-1 pt-3">
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="m-0 min-w-0 text-[15px] font-extrabold leading-tight">{p.name}</h3>
                          {p.supplier.ratingCount > 0 && (
                            <span className="shrink-0 text-[12.5px] font-bold text-[#8A5A00]">★ {p.supplier.rating.toFixed(1)}</span>
                          )}
                        </div>
                        <p className="mb-0 mt-1 truncate text-[13px] text-app-ink-soft">
                          <Link href={`/suppliers/${p.supplier.slug}`} className="text-app-ink-soft no-underline hover:underline">{p.supplier.displayName}</Link> · {p.supplier.city}
                        </p>
                        <p className="mb-0 mt-1 text-[12.5px] text-app-ink-soft">
                          You pay {fmtMoney(Number(p.wholesalePrice))} · min. {p.moq}{p.processingTime ? ` · ready in ${p.processingTime}` : ""}
                        </p>
                        <div className="mt-auto flex items-end justify-between gap-2 pt-3">
                          <div className="min-w-0">
                            <div className="truncate text-[12.5px] text-app-ink-soft">Sell for {fmtMoney(Number(p.suggestedRetailPrice))}</div>
                            <div className="truncate text-[14.5px] font-extrabold text-app-success">You keep {fmtMoney(keepAmount)} <span className="font-bold">· {margin}%</span></div>
                          </div>
                          {added ? (
                            <span className="inline-flex min-h-[40px] shrink-0 items-center gap-1 rounded-full bg-app-success-tint px-3.5 text-[13px] font-bold text-app-success"><Icon name="check" size={14} /> Added</span>
                          ) : (
                            <form action={addMarketplaceProduct} className="shrink-0">
                              <input type="hidden" name="supplierProductId" value={p.id} />
                              <button type="submit" className="inline-flex min-h-[40px] items-center rounded-full bg-app-ink px-4 text-[13.5px] font-extrabold text-white hover:bg-black" aria-label={`Sell ${p.name} in my store`}>
                                Sell this
                              </button>
                            </form>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </div>
    </SellerPage>
  );
}
