import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db/client";
import { listDropship } from "@/lib/marketplace/dropship.server";
import { requireRole } from "@/lib/server-auth";
import { SellerPage, storeSummary } from "@/components/seller/SellerPage";
import { cx } from "@/components/app-ui/cx";
import { Icon, type IconName } from "@/components/ui/Icon";
import { messagesHref } from "@/lib/conversations/pure";
import { PauseButton } from "./DropshipActions";
import { getLocale, getT } from "@/lib/i18n/server";
import { formatMoney } from "@shared/i18n";
import { AssistantNote } from "@/components/app-kit";
import { Term } from "@/components/learn/Term";
import { TipsGate } from "@/app/marketplace/_components/TipsGate";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  const t = await getT("marketplace");
  return { title: t("ds.title") };
}

// Dropship: the products a supplier sends straight to the seller's buyers, as Find products-style cards
// (Cost / Sell / You keep), with the supplier's stock, a filter, and Pause / Message supplier.

const PROMISES = [
  { icon: "box", key: "noStock" },
  { icon: "tag", key: "label" },
  { icon: "shield", key: "paid" },
] as const satisfies ReadonlyArray<{ icon: IconName; key: string }>;

const FILTERS = [
  { key: "all" },
  { key: "selling" },
  { key: "paused" },
  { key: "low" },
  { key: "out" },
] as const;
type FilterKey = (typeof FILTERS)[number]["key"];
type DropshipT = Awaited<ReturnType<typeof getT<["marketplace", "common"]>>>;

function stockState(quantity: number, t: DropshipT) {
  if (quantity <= 0) return { label: t("ds.stock.out"), tone: "bg-app-danger-tint text-app-danger" };
  if (quantity < 5) return { label: t("ds.stock.left", { count: quantity }), tone: "bg-app-peach text-app-accent-ink" };
  return { label: t("ds.stock.in", { count: quantity }), tone: "bg-app-success-tint text-app-success" };
}

