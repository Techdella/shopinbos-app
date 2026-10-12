import { redirect } from "next/navigation";
import { requireRole } from "@/lib/server-auth";
import { safeQuery } from "@/lib/workspace";
import { db } from "@/lib/db/client";
import { SellerPage, storeSummary } from "@/components/seller/SellerPage";
import { PillLink } from "@/components/app-kit";
import {
  activeImportCount,
  categoriesOf,
  filterFindProducts,
  parseSourcing,
  peggyInsight,
  SAMPLE_PRODUCTS,
  toFindProduct,
  TREND_IDEAS,
  trendsFromProducts,
  type FindProduct,
} from "@/lib/marketplace/find";
import { FindProductsView, type FindTab } from "./_components/FindProductsView";

export const dynamic = "force-dynamic";

// Find products to sell (seller app, "Find products" prototype): local suppliers who dropship or sell wholesale
// (Nigeria tab), imports from China through the sourcing partner (China · 1688), and what's selling (Trending).

type PageProps = {
  searchParams?: Promise<{ tab?: string; q?: string; cat?: string; category?: string; supplier?: string; trending?: string; product?: string; photo?: string; error?: string }>;
};

export default async function MarketplacePage({ searchParams }: PageProps) {
  const params = (await searchParams) ?? {};
  // Old links: ?product=<id> opened a panel; ?trending=true was a filter.
  if (params.product) redirect(`/marketplace/product/${encodeURIComponent(params.product)}`);
  const tab: FindTab = params.tab === "china" || params.tab === "trending" ? params.tab : params.trending === "true" ? "trending" : "nigeria";

  const user = await requireRole(["seller"], "/login");
  const store = await db.store.findUnique({
    where: { userId: user.id },
    select: { id: true, name: true, slug: true, logoUrl: true, country: true, brandSettings: true },
  });
  if (!store) redirect("/builder?firstRun=1");

  const settings = (store.brandSettings && typeof store.brandSettings === "object" ? store.brandSettings : {}) as Record<string, unknown>;
  const sourcing = parseSourcing(settings.sourcing);
  const memory = (settings.onboardingMemory && typeof settings.onboardingMemory === "object" ? settings.onboardingMemory : {}) as Record<string, unknown>;
  const customerProfile = (memory.customerProfile && typeof memory.customerProfile === "object" ? memory.customerProfile : {}) as Record<string, unknown>;
  const country = store.country || "Nigeria";

  const [rows, inStore] = await Promise.all([
    safeQuery(() => db.supplierProduct.findMany({
      where: { status: "published", supplier: { status: "active", verificationStatus: "verified", country: { equals: country, mode: "insensitive" } } },
      include: {
        supplier: { select: { id: true, userId: true, slug: true, displayName: true, city: true, rating: true, ratingCount: true, verificationStatus: true } },
        category: { select: { name: true } },
      },
      orderBy: [{ trendScore: "desc" }, { createdAt: "desc" }],
      take: 120,
    }), []),
    safeQuery(() => db.storeProduct.findMany({ where: { storeId: store.id, supplierProductId: { not: null } }, select: { supplierProductId: true } }), []),
  ]);

  const live = rows.map(toFindProduct);
  const sampleMode = live.length === 0;
  const catalogue: FindProduct[] = sampleMode ? SAMPLE_PRODUCTS : live;
  const categories = categoriesOf(catalogue);
  const q = (params.q ?? "").trim().slice(0, 120);
  const legacyCategory = params.category ? categories.find((name) => name.toLowerCase() === params.category?.toLowerCase()) : undefined;
  const cat = categories.find((name) => name.toLowerCase() === (params.cat ?? "").toLowerCase()) ?? legacyCategory ?? "";
  const bySupplier = params.supplier && !sampleMode ? catalogue.filter((product) => product.supplier.slug === params.supplier) : catalogue;
  const products = filterFindProducts(bySupplier, { q, category: cat });
  const supplierName = params.supplier ? bySupplier[0]?.supplier.name : undefined;

  const insight = peggyInsight({
    storeCategory: typeof memory.category === "string" ? memory.category : typeof memory.businessDescription === "string" ? memory.businessDescription : null,
    customers: typeof customerProfile.who === "string" ? customerProfile.who : null,
    categories,
  });
  const importsOnTheWay = activeImportCount(sourcing.imports);
  const trends = sampleMode ? TREND_IDEAS : trendsFromProducts(live);

  return (
    <SellerPage
      user={user}
      store={storeSummary(store)}
      title="Find products to sell"
      sub="Local suppliers whose products you can sell without stock or buy in bulk, and imports from China."
      actions={
        <PillLink href="/home/imports" icon="truck">
          {importsOnTheWay > 0 ? `My imports · ${importsOnTheWay}` : "My imports"}
        </PillLink>
      }
    >
      <FindProductsView
        tab={tab}
        country={country}
        q={q}
        cat={cat}
        categories={categories}
        products={products}
        sampleMode={sampleMode}
        supplierName={supplierName}
        insight={insight}
        trends={trends}
        addedIds={inStore.map((row) => row.supplierProductId).filter((id): id is string => Boolean(id))}
        notified={sourcing.notifyNewSuppliers}
        error={params.error}
        focusPhoto={params.photo === "1"}
      />
    </SellerPage>
  );
}
