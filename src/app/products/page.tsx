import Link from "next/link";
import { redirect } from "next/navigation";
import { AppPage, EmptyState, FilterChips, ListCard, ListRow, Pill, PillLink, SearchForm, Thumb, cx } from "@/components/app-kit";
import { Icon } from "@/components/ui/Icon";
import { sellerFrame } from "@/components/seller-core";
import { requireRole } from "@/lib/server-auth";
import { getSellerWorkspace } from "@/lib/workspace";
import { db } from "@/lib/db/client";
import { formatMoney, formatNumber } from "@shared/i18n";
import { getLocale, getT } from "@/lib/i18n/server";
import { productCampaignTimers } from "@/lib/store-campaigns/server";
import { ProductCampaignBadge } from "@/components/campaigns/ProductCampaignBadge";
import { PaymentLinkButton } from "@/components/payment-links/PaymentLinkButton";
import { linkProductView } from "@/lib/payment-links/pure";
import { paymentReadiness } from "@/lib/payment-links/service.server";

export const dynamic = "force-dynamic";

type ProductRow = {
  status: string;
  fulfillmentType: string;
  inventoryType: string;
  currentStock: number;
  lowStockThreshold: number;
  trackStock: boolean;
};

const isLive = (p: ProductRow) => p.status === "active" || p.status === "published";
const isDropship = (p: ProductRow) => p.fulfillmentType === "dropship" || p.inventoryType === "dropshipping";
// Only counted stock ("Track stock") can run low; untracked products never sell out.
const isLow = (p: ProductRow) => !isDropship(p) && p.trackStock && p.currentStock <= p.lowStockThreshold;

// Old links used ?status=active|draft|archived; they map onto the new chips.
const FILTERS: Array<{ key: "all" | "live" | "draft" | "low_stock" | "dropship" | "archived"; test: (p: ProductRow) => boolean }> = [
  { key: "all", test: (p) => p.status !== "archived" },
  { key: "live", test: isLive },
  { key: "draft", test: (p) => p.status === "draft" },
  { key: "low_stock", test: (p) => p.status !== "archived" && isLow(p) },
  { key: "dropship", test: (p) => p.status !== "archived" && isDropship(p) },
  { key: "archived", test: (p) => p.status === "archived" },
];

const VISIBILITY = [
  { key: "all" },
  { key: "storefront" },
  { key: "featured" },
  { key: "collection_only" },
  { key: "hidden" },
] as const;