export default async function SellerDropshipPage({ searchParams }: { searchParams?: Promise<{ show?: string }> }) {
  const params = (await searchParams) ?? {};
  const show: FilterKey = FILTERS.some((f) => f.key === params.show) ? (params.show as FilterKey) : "all";
  const user = await requireRole(["seller"], "/login");
  const t = await getT("marketplace", "common");
  const locale = await getLocale();
  const naira = (amount: number) => formatMoney(Math.round(amount), locale);
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { name: true, slug: true, logoUrl: true } });
  if (!store) redirect("/builder?firstRun=1");

  const rows = await listDropship(user.id);
  const selling = rows.filter((row) => row.live);
  const low = rows.filter((row) => row.stock > 0 && row.stock < 5);
  const out = rows.filter((row) => row.stock <= 0);
  const suppliers = new Set(rows.map((row) => row.supplier.id)).size;
  const avgKeep = rows.length ? Math.round(rows.reduce((sum, row) => sum + row.sale.keepPct, 0) / rows.length) : 0;
  const visible = rows.filter((row) =>
    show === "selling" ? selling.includes(row) : show === "paused" ? row.paused : show === "low" ? low.includes(row) : show === "out" ? out.includes(row) : true,
  );

  const stats = [
    { label: t("ds.stat.products"), value: String(rows.length), hint: t("ds.stat.productsHint") },
    { label: t("ds.stat.selling"), value: String(selling.length), hint: t("ds.stat.sellingHint") },
    { label: t("ds.stat.attention"), value: String(low.length + out.length), hint: t("ds.stat.attentionHint") },
    { label: t("ds.stat.keep"), value: rows.length ? `${avgKeep}%` : "—", hint: t("ds.stat.keepHint", { count: suppliers }) },
  ];

  return (
    <SellerPage
      user={user}
      store={storeSummary(store)}
      title={t("ds.title")}
      sub={t("ds.sub")}
      actions={
        <Link href="/marketplace" className="inline-flex min-h-[44px] items-center gap-2 rounded-full bg-app-accent px-5 text-[14.5px] font-extrabold text-white no-underline hover:brightness-95">
          <Icon name="search" size={16} /> {t("ds.find")}
        </Link>
      }
    >
      <div className="grid min-w-0 gap-4">
        <TipsGate>
          <AssistantNote who="peggy">{t("ds.tip")}</AssistantNote>
        </TipsGate>
        <div className="grid items-start gap-3 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
          <ul className="m-0 grid list-none grid-cols-2 gap-3 p-0 md:grid-cols-4 lg:grid-cols-2 xl:grid-cols-4">
            {stats.map((stat) => (
              <li key={stat.label} className="min-w-0 rounded-[18px] border border-app-line bg-white px-4 py-3.5">
                <p className="m-0 text-[12.5px] font-bold text-app-ink-soft">{stat.label}</p>
                <p className="m-0 mt-1 text-[24px] font-extrabold leading-none tracking-[-0.02em]">{stat.value}</p>
                <p className="m-0 mt-1.5 truncate text-[12px] text-app-ink-soft">{stat.hint}</p>
              </li>
            ))}
          </ul>
          <div className="grid gap-3">
            {out.length + low.length > 0 ? (
              <p className="m-0 flex items-start gap-3 rounded-[18px] bg-app-peach px-4 py-3.5 text-[14px] leading-[1.5]">
                <Icon name="warn" size={18} className="mt-0.5 shrink-0" />
                <span>
                  <strong className="font-extrabold">{out.length ? t("ds.outWarn", { count: out.length }) : t("ds.lowWarn", { count: low.length })}</strong>{" "}
                  {t("ds.warnSub")}
                </span>
              </p>
            ) : (
              <p className="m-0 flex items-start gap-3 rounded-[18px] bg-app-peach px-4 py-3.5 text-[14px] leading-[1.5]">
                <Icon name="sparkle" size={18} className="mt-0.5 shrink-0" />
                <span><strong className="font-extrabold">{t("ds.payNothing")}</strong> {t("ds.payNothingSub")}</span>
              </p>
            )}
            <ul className="m-0 grid list-none grid-cols-3 gap-2 rounded-[18px] border border-app-line bg-white px-4 py-3 p-0">
              {PROMISES.map((promise) => (
                <li key={promise.key} className="flex min-w-0 flex-col items-start gap-1.5 px-1 py-1 sm:flex-row sm:items-center sm:gap-2.5">
                  <Icon name={promise.icon} size={17} className="shrink-0" />
                  <span className="min-w-0">
                    <span className="block text-[12.5px] font-extrabold leading-tight sm:text-[13px]">
                      {promise.key === "label" ? <Term k="white-label">{t("ds.promise.label")}</Term> : t(`ds.promise.${promise.key}`)}
                    </span>
                    <span className="block text-[12px] leading-tight text-app-ink-soft">{t(`ds.promise.${promise.key}Sub`)}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {rows.length > 0 && (
          <nav aria-label={t("ds.show")} className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0">
            {FILTERS.map((filter) => {
              const count = filter.key === "all" ? rows.length : filter.key === "selling" ? selling.length : filter.key === "paused" ? rows.filter((r) => r.paused).length : filter.key === "low" ? low.length : out.length;
              return (
                <Link
                  key={filter.key}
                  href={filter.key === "all" ? "/home/dropship" : `/home/dropship?show=${filter.key}`}
                  aria-current={show === filter.key ? "page" : undefined}
                  className={cx(
                    "inline-flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-full border px-4 text-[14px] font-bold no-underline",
                    show === filter.key ? "border-app-ink bg-app-ink text-white" : "border-app-line bg-white text-app-ink hover:border-app-line-strong",
                  )}
                >
                  {t(`ds.filter.${filter.key}`)} <span className={show === filter.key ? "text-white/70" : "text-app-ink-soft"}>{count}</span>
                </Link>
              );
            })}
          </nav>
        )}

        {rows.length === 0 ? (
          <div className="rounded-[22px] border border-app-line bg-white px-6 py-12 text-center">
            <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-app-peach"><Icon name="truck" size={22} /></span>
            <h2 className="m-0 mt-4 text-[18px] font-extrabold">{t("ds.empty")}</h2>
            <p className="mx-auto mb-0 mt-2 max-w-[440px] text-[14.5px] leading-[1.55] text-app-ink-soft">
              {t("ds.emptySub")}
            </p>
            <Link href="/marketplace" className="mt-5 inline-flex min-h-[44px] items-center rounded-full bg-app-ink px-5 text-[14.5px] font-extrabold text-white no-underline">{t("ds.findToSell")}</Link>
          </div>
        ) : visible.length === 0 ? (
          <p className="m-0 rounded-[22px] border border-dashed border-app-line px-6 py-10 text-center text-[14.5px] text-app-ink-soft">{t("ds.nothing")}</p>
        ) : (
          <ul className="m-0 grid list-none grid-cols-1 gap-3 p-0 min-[460px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 sm:gap-4">
            {visible.map(({ id, product, supplier, ships, sale, stock, paused, live, image }) => {
              const state = stockState(stock, t);
              const productHref = `/products/${product.id}`;
              return (
                <li key={id} className={cx("flex min-w-0 flex-col overflow-hidden rounded-[22px] border border-app-line bg-white", paused && "opacity-80")}>
                  <Link href={productHref} className="relative block aspect-[4/3] overflow-hidden bg-app-canvas" aria-label={t("ds.inYourProducts", { name: product.name })}>
                    {image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={image} alt={product.name} loading="lazy" className="h-full w-full object-cover transition duration-300 hover:scale-[1.03]" />
                    ) : (
                      <span className="absolute inset-0 grid place-items-center text-app-ink-faint"><Icon name="image" size={32} /></span>
                    )}
                    <span className={cx("absolute left-3 top-3 rounded-full px-2.5 py-1 text-[12px] font-extrabold", live ? "bg-white text-app-success" : "bg-white text-app-ink-soft")}>
                      {paused ? t("ds.paused") : live ? t("ds.selling") : t("ds.notPublished")}
                    </span>
                  </Link>
                  <div className="flex flex-1 flex-col p-3.5">
                    <h3 className="m-0 text-[15.5px] font-extrabold leading-tight">
                      <Link href={productHref} className="text-app-ink no-underline hover:underline">{product.name}</Link>
                    </h3>
                    <p className="mb-0 mt-1 text-[12.5px] leading-[1.4] text-app-ink-soft">
                      {[supplier.name, supplier.city, ships].filter(Boolean).join(" · ")}
                    </p>
                    <div className="mt-2 flex flex-wrap items-baseline justify-between gap-x-2 text-[14px]">
                      <span>{t("ds.cost")} <strong className="font-extrabold">{naira(sale.supplierGets)}</strong></span>
                      <span>{t("ds.sell")} <strong className="font-extrabold">{naira(sale.shopperPays)}</strong></span>
                    </div>
                    <p className={cx("mb-0 mt-0.5 text-[14px] font-extrabold", sale.keep > 0 ? "text-app-success" : "text-app-danger")}>
                      {sale.keep > 0 ? t("ds.keep", { amount: naira(sale.keep), percent: sale.keepPct }) : t("ds.lose", { amount: naira(-sale.keep) })}
                    </p>
                    <span className={cx("mt-2 inline-flex w-fit rounded-full px-2.5 py-1 text-[12px] font-extrabold", state.tone)}>{state.label}</span>
                    <div className="mt-auto flex flex-wrap gap-2 pt-3">
                      <Link href={productHref} className="inline-flex min-h-[40px] flex-1 items-center justify-center whitespace-nowrap rounded-full bg-app-ink px-3 text-[13.5px] font-extrabold text-white no-underline hover:bg-black">
                        {t("ds.editPrice")}
                      </Link>
                      <PauseButton relationshipId={id} paused={paused} name={product.name} />
                      <Link
                        href={messagesHref("seller", { with: supplier.id })}
                        className="inline-flex min-h-[40px] w-full items-center justify-center gap-1.5 rounded-full px-3 text-[13.5px] font-bold text-app-ink-soft no-underline hover:bg-app-canvas hover:text-app-ink"
                      >
                        <Icon name="chat" size={15} /> {t("ds.message", { name: supplier.name })}
                      </Link>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </SellerPage>
  );
}
