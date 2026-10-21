import Link from "next/link";
import { Suspense } from "react";
import { db } from "@/lib/db/client";
import { requireRole } from "@/lib/server-auth";
import { getSellerWorkspace } from "@/lib/workspace";
import { AppPage, EmptyState, FilterChips, ListCard, Pill, PillLink, SearchForm, StatGrid, StatTile, cx } from "@/components/app-kit";
import { Avatar, sellerFrame, timeAgo } from "@/components/seller-core";
import { Icon } from "@/components/ui/Icon";
import { formatMoney, formatNumber, type Locale } from "@shared/i18n";
import { getLocale, getT } from "@/lib/i18n/server";
import { customerStats, listCustomers } from "@/lib/customers/queries.server";
import { CUSTOMERS_PAGE_SIZE, CUSTOMER_FILTERS, CUSTOMER_SORTS, customerBadge, customerListHref, parseCustomerListQuery, type CustomerListQuery } from "@/lib/customers/pure";
import { CustomerDrawer, CustomerRowLink } from "./CustomerDrawer";
import { Pagination } from "@/components/seller/Pagination";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getT("customers");
  return { title: t("title") };
}

function lastOrder(date: Date, locale: Locale, onDate: (date: string) => string) {
  const text = timeAgo(date, Date.now(), locale);
  if (locale !== "en") return text;
  return text === "Just now" || text === "Yesterday" ? text.toLowerCase() : /ago$/.test(text) ? text : onDate(text);
}

