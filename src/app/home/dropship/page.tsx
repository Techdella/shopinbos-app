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
import { naira } from "@/lib/marketplace/find";
import { PauseButton } from "./DropshipActions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Dropship" };

// Dropship: the products a supplier sends straight to the seller's buyers, as Find products-style cards
// (Cost / Sell / You keep), with the supplier's stock, a filter, and Pause / Message supplier.

const PROMISES: Array<{ icon: IconName; title: string; sub: string }> = [
  { icon: "box", title: "No stock", sub: "They hold it" },
  { icon: "tag", title: "Your label", sub: "Packed as yours" },
  { icon: "shield", title: "Paid after delivery", sub: "Money held safely" },
];

const FILTERS = [
  { key: "all", label: "All" },
  { key: "selling", label: "Selling" },
  { key: "paused", label: "Paused" },
  { key: "low", label: "Running low" },
  { key: "out", label: "Out of stock" },
] as const;
type FilterKey = (typeof FILTERS)[number]["key"];

function stockState(quantity: number) {
  if (quantity <= 0) return { label: "Out of stock at supplier", tone: "bg-app-danger-tint text-app-danger" };
  if (quantity < 5) return { label: `${quantity} left at supplier`, tone: "bg-app-peach text-app-accent-ink" };
  return { label: `${quantity} in stock`, tone: "bg-app-success-tint text-app-success" };
}

