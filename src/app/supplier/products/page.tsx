import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { requireRole } from "@/lib/server-auth";
import { ensureSupplierAccess, getSupplierForUser } from "@/lib/role-queries";
import { supplierPlanLimits } from "@/lib/plan-limits";
import { AppPage, AssistantNote, EmptyState, FilterChips, ListCard, ListRow, Pill, PillLink, SearchForm, Thumb } from "@/components/app-kit";
import { cx } from "@/components/app-ui/cx";
import { PRODUCT_STATUS, money, statusOf, supplierFrame } from "@/components/supplier/supplier-kit";
import { getT } from "@/lib/i18n/server";
import { PageTip } from "@/components/learn/PageTip";

const LOW_STOCK = 5;

const FILTERS: Record<string, { label: string; where: Prisma.SupplierProductWhereInput }> = {
  live: { label: "Live", where: { status: "published" } },
  review: { label: "In review", where: { status: "pending_review" } },
  drafts: { label: "Drafts", where: { status: { in: ["draft", "unpublished", "rejected"] } } },
  "low-stock": { label: "Low stock", where: { stockQuantity: { lte: LOW_STOCK } } },
  dropship: { label: "Dropship", where: { dropshipAvailable: true } },
};

type PageProps = {
  searchParams?: Promise<{ show?: string; q?: string }>;
};

function href(show?: string, q?: string) {
  const params = new URLSearchParams();
  if (show) params.set("show", show);
  if (q) params.set("q", q);
  const query = params.toString();
  return `/supplier/products${query ? `?${query}` : ""}`;
}

export default async function SupplierProductsPage({ searchParams }: PageProps) {
  const params = (await searchParams) ?? {};
  const user = await requireRole(["supplier"], "/supplier/login");
  const supplier = await getSupplierForUser(user);
  ensureSupplierAccess(supplier);
  const t = await getT("supplier", "common");
  const tipT = await getT("tips");

  const show = params.show && FILTERS[params.show] ? params.show : undefined;
  const q = params.q?.trim() || undefined;
  const base: Prisma.SupplierProductWhereInput = { supplierId: supplier.id };

  const [products, counts, dbUser] = await Promise.all([
    db.supplierProduct.findMany({
      where: {
        ...base,
        ...(show ? FILTERS[show].where : {}),
        ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { slug: { contains: q, mode: "insensitive" } }] } : {}),
      },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        images: true,
        wholesalePrice: true,
        currency: true,
        stockQuantity: true,
        moq: true,
        dropshipAvailable: true,
        bulkOrderAvailable: true,
        updatedAt: true,
        category: { select: { name: true } },
        _count: { select: { wholesales: true, storeProducts: true } },
      },
    }),
    Promise.all([
      db.supplierProduct.count({ where: base }),
      ...Object.values(FILTERS).map((filter) => db.supplierProduct.count({ where: { ...base, ...filter.where } })),
    ]),
    db.user.findUnique({ where: { id: user.id }, select: { aiCredits: true } }),
  ]);
  const listingLimit = supplierPlanLimits(dbUser ?? {}).listings;
  const isPro = listingLimit === null;
  const [total, ...filterCounts] = counts;

  return (
    <AppPage
      frame={supplierFrame(user, supplier, { searchPlaceholder: t("products.searchPlaceholder") })}
      title={t("products.title")}
      sub={isPro ? t("products.subPro") : t("products.subFree", { count: Math.min(total, listingLimit ?? total), limit: listingLimit ?? total })}
      actions={
        <>
          <PillLink href="/supplier/products/import" icon="upload">{t("imp.button")}</PillLink>
          <PillLink href="/supplier/products/new" tone="accent" icon="plus">{t("dashboard.addProduct")}</PillLink>
        </>
      }
      toolbar={
        <>
          <FilterChips
            items={[
              { label: t("products.filter.all"), href: href(undefined, q), count: total, active: !show },
              ...Object.entries(FILTERS).map(([key, filter], index) => ({ label: t.dynamic(`products.filter.${key}`, filter.label), href: href(key, q), count: filterCounts[index], active: show === key })),
            ]}
          />
          <SearchForm action="/supplier/products" defaultValue={q} placeholder={t("products.searchNameSlug")} keep={{ show }} />
        </>
      }
    >
      <PageTip who="rex" className="mb-5">{tipT("supplier.products")}</PageTip>
      {listingLimit !== null && total >= listingLimit && (
        <div className="mb-4">
          <AssistantNote who="rex" action={<PillLink href="/supplier/profile?tab=Billing%20%26%20Plan" tone="ink" size="sm">{t("products.seePlans")}</PillLink>}>
            {t("products.limitReached")}
          </AssistantNote>
        </div>
      )}

      {products.length === 0 ? (
        <EmptyState
          icon="box"
          title={total === 0 ? t("products.emptyTitle") : t("products.noMatchTitle")}
          action={total === 0 ? <PillLink href="/supplier/products/new" tone="ink" icon="plus">{t("dashboard.addProduct")}</PillLink> : undefined}
        >
          {total === 0
            ? t("products.emptyBody")
            : t("products.noMatchBody")}
        </EmptyState>
      ) : (
        <ListCard>
          {products.map((product) => {
            const status = statusOf(PRODUCT_STATUS, product.status, t);
            const low = product.stockQuantity <= LOW_STOCK;
            const terms = [product.dropshipAvailable ? t("productForm.dropship") : null, product.bulkOrderAvailable ? t("productForm.wholesale") : null].filter(Boolean).join(" + ") || t("products.standard");
            return (
              <ListRow key={product.id} href={`/supplier/products/${product.id}/edit`} className="lg:grid lg:grid-cols-[56px_minmax(0,2fr)_110px_minmax(0,1fr)_minmax(0,1fr)_auto]">
                <Thumb src={product.images[0]} label={product.name} size={56} />
                <span className="min-w-0 flex-1 basis-[calc(100%-72px)] sm:basis-0">
                  <span className="block truncate text-[14.5px] font-extrabold">{product.name}</span>
                  <span className="block truncate text-[13px] text-app-ink-soft">{product.category.name} · {t("products.moq", { moq: product.moq.toLocaleString("en-NG") })} · {terms}</span>
                </span>
                <span><Pill tone={status.tone}>{status.label}</Pill></span>
                <span className={cx("shrink-0 text-[13.5px]", low ? "font-bold text-app-accent-ink" : "text-app-ink-soft")}>
                  {low ? t("dashboard.left", { count: product.stockQuantity }) : t("dashboard.inStock", { count: product.stockQuantity })}
                </span>
                <span className="hidden text-[13.5px] text-app-ink-soft lg:block">
                  {t("products.ordersShops", { orders: product._count.wholesales, shops: product._count.storeProducts })}
                </span>
                <span className="ml-auto text-right text-[14.5px] font-extrabold">{money(product.wholesalePrice, product.currency)}</span>
              </ListRow>
            );
          })}
        </ListCard>
      )}
    </AppPage>
  );
}