export default async function SellerCustomersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireRole(["seller"], "/login");
  const t = await getT("customers", "orders", "common");
  const locale = await getLocale();
  const num = (value: number) => formatNumber(value, locale);
  const workspace = await getSellerWorkspace(user.id);
  const parsed = parseCustomerListQuery(await searchParams);

  const store = workspace?.store;
  // Saved segments for the picker; a ?segment= that isn't one of this store's is dropped.
  const segments = store
    ? await db.customerSegment.findMany({ where: { storeId: store.id }, orderBy: { name: "asc" }, take: 200, select: { id: true, name: true, subscriberCount: true } })
    : [];
  const segment = segments.find((s) => s.id === parsed.segment) ?? null;
  const query: CustomerListQuery = { ...parsed, segment: segment?.id ?? null };
  const naira = (amount: number) => formatMoney(Math.round(amount), locale, { currency: store?.currency || "NGN" });
  const stats = store ? await customerStats(store.id) : null;
  const [list, delivered] = store && stats?.customers
    ? await Promise.all([listCustomers(store.id, query, stats.vip), db.retailOrder.count({ where: { storeId: store.id, status: "delivered" } })])
    : [null, 0];

  // Links keep the search, filter and sort; a new search, filter or sort starts again at page 1.
  const href = (patch: Partial<CustomerListQuery>) => customerListHref({ ...query, customer: null, ...patch });
  const filtering = Boolean(query.q) || query.show !== "all" || Boolean(query.segment);
  const page = list?.page ?? 1;
  const pages = list?.pages ?? 1;
  const from = list && list.total ? (page - 1) * CUSTOMERS_PAGE_SIZE + 1 : 0;
  const to = list ? from + list.customers.length - (list.customers.length ? 1 : 0) : 0;

  return (
    <AppPage
      frame={sellerFrame(user, store)}
      title={t("title")}
      sub={stats?.customers ? t("sub", { count: stats.customers, repeat: stats.returning }) : t("subEmpty")}
    >
      <StatGrid className="mb-5">
        <StatTile tone="card" label={t("stat.customers")} value={num(stats?.customers ?? 0)} hint={t("stat.allTime")} />
        <StatTile tone="card" label={t("stat.repeat")} value={num(stats?.returning ?? 0)} hint={t("stat.repeatHint")} />
        <StatTile tone="card" label={t("stat.orders")} value={num(stats?.orders ?? 0)} hint={t("stat.allTime")} />
        <StatTile tone="card" label={t("stat.delivered")} value={num(delivered)} hint={t("stat.deliveredHint")} />
      </StatGrid>

      {!stats?.customers || !list ? (
        <EmptyState icon="users" title={t("empty")} action={<PillLink href="/home/orders/new" tone="ink" icon="plus">{t("recordSale")}</PillLink>}>
          {t("emptySub")}
        </EmptyState>
      ) : (
        <>

          <div className="mb-3 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <FilterChips
                items={CUSTOMER_FILTERS.map((show) => ({ label: t(`filter.${show}`), href: href({ show, page: 1 }), count: stats.counts[show], active: query.show === show }))}
              />
              <details className="group relative">
                <summary
                  className={cx(
                    "inline-flex min-h-[40px] cursor-pointer list-none items-center gap-2 rounded-full border px-4 text-[14px] font-bold [&::-webkit-details-marker]:hidden",
                    segment ? "border-app-ink bg-app-ink text-white" : "border-app-line bg-white text-app-ink hover:border-app-line-strong",
                  )}
                >
                  <Icon name="layers" size={15} />
                  {segment ? segment.name : t("segment.label")}
                  <Icon name="chevron" size={14} className="rotate-90 group-open:-rotate-90" />
                </summary>
                <nav aria-label={t("segment.label")} className="z-20 mt-2 grid w-[min(300px,calc(100vw-32px))] gap-1 rounded-[18px] border border-app-line bg-white p-2 text-[14px] shadow-[0_12px_32px_rgba(22,20,31,0.12)] sm:absolute sm:left-0">
                  <Link href={href({ segment: null, page: 1 })} aria-current={!segment ? "true" : undefined} className="flex min-h-[38px] items-center rounded-[12px] px-3 font-bold text-app-ink no-underline hover:bg-app-canvas">
                    {t("segment.all")}
                  </Link>
                  {segments.map((s) => (
                    <Link
                      key={s.id}
                      href={href({ segment: s.id, page: 1 })}
                      aria-current={segment?.id === s.id ? "true" : undefined}
                      className="flex min-h-[38px] items-center justify-between gap-3 rounded-[12px] px-3 font-bold text-app-ink no-underline hover:bg-app-canvas"
                    >
                      <span className="min-w-0 truncate">{s.name}</span>
                      {segment?.id === s.id ? <Icon name="check" size={15} /> : <span className="shrink-0 font-normal text-app-ink-soft">{num(s.subscriberCount)}</span>}
                    </Link>
                  ))}
                  {!segments.length && <p className="m-0 px-3 py-2 text-[13px] text-app-ink-soft">{t("segment.none")}</p>}
                  <Link href="/home/marketing/segments" className="flex min-h-[38px] items-center rounded-[12px] px-3 text-[13px] font-bold text-app-accent-ink no-underline hover:bg-app-canvas">
                    {t("segment.manage")}
                  </Link>
                </nav>
              </details>
            </div>
            <SearchForm action="/home/customers" defaultValue={query.q} placeholder={t("search")} keep={{ show: query.show !== "all" ? query.show : undefined, sort: query.sort !== "recent" ? query.sort : undefined, segment: query.segment ?? undefined }} />
          </div>
          {segment && <p className="mb-3 mt-0 text-[13.5px] text-app-ink-soft">{t("segment.showing", { name: segment.name })}</p>}
          <nav aria-label={t("sort.label")} className="mb-4 flex flex-wrap items-center gap-x-1 gap-y-2 text-[13.5px]">
            <span className="mr-1 font-bold text-app-ink-soft">{t("sort.label")}:</span>
            {CUSTOMER_SORTS.map((sort) => (
              <Link
                key={sort}
                href={href({ sort, page: 1 })}
                aria-current={query.sort === sort ? "true" : undefined}
                className={cx(
                  "inline-flex min-h-[34px] items-center rounded-full px-3 font-bold no-underline",
                  query.sort === sort ? "bg-app-ink text-white" : "text-app-ink hover:bg-app-canvas",
                )}
              >
                {t(`sort.${sort}`)}
              </Link>
            ))}
          </nav>

          {list.customers.length === 0 ? (
            <EmptyState icon="search" title={t("noMatch")} action={<PillLink href="/home/customers" tone="white">{t("clear")}</PillLink>}>
              {t("noMatchSub")}
            </EmptyState>
          ) : (
            <ListCard>
              {list.customers.map((c) => {
                const badge = customerBadge(c, stats.vip);
                return (
                  <li key={c.key}>
                    <CustomerRowLink href={customerListHref({ ...query, page, customer: c.key })} label={t("open", { name: c.name })}>
                      <div className="flex w-full min-w-0 items-start gap-3.5 md:items-center md:gap-4">
                        <Avatar name={c.name} size={44} />
                        <div className="grid min-w-0 flex-1 items-center gap-x-5 gap-y-1.5 md:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_auto] xl:grid-cols-[minmax(0,1.8fr)_100px_110px_minmax(0,0.8fr)_120px]">
                          <div className="min-w-0">
                            <div className="truncate text-[15px] font-extrabold">{c.name}</div>
                            {(c.email || c.phone) && <div className="truncate text-[13px] text-app-ink-soft">{c.email || c.phone}</div>}
                          </div>
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[13.5px] xl:contents">
                            <span>
                              {badge === "vip" ? <Pill tone="accent">{t("badge.vip")}</Pill> : badge === "repeat" ? <Pill tone="success">{t("badge.repeat")}</Pill> : <Pill tone="info">{t("badge.new")}</Pill>}
                            </span>
                            <span className="text-app-ink-soft">{t("count.orders", { count: c.orders })}</span>
                            <span className="text-app-ink-soft">{t("lastOrder", { when: lastOrder(c.lastAt, locale, (date) => t("onDate", { date })) })}</span>
                          </div>
                          <div className="text-[15px] font-extrabold md:text-right">{naira(c.spent)}</div>
                        </div>
                      </div>
                    </CustomerRowLink>
                  </li>
                );
              })}
            </ListCard>
          )}

          <Pagination
            page={page}
            pages={pages}
            total={list.total}
            from={from}
            to={to}
            base="/home/customers"
            params={{ q: query.q, show: query.show !== "all" ? query.show : undefined, sort: query.sort !== "recent" ? query.sort : undefined, segment: query.segment ?? undefined }}
            label={t("page.nav")}
            summary={t("page.showing", { from: num(from), to: num(to), total: num(list.total) })}
          />
          {filtering && <p className="mb-0 mt-2 text-center text-[13px] sm:text-left"><Link href="/home/customers" className="font-bold text-app-accent-ink">{t("clear")}</Link></p>}

          <Suspense fallback={null}>
            <CustomerDrawer />
          </Suspense>
        </>
      )}
    </AppPage>
  );
}