export default async function SellerDropshipPage({ searchParams }: { searchParams?: Promise<{ show?: string }> }) {
  const params = (await searchParams) ?? {};
  const show: FilterKey = FILTERS.some((f) => f.key === params.show) ? (params.show as FilterKey) : "all";
  const user = await requireRole(["seller"], "/login");
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
    { label: "Products", value: String(rows.length), hint: "Linked to a supplier" },
    { label: "Selling", value: String(selling.length), hint: "Live in your store" },
    { label: "Need attention", value: String(low.length + out.length), hint: "Stock low or out" },
    { label: "You keep", value: rows.length ? `${avgKeep}%` : "—", hint: `Average · ${suppliers} supplier${suppliers === 1 ? "" : "s"}` },
  ];

  return (
    <SellerPage
      user={user}
      store={storeSummary(store)}
      title="Sell without stock"
      sub="Products suppliers send straight to your buyers, packed with your label."
      actions={
        <Link href="/marketplace" className="inline-flex min-h-[44px] items-center gap-2 rounded-full bg-app-accent px-5 text-[14.5px] font-extrabold text-white no-underline hover:brightness-95">
          <Icon name="search" size={16} /> Find products to sell without stock
        </Link>
      }
    >
      <div className="grid min-w-0 gap-4">
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
                  <strong className="font-extrabold">{out.length ? `${out.length} out of stock` : `${low.length} running low`} at the supplier.</strong>{" "}
                  Pause them so shoppers don&apos;t order what can&apos;t ship, or message the supplier about a restock.
                </span>
              </p>
            ) : (
              <p className="m-0 flex items-start gap-3 rounded-[18px] bg-app-peach px-4 py-3.5 text-[14px] leading-[1.5]">
                <Icon name="sparkle" size={18} className="mt-0.5 shrink-0" />
                <span><strong className="font-extrabold">You pay nothing until a shopper pays you.</strong> The supplier packs each order with your label and a rider delivers it.</span>
              </p>
            )}
            <ul className="m-0 grid list-none grid-cols-3 gap-2 rounded-[18px] border border-app-line bg-white px-4 py-3 p-0">
              {PROMISES.map((promise) => (
                <li key={promise.title} className="flex min-w-0 flex-col items-start gap-1.5 px-1 py-1 sm:flex-row sm:items-center sm:gap-2.5">
                  <Icon name={promise.icon} size={17} className="shrink-0" />
                  <span className="min-w-0">
                    <span className="block text-[12.5px] font-extrabold leading-tight sm:text-[13px]">{promise.title}</span>
                    <span className="block text-[12px] leading-tight text-app-ink-soft">{promise.sub}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {rows.length > 0 && (
          <nav aria-label="Show" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0">
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
                  {filter.label} <span className={show === filter.key ? "text-white/70" : "text-app-ink-soft"}>{count}</span>
                </Link>
              );
            })}
          </nav>
        )}

        {rows.length === 0 ? (
          <div className="rounded-[22px] border border-app-line bg-white px-6 py-12 text-center">
            <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-app-peach"><Icon name="truck" size={22} /></span>
            <h2 className="m-0 mt-4 text-[18px] font-extrabold">No products without stock yet</h2>
            <p className="mx-auto mb-0 mt-2 max-w-[440px] text-[14.5px] leading-[1.55] text-app-ink-soft">
              Add a product from Find products. The supplier holds the stock, packs each order with your label and a rider delivers it. You pay nothing until a shopper pays you.
            </p>
            <Link href="/marketplace" className="mt-5 inline-flex min-h-[44px] items-center rounded-full bg-app-ink px-5 text-[14.5px] font-extrabold text-white no-underline">Find products to sell</Link>
          </div>
        ) : visible.length === 0 ? (
          <p className="m-0 rounded-[22px] border border-dashed border-app-line px-6 py-10 text-center text-[14.5px] text-app-ink-soft">Nothing here right now.</p>
        ) : (
          <ul className="m-0 grid list-none grid-cols-1 gap-3 p-0 min-[460px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 sm:gap-4">
            {visible.map(({ id, product, supplier, ships, sale, stock, paused, live, image }) => {
              const state = stockState(stock);
              const productHref = `/products/${product.id}`;
              return (
                <li key={id} className={cx("flex min-w-0 flex-col overflow-hidden rounded-[22px] border border-app-line bg-white", paused && "opacity-80")}>
                  <Link href={productHref} className="relative block aspect-[4/3] overflow-hidden bg-app-canvas" aria-label={`${product.name} in your products`}>
                    {image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={image} alt={product.name} loading="lazy" className="h-full w-full object-cover transition duration-300 hover:scale-[1.03]" />
                    ) : (
                      <span className="absolute inset-0 grid place-items-center text-app-ink-faint"><Icon name="image" size={32} /></span>
                    )}
                    <span className={cx("absolute left-3 top-3 rounded-full px-2.5 py-1 text-[12px] font-extrabold", live ? "bg-white text-app-success" : "bg-white text-app-ink-soft")}>
                      {paused ? "Paused" : live ? "Selling" : "Not published"}
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
                      <span>Cost <strong className="font-extrabold">{naira(sale.supplierGets)}</strong></span>
                      <span>Sell <strong className="font-extrabold">{naira(sale.shopperPays)}</strong></span>
                    </div>
                    <p className={cx("mb-0 mt-0.5 text-[14px] font-extrabold", sale.keep > 0 ? "text-app-success" : "text-app-danger")}>
                      {sale.keep > 0 ? `You keep ${naira(sale.keep)} · ${sale.keepPct}%` : `You lose ${naira(-sale.keep)} — raise the price`}
                    </p>
                    <span className={cx("mt-2 inline-flex w-fit rounded-full px-2.5 py-1 text-[12px] font-extrabold", state.tone)}>{state.label}</span>
                    <div className="mt-auto flex flex-wrap gap-2 pt-3">
                      <Link href={productHref} className="inline-flex min-h-[40px] flex-1 items-center justify-center whitespace-nowrap rounded-full bg-app-ink px-3 text-[13.5px] font-extrabold text-white no-underline hover:bg-black">
                        Edit price
                      </Link>
                      <PauseButton relationshipId={id} paused={paused} name={product.name} />
                      <Link
                        href={messagesHref("seller", { with: supplier.id })}
                        className="inline-flex min-h-[40px] w-full items-center justify-center gap-1.5 rounded-full px-3 text-[13.5px] font-bold text-app-ink-soft no-underline hover:bg-app-canvas hover:text-app-ink"
                      >
                        <Icon name="chat" size={15} /> Message {supplier.name}
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
