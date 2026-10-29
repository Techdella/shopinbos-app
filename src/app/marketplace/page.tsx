import { VISIBLE_SUPPLIER, nearbyForSeller } from "@/lib/marketplace/agreements.server";
import { featuredFirst } from "@/lib/plans/placement";
import { boostedProductIds } from "@/lib/plans/extras.server";
import { PRODUCT_PLAN_FIRST } from "@/lib/plans/placement";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/server-auth";
import { safeQuery } from "@/lib/workspace";
import { db } from "@/lib/db/client";
import { SellerPage, storeSummary } from "@/components/seller/SellerPage";
import { PillLink } from "@/components/app-kit";
import {
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
import { getT } from "@/lib/i18n/server";
import { activeImportCount, isImportStatus } from "@/lib/imports/pure";
import { chinaImportsOpen } from "@/lib/imports/service.server";
import { inShopIds, sameState, sellerState, starterPacksFor } from "@/lib/marketplace/quick-add.server";
import { DEFAULT_MARKUP } from "@shared/supplier-markup";
import { customerPlacesFor, nearCustomersFor, shopsSellingFor } from "@/lib/marketplace/find-extras.server";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getT("marketplace");
  return { title: t("find.title") };
}

// Find products to sell (seller app, "Find products" prototype): local suppliers who dropship or sell wholesale
// (Nigeria tab), imports from China through the sourcing partner, ShopKonfam (From China), and what's selling (Trending).

type PageProps = {
  searchParams?: Promise<{ tab?: string; q?: string; cat?: string; category?: string; supplier?: string; trending?: string; product?: string; photo?: string; error?: string }>;
};

