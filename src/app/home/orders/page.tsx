import type { Prisma, RetailOrderStatus } from "@prisma/client";
import { AppPage, EmptyState, FilterChips, ListCard, ListRow, Pill, PillLink, SearchForm, StageDot, Thumb } from "@/components/app-kit";
import { Icon } from "@/components/ui/Icon";
import { sellerFrame, timeAgo } from "@/components/seller-core";
import { requireRole } from "@/lib/server-auth";
import { db } from "@/lib/db/client";
import { orderRow } from "@/lib/dashboard/compute";
import { PAID_ORDER_STATUSES } from "@/lib/insights";
import { CHANNEL_LABEL, type OrderChannel } from "@shared/channels";
import { formatMoney, formatNumber } from "@shared/i18n";
import { getLocale, getT } from "@/lib/i18n/server";
import { pageWindow } from "@/lib/pagination";
import { Pagination } from "@/components/seller/Pagination";
import { PageTip } from "@/components/learn/PageTip";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

const FILTERS: Array<{ key: "all" | "needs_action" | "to_send" | "on_the_way" | "delivered" | "unpaid"; statuses: RetailOrderStatus[] | null }> = [
  { key: "all", statuses: null },
  { key: "needs_action", statuses: ["pending", "awaiting_payment", "paid", "processing", "packed"] },
  { key: "to_send", statuses: ["paid", "processing", "packed"] },
  { key: "on_the_way", statuses: ["shipped"] },
  { key: "delivered", statuses: ["delivered"] },
  { key: "unpaid", statuses: ["pending", "awaiting_payment"] },
];