export async function generateMetadata() {
  const t = await getT("products");
  return { title: t("list.title") };
}

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
  const t = await getT("products", "common");
  const locale = await getLocale();
  const naira = (amount: number) => formatMoney(Math.round(amount), locale);
  const workspace = await getSellerWorkspace(user.id);
  if (!workspace) return null;
  if (!workspace.store) redirect("/builder?firstRun=1");

  const storeId = workspace.store.id;
  const filterKey = rawFilter ?? (status === "active" || status === "published" ? "live" : status);
  const filter = FILTERS.find((item) => item.key === filterKey) ?? FILTERS[0];
  const visibilityKey: string = VISIBILITY.some((item) => item.key === visibility) ? visibility! : "all";
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
      trackStock: true,
      soldStock: true,
      supplierStock: true,
      variants: true,
      featured: true,
      tags: true,
      category: { select: { name: true } },
    },
  });
  // Live and upcoming seasonal campaigns that badge a product show a small timer on its row.
  const campaignNow = new Date();
  const [campaignTimers, readiness] = await Promise.all([productCampaignTimers(storeId, all, campaignNow), paymentReadiness(storeId)]);

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
    label: t(`filter.${item.key}`),
    href: href({ filter: item.key }),
    count: item.key === "all" ? all.filter(item.test).length : undefined,
    active: item.key === filter.key,
  }));

  const money = (amount: number, currency: string) => (currency === "NGN" ? naira(amount) : `${currency} ${formatNumber(Math.round(amount), locale)}`);

  return (
    <AppPage
      frame={sellerFrame(user, workspace.store)}
      title={t("list.title")}
      actions={
        <>
          <PillLink href="/products/import" icon="upload">{t("list.import")}</PillLink>
          <a
            href="/api/products/export"
            download
            className="inline-flex min-h-[44px] shrink-0 items-center justify-center gap-2 rounded-full border border-app-line bg-white px-5 text-[14px] font-extrabold text-app-ink no-underline transition hover:border-app-line-strong"
          >
            <Icon name="download" size={16} />
            {t("list.export")}
          </a>
          <PillLink href="/products/new" tone="accent" icon="plus">{t("addProduct")}</PillLink>
        </>
      }
      toolbar={
        <>
          <FilterChips items={chips} />
          <SearchForm
            action="/products"
            defaultValue={query}
            placeholder={t("list.search")}
            keep={{ filter: filter.key === "all" ? undefined : filter.key, visibility: visibilityKey === "all" ? undefined : visibilityKey }}
          />
        </>
      }
    >
      <nav aria-label={t("list.whereShow")} className="-mt-1 mb-4 flex flex-wrap items-center gap-x-1 gap-y-1 text-[13px] text-app-ink-soft">
        <span className="mr-1">{t("list.showing")}</span>
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
            {t(`vis.${item.key}`)}
          </Link>
        ))}
      </nav>

      {all.length === 0 ? (
        <EmptyState
          icon="bag"
          title={t("list.empty")}
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <PillLink href="/products/new" tone="ink" icon="plus">{t("addProduct")}</PillLink>
              <PillLink href="/products/import" icon="upload">{t("list.importCsv")}</PillLink>
            </div>
          }
        >
          {t("list.emptySub")}
        </EmptyState>
      ) : products.length === 0 ? (
        <EmptyState icon="search" title={t("list.noMatch")} action={<PillLink href="/products">{t("list.showAll")}</PillLink>}>
          {query ? t("list.nothingMatches", { query }) : t("list.tryFilter")}
        </EmptyState>
      ) : (
        <ListCard>
          {products.map((p) => {
            const dropship = isDropship(p);
            const stock = !p.trackStock
              ? { low: false, label: t("stock.notTracked") }
              : {
                  low: p.currentStock <= 0 || p.currentStock <= p.lowStockThreshold,
                  label: p.currentStock <= 0 ? t("stock.soldOut") : p.currentStock <= p.lowStockThreshold ? t("stock.left", { count: p.currentStock }) : t("stock.inStock", { count: p.currentStock }),
                };
            const variants = variantCount(p.variants);
            const detail = [variants > 0 ? t("list.variants", { count: variants }) : p.category?.name ?? p.sku, dropship ? t("list.dropship") : t("list.ownStock")].filter(Boolean).join(" · ");
            const statusPill = isLive(p) ? (
              <Pill tone="success">{t("status.live")}</Pill>
            ) : p.status === "archived" ? (
              <Pill tone="muted">{t("status.archived")}</Pill>
            ) : (
              <Pill tone="muted">{t("status.draft")}</Pill>
            );
            const stockText = dropship
              ? p.supplierStock ? t("list.atSupplier", { count: p.supplierStock }) : t("list.supplierStock")
              : stock.label;
            return (
              <ListRow
                key={p.id}
                href={`/products/${p.id}`}
                // A payment link to send in a chat (published products only: the pay page shows public products).
                aside={p.status === "published" ? <PaymentLinkButton compact product={linkProductView(p)} storeName={workspace.store!.name} ready={readiness.ready} /> : undefined}
              >
                <div className="flex w-full min-w-0 items-start gap-3.5 md:items-center md:gap-4">
                  <Thumb src={p.images[0]} label={p.name} />
                  <div className="grid min-w-0 flex-1 items-center gap-x-5 gap-y-2 md:grid-cols-[minmax(0,1.6fr)_minmax(0,1.2fr)_auto] xl:grid-cols-[minmax(0,2fr)_110px_minmax(0,0.9fr)_minmax(0,0.8fr)_120px]">
                    <div className="min-w-0">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="truncate text-[15px] font-extrabold">{p.name}</span>
                        {p.featured && <span className="shrink-0 text-app-accent" title={t("list.featured")}><Icon name="star" size={14} /><span className="sr-only">{t("list.featured")}</span></span>}
                        {campaignTimers[p.id] ? <ProductCampaignBadge campaign={campaignTimers[p.id]!} serverNow={campaignNow.toISOString()} /> : null}
                      </div>
                      <div className="truncate text-[13px] text-app-ink-soft">
                        {detail}
                        {p.visibility === "hidden" && isLive(p) ? ` · ${t("list.hiddenFromStore")}` : ""}
                      </div>
                    </div>
                    <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5 text-[13.5px] xl:contents">
                      <span>{statusPill}</span>
                      <span className={cx("font-semibold", !dropship && stock.low ? "text-app-accent-ink" : "text-app-ink-soft")}>{stockText}</span>
                      <span className="text-app-ink-soft">{t("list.sold", { count: p.soldStock })}</span>
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
