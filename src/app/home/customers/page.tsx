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
import { CUSTOMERS_PAGE_SIZE, CUSTOMER_FILTERS, CUSTOMER_SORTS, customerBadge, customerListHref, pageNumbers, parseCustomerListQuery, type CustomerListQuery } from "@/lib/customers/pure";
import { CustomerDrawer, CustomerRowLink } from "./CustomerDrawer";

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
  const query = parseCustomerListQuery(await searchParams);

  const store = workspace?.store;
  const naira = (amount: number) => formatMoney(Math.round(amount), locale, { currency: store?.currency || "NGN" });
  const stats = store ? await customerStats(store.id) : null;
  const [list, delivered] = store && stats?.customers
    ? await Promise.all([listCustomers(store.id, query, stats.vip), db.retailOrder.count({ where: { storeId: store.id, status: "delivered" } })])
    : [null, 0];

  // Links keep the search, filter and sort; a new search, filter or sort starts again at page 1.
  const href = (patch: Partial<CustomerListQuery>) => customerListHref({ ...query, customer: null, ...patch });
  const filtering = Boolean(query.q) || query.show !== "all";
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
            <FilterChips
              items={CUSTOMER_FILTERS.map((show) => ({ label: t(`filter.${show}`), href: href({ show, page: 1 }), count: stats.counts[show], active: query.show === show }))}
            />
            <SearchForm action="/home/customers" defaultValue={query.q} placeholder={t("search")} keep={{ show: query.show !== "all" ? query.show : undefined, sort: query.sort !== "recent" ? query.sort : undefined }} />
          </div>
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

          {list.total > 0 && (
            <div className="mt-4 flex flex-col items-center gap-3 sm:flex-row sm:justify-between">
              <p className="m-0 text-[13px] text-app-ink-soft">{t("page.showing", { from: num(from), to: num(to), total: num(list.total) })}</p>
              {pages > 1 && (
                <nav aria-label={t("page.nav")} className="flex items-center gap-1.5">
                  <PageLink href={page > 1 ? href({ page: page - 1 }) : null} label={t("page.prev")} icon="arrowLeft" />
                  <span className="px-2 text-[13.5px] font-bold sm:hidden">{t("page.of", { page: num(page), pages: num(pages) })}</span>
                  <span className="hidden items-center gap-1 sm:flex">
                    {pageNumbers(page, pages).map((n, i) =>
                      n === "gap" ? (
                        <span key={`gap-${i}`} className="px-1 text-app-ink-soft" aria-hidden>…</span>
                      ) : (
                        <Link
                          key={n}
                          href={href({ page: n })}
                          aria-current={n === page ? "page" : undefined}
                          aria-label={t("page.number", { page: n })}
                          className={cx(
                            "grid h-9 min-w-9 place-items-center rounded-full px-2 text-[13.5px] font-bold no-underline",
                            n === page ? "bg-app-ink text-white" : "border border-app-line bg-white text-app-ink hover:border-app-line-strong",
                          )}
                        >
                          {num(n)}
                        </Link>
                      ),
                    )}
                  </span>
                  <PageLink href={page < pages ? href({ page: page + 1 }) : null} label={t("page.next")} icon="arrow" iconAfter />
                </nav>
              )}
            </div>
          )}
          {filtering && <p className="mb-0 mt-2 text-center text-[13px] sm:text-left"><Link href="/home/customers" className="font-bold text-app-accent-ink">{t("clear")}</Link></p>}

          <Suspense fallback={null}>
            <CustomerDrawer />
          </Suspense>
        </>
      )}
    </AppPage>
  );
}

function PageLink({ href, label, icon, iconAfter = false }: { href: string | null; label: string; icon: "arrowLeft" | "arrow"; iconAfter?: boolean }) {
  const inner = (
    <>
      {!iconAfter && <Icon name={icon} size={14} />}
      <span>{label}</span>
      {iconAfter && <Icon name={icon} size={14} />}
    </>
  );
  const cls = "inline-flex min-h-[36px] items-center gap-1.5 rounded-full border px-3.5 text-[13.5px] font-bold no-underline";
  // On the first and last page the button stays visible but greyed out, and isn't a link.
  return href ? (
    <Link href={href} rel={iconAfter ? "next" : "prev"} className={cx(cls, "border-app-line bg-white text-app-ink hover:border-app-line-strong")}>{inner}</Link>
  ) : (
    <span aria-disabled="true" className={cx(cls, "border-app-line bg-app-canvas text-app-ink-faint")}>{inner}</span>
  );
}