export async function generateMetadata() {
  const t = await getT("orders");
  return { title: t("list.title") };
}

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; q?: string; page?: string }>
}) {
  const { filter: rawFilter, q: rawQuery, page: rawPage } = await searchParams;
  const user = await requireRole(["seller"], "/login");
  const tipT = await getT("tips");
  const t = await getT("orders", "common");
  const locale = await getLocale();
  const naira = (amount: number) => formatMoney(Math.round(amount), locale);

  const store = await db.store.findUnique({
    where: { userId: user.id },
    select: { id: true, name: true, currency: true, slug: true, logoUrl: true },
  });

  const filter = FILTERS.find((item) => item.key === rawFilter) ?? FILTERS[0];
  const query = rawQuery?.trim() ?? "";

  const where: Prisma.RetailOrderWhereInput = { storeId: store?.id ?? "__none__" };
  if (filter.statuses) where.status = { in: filter.statuses };
  if (query) {
    where.OR = [
      { orderNumber: { contains: query, mode: "insensitive" } },
      { buyerName: { contains: query, mode: "insensitive" } },
      { buyerEmail: { contains: query, mode: "insensitive" } },
      { buyerPhone: { contains: query } },
    ];
  }

  const [matching, byStatus, paidSales] = store
    ? await Promise.all([
        db.retailOrder.count({ where }),
        db.retailOrder.groupBy({ by: ["status"], where: { storeId: store.id }, _count: { _all: true } }),
        db.retailOrder.aggregate({ where: { storeId: store.id, status: { in: [...PAID_ORDER_STATUSES] } }, _sum: { total: true } }),
      ])
    : [0, [], null];
  // A page past the end shows the last page; the count comes first so the query can skip to it.
  const paging = pageWindow(rawPage, matching, PAGE_SIZE);
  const orders = store && matching ? await db.retailOrder.findMany({ where, orderBy: { createdAt: "desc" }, skip: paging.skip, take: paging.take }) : [];

  const statusCount = new Map(byStatus.map((row) => [row.status as string, row._count._all]));
  const countFor = (statuses: RetailOrderStatus[] | null) =>
    statuses ? statuses.reduce((sum, status) => sum + (statusCount.get(status) ?? 0), 0) : [...statusCount.values()].reduce((sum, count) => sum + count, 0);
  const totalOrders = countFor(null);
  const revenue = paidSales?._sum.total ?? 0;

  const chipHref = (key: string) => {
    const params = new URLSearchParams();
    if (key !== "all") params.set("filter", key);
    if (query) params.set("q", query);
    const qs = params.toString();
    return `/home/orders${qs ? `?${qs}` : ""}`;
  };

  return (
    <AppPage
      frame={sellerFrame(user, store)}
      title={t("list.title")}
      sub={totalOrders > 0 ? t("list.sub", { count: formatNumber(totalOrders, locale), amount: naira(revenue) }) : undefined}
      actions={
        <>
          <a
            href="/api/orders/export"
            download
            className="inline-flex min-h-[44px] shrink-0 items-center justify-center gap-2 rounded-full border border-app-line bg-white px-5 text-[14px] font-bold text-app-ink no-underline transition hover:border-app-line-strong max-sm:w-11 max-sm:px-0"
          >
            <Icon name="download" size={16} />
            <span className="max-sm:sr-only">{t("list.export")}</span>
          </a>
          <PillLink href="/home/orders/new" tone="accent" icon="plus">{t("recordSale")}</PillLink>
        </>
      }
      toolbar={
        <>
          <FilterChips
            items={FILTERS.map((item) => ({ label: t(`filter.${item.key}`), href: chipHref(item.key), count: countFor(item.statuses), active: item.key === filter.key }))}
          />
          <SearchForm action="/home/orders" defaultValue={query} placeholder={t("list.search")} keep={{ filter: filter.key === "all" ? undefined : filter.key }} />
        </>
      }
    >
      <PageTip className="mb-5">{tipT("orders")}</PageTip>
      {totalOrders === 0 ? (
        <EmptyState
          icon="bag"
          title={t("list.empty")}
          action={<PillLink href="/home/orders/new" tone="ink" icon="plus">{t("recordSale")}</PillLink>}
        >
          {t("list.emptySub")}
        </EmptyState>
      ) : orders.length === 0 ? (
        <EmptyState icon="search" title={t("list.noMatch")} action={<PillLink href="/home/orders">{t("list.showAll")}</PillLink>}>
          {query ? t("list.nothingMatches", { query }) : t("list.noneInView")}
        </EmptyState>
      ) : (
        <>
          <ListCard>
            {orders.map((order) => {
              const row = orderRow({ ...order, total: Number(order.total) });
              const channelLabel = order.channel ? CHANNEL_LABEL[order.channel as OrderChannel] ?? order.channel : null;
              const channel = channelLabel ? t.dynamic(`channel.${channelLabel}`, channelLabel) : null;
              return (
                <ListRow key={order.id} href={`/home/orders/${order.id}`}>
                  <div className="flex w-full min-w-0 items-start gap-3.5 md:items-center md:gap-4">
                    <Thumb src={row.image} label={row.summary} />
                    <div className="grid min-w-0 flex-1 items-center gap-x-5 gap-y-2 md:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_auto] xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_120px_120px_110px_92px]">
                      <div className="min-w-0">
                        <div className="truncate text-[15px] font-extrabold">{row.buyer}</div>
                        <div className="truncate text-[13px] text-app-ink-soft">
                          {row.summary} · {order.orderNumber}
                        </div>
                      </div>
                      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5 xl:contents">
                        <StageDot tone={row.stage.tone}>{t.dynamic(`stage.${row.stage.label}`, row.stage.label)}</StageDot>
                        <span>
                          <Pill tone={row.payment.tone}>{t.dynamic(`pay.${row.payment.label}`, row.payment.label)}</Pill>
                        </span>
                        <span className="hidden truncate text-[13.5px] text-app-ink-soft xl:block">{channel ?? "—"}</span>
                      </div>
                      <div className="flex items-baseline justify-between gap-3 md:flex-col md:items-end md:gap-0.5 xl:contents">
                        <span className="text-[15px] font-extrabold xl:text-right">{naira(row.total)}</span>
                        <span className="text-[12.5px] text-app-ink-soft xl:text-right">
                          <span className="xl:hidden">{channel ? `${channel} · ` : ""}</span>
                          <time dateTime={order.createdAt.toISOString()}>{timeAgo(order.createdAt, Date.now(), locale)}</time>
                        </span>
                      </div>
                    </div>
                  </div>
                </ListRow>
              );
            })}
          </ListCard>
          <Pagination
            {...paging}
            base="/home/orders"
            params={{ filter: filter.key === "all" ? undefined : filter.key, q: query || undefined }}
            label={t("list.pages")}
          />
        </>
      )}
    </AppPage>
  );
}