export default async function MarketplacePage({ searchParams }: PageProps) {
  const params = (await searchParams) ?? {};
  // Old links: ?product=<id> opened a panel; ?trending=true was a filter.
  if (params.product) redirect(`/marketplace/product/${encodeURIComponent(params.product)}`);
  const tab: FindTab = params.tab === "china" || params.tab === "trending" ? params.tab : params.trending === "true" ? "trending" : "nigeria";

  const user = await requireRole(["seller"], "/login");
  const t = await getT("marketplace");
  const store = await db.store.findUnique({
    where: { userId: user.id },
    select: { id: true, name: true, slug: true, logoUrl: true, country: true, city: true, brandSettings: true },
  });
  if (!store) redirect("/builder?firstRun=1");

  const settings = (store.brandSettings && typeof store.brandSettings === "object" ? store.brandSettings : {}) as Record<string, unknown>;
  const sourcing = parseSourcing(settings.sourcing);
  const memory = (settings.onboardingMemory && typeof settings.onboardingMemory === "object" ? settings.onboardingMemory : {}) as Record<string, unknown>;
  const customerProfile = (memory.customerProfile && typeof memory.customerProfile === "object" ? memory.customerProfile : {}) as Record<string, unknown>;
  const country = store.country || "Nigeria";

  const [rows, inStore, imports, state, packs] = await Promise.all([
    safeQuery(() => db.supplierProduct.findMany({
      // Verified or not (sellers see which, and the risk score), near the seller first: src/lib/marketplace/agreements.server.ts.
      where: { status: "published", supplier: { ...VISIBLE_SUPPLIER, country: { equals: country, mode: "insensitive" } } },
      include: {
        supplier: { select: { id: true, userId: true, slug: true, displayName: true, city: true, address: true, rating: true, ratingCount: true, verificationStatus: true } },
        category: { select: { name: true } },
      },
      orderBy: [PRODUCT_PLAN_FIRST, { trendScore: "desc" }, { createdAt: "desc" }],
      take: 300,
    }), []),
    // In the shop (removed ones can be added again).
    safeQuery(() => inShopIds(store.id), []),
    safeQuery(() => db.importOrder.findMany({ where: { storeId: store.id }, select: { status: true }, take: 100 }), []),
    safeQuery(() => sellerState(user.id), null),
    // Starter packs at the top of the list (shared/starter-packs.ts), only on the plain list.
    tab === "nigeria" && !params.q && !params.cat ? safeQuery(() => starterPacksFor(user.id), null) : Promise.resolve(null),
  ]);

  const addressOf = new Map(rows.map((row) => [row.supplier.id, row.supplier.address]));
  const nearby = await nearbyForSeller(
    user.id,
    // "Delivers to my state": the supplier is in the seller's state.
    rows.map((row) => { const product = toFindProduct(row); return { ...product, supplier: { ...product.supplier, sameState: sameState(state, { city: row.supplier.city, address: row.supplier.address }) } }; }),
    addressOf,
  );
  // "N shops selling" and "Near my customers" (src/lib/marketplace/find-extras.server.ts).
  const [selling, customers] = await Promise.all([shopsSellingFor(nearby.products.map((product) => product.id)), safeQuery(() => customerPlacesFor(user.id), null)]);
  const nearCustomers = customers ? await safeQuery(() => nearCustomersFor(customers, rows.map((row) => row.supplier)), new Set<string>()) : new Set<string>();
  const live = nearby.products.map((product) => ({ ...product, shopsSelling: selling.get(product.id) ?? 0, supplier: { ...product.supplier, nearCustomers: Boolean(product.supplier.id && nearCustomers.has(product.supplier.id)) } }));
  const sampleMode = live.length === 0;
  const catalogue: FindProduct[] = sampleMode ? SAMPLE_PRODUCTS : live;
  const categories = categoriesOf(catalogue);
  const q = (params.q ?? "").trim().slice(0, 120);
  const legacyCategory = params.category ? categories.find((name) => name.toLowerCase() === params.category?.toLowerCase()) : undefined;
  const cat = categories.find((name) => name.toLowerCase() === (params.cat ?? "").toLowerCase()) ?? legacyCategory ?? "";
  const bySupplier = params.supplier && !sampleMode ? catalogue.filter((product) => product.supplier.slug === params.supplier) : catalogue;
  // Boosted products this week come first (src/lib/plans/extras.server.ts).
  const boosted = new Set(sampleMode ? [] : await boostedProductIds());
  const products = featuredFirst(filterFindProducts(bySupplier, { q, category: cat }).map((product) => (boosted.has(product.id) ? { ...product, featured: true } : product)));
  const supplierName = params.supplier ? bySupplier[0]?.supplier.name : undefined;

  const insight = peggyInsight({
    storeCategory: typeof memory.category === "string" ? memory.category : typeof memory.businessDescription === "string" ? memory.businessDescription : null,
    customers: typeof customerProfile.who === "string" ? customerProfile.who : null,
    categories,
  });
  const importsOnTheWay = activeImportCount(imports.map((row) => ({ status: isImportStatus(row.status) ? row.status : "requested" })));
  const trends = sampleMode ? TREND_IDEAS : trendsFromProducts(live);

  return (
    <SellerPage
      user={user}
      store={storeSummary(store)}
      title={t("find.title")}
      sub={t("find.sub")}
      actions={
        <PillLink href="/home/imports" icon="truck">
          {importsOnTheWay > 0 ? t("find.myImportsCount", { count: importsOnTheWay }) : t("find.myImports")}
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
        nearby={{ hasPlace: nearby.hasPlace, city: store.city ?? null, customerStates: customers?.states ?? [], customerBasis: customers?.basis ?? "none" }}
        addedIds={inStore}
        markup={{ markup: sourcing.markup ?? DEFAULT_MARKUP, asked: Boolean(sourcing.markup) }}
        packs={packs?.packs ?? []}
        notified={sourcing.notifyNewSuppliers}
        error={params.error}
        focusPhoto={params.photo === "1"}
        importsOpen={chinaImportsOpen()}
      />
    </SellerPage>
  );
}
