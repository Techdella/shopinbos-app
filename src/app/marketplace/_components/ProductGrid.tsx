"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { cx } from "@/components/app-ui/cx";
import { Icon } from "@/components/ui/Icon";
import { naira, saleBreakdown, supplierLine, type FindProduct } from "@/lib/marketplace/find";
import { quickAddPrice } from "@shared/supplier-markup";
import { SampleNotice } from "./SampleNotice";
import { SupplierTrustBadges } from "./SupplierTrust";
import { useWebQuickAdd, type MarkupState } from "./QuickAddKit";
import { useLocale, useT } from "@/components/i18n/I18nProvider";
import { formatDate, formatMoney } from "@shared/i18n";

interface Chip {
  label: string;
  href: string;
  active: boolean;
}

/** "Near me": a supplier this close (Find shows suppliers up to 50 km away). Same as the phone (find-pure.ts). */
const NEAR_ME_KM = 15;
const PRICE_BANDS = [
  { key: "under5", min: 0, max: 5000 },
  { key: "5to20", min: 5000, max: 20000 },
  { key: "20to50", min: 20000, max: 50000 },
  { key: "over50", min: 50000, max: Infinity },
] as const;

interface Filters {
  notInShop: boolean;
  verified: boolean;
  way: "" | "dropship" | "wholesale";
  /** near me (km) · in my state · near my customers (shared/near-customers.ts). */
  near: "" | "near" | "state" | "customers";
  price: "" | (typeof PRICE_BANDS)[number]["key"];
}
const NO_FILTERS: Filters = { notInShop: false, verified: false, way: "", near: "", price: "" };

/** Dropship from a supplier the seller hasn't agreed with: the agreement steps come first (no one-tap add). */
const needsAgreement = (product: FindProduct) => !product.sample && product.dropship && !product.supplier.agreed;

/**
 * Category chips, the filters that matter for picking fast (not in my shop yet, verified only, dropship or wholesale,
 * near me or delivers to my state, what it costs) and the product cards. "Add · ₦15,000" adds in one click at the
 * supplier's suggested price, else cost + the seller's markup (asked the first time), with Undo; "Select" ticks many
 * and adds them all. Off-screen cards aren't drawn (content-visibility), so a long list stays quick.
 */
export function ProductGrid({ products, addedIds, chips, notified, emptyText, markup: initialMarkup, customers = null }: { products: FindProduct[]; addedIds: string[]; chips: Chip[]; notified: boolean; emptyText: string; markup: MarkupState; /** Where the seller's customers are, for "Near my customers" (null: no orders and no shop state). */ customers?: { states: string[]; basis: "orders" | "store" | "none" } | null }) {
  const t = useT("marketplace");
  const locale = useLocale();
  const money = (amount: number) => (locale === "en" ? naira(amount) : formatMoney(Math.round(amount), locale));
  const [added, setAdded] = useState(() => new Set(addedIds));
  const [sample, setSample] = useState<FindProduct | null>(null);
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const quick = useWebQuickAdd({
    initial: initialMarkup,
    onChange: (more, less) =>
      setAdded((current) => {
        const next = new Set(current);
        for (const id of more) next.add(id);
        for (const id of less) next.delete(id);
        return next;
      }),
  });
  const markup = quick.markup.markup;

  const shown = useMemo(() => {
    const band = PRICE_BANDS.find((item) => item.key === filters.price);
    return products.filter(
      (product) =>
        (!filters.notInShop || !added.has(product.id)) &&
        (!filters.verified || product.supplier.verified) &&
        (filters.way !== "dropship" || product.dropship) &&
        (filters.way !== "wholesale" || product.wholesale) &&
        (filters.near !== "near" || product.supplier.km == null || product.supplier.km <= NEAR_ME_KM) &&
        (filters.near !== "state" || product.supplier.sameState === true) &&
        (filters.near !== "customers" || product.supplier.nearCustomers === true) &&
        (!band || (product.cost >= band.min && product.cost < band.max)),
    );
  }, [products, filters, added]);
  const pickable = shown.filter((product) => !product.sample && !added.has(product.id));
  const set = (patch: Partial<Filters>) => setFilters((now) => ({ ...now, ...patch }));
  const toggle = (id: string) => setPicked((now) => (now.includes(id) ? now.filter((item) => item !== id) : [...now, id]));
  const stop = () => {
    setSelecting(false);
    setPicked([]);
  };
  const priceOf = (product: FindProduct) => quickAddPrice({ cost: product.cost, suggested: product.price, minRetail: product.floor ?? null, markup }).price;

  const filterChip = (key: string, label: string, on: boolean, onClick: () => void) => (
    <button key={key} type="button" aria-pressed={on} onClick={onClick} className={cx("inline-flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-full border px-4 text-[14px] font-bold", on ? "border-app-ink bg-app-ink text-white" : "border-app-line bg-white text-app-ink hover:border-app-line-strong")}>
      {on ? <Icon name="check" size={14} /> : null}
      {label}
    </button>
  );

  return (
    <>
      {chips.length > 1 && (
        <nav aria-label={t("grid.categories")} className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0">
          {chips.map((chip) => (
            <Link
              key={chip.label}
              href={chip.href}
              aria-current={chip.active ? "page" : undefined}
              className={cx(
                "inline-flex min-h-[40px] shrink-0 items-center rounded-full border px-4 text-[14px] font-bold no-underline",
                chip.active ? "border-app-ink bg-app-ink text-white" : "border-app-line bg-white text-app-ink hover:border-app-line-strong",
              )}
            >
              {chip.label}
            </Link>
          ))}
        </nav>
      )}

      {products.length > 0 && (
        <div role="group" aria-label={t("filter.label")} data-testid="find-filters" className="-mx-4 flex items-center gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
          {filterChip("select", t("select.button"), selecting, () => (selecting ? stop() : setSelecting(true)))}
          {filterChip("notInShop", t("filter.notInShop"), filters.notInShop, () => set({ notInShop: !filters.notInShop }))}
          {filterChip("verified", t("filter.verified"), filters.verified, () => set({ verified: !filters.verified }))}
          {filterChip("dropship", t("filter.dropship"), filters.way === "dropship", () => set({ way: filters.way === "dropship" ? "" : "dropship" }))}
          {filterChip("wholesale", t("filter.wholesale"), filters.way === "wholesale", () => set({ way: filters.way === "wholesale" ? "" : "wholesale" }))}
          {filterChip("near", t("filter.nearMe", { km: NEAR_ME_KM }), filters.near === "near", () => set({ near: filters.near === "near" ? "" : "near" }))}
          {filterChip("state", t("filter.myState"), filters.near === "state", () => set({ near: filters.near === "state" ? "" : "state" }))}
          {customers ? filterChip("customers", t("filter.nearCustomers"), filters.near === "customers", () => set({ near: filters.near === "customers" ? "" : "customers" })) : null}
          <label className="inline-flex min-h-[40px] shrink-0 items-center gap-2 rounded-full border border-app-line bg-white pl-4 pr-2 text-[14px] font-bold">
            {t("filter.price")}
            <select aria-label={t("filter.price")} value={filters.price} onChange={(event) => set({ price: event.target.value as Filters["price"] })} className="min-h-[34px] rounded-full border-0 bg-app-canvas px-2 text-[14px] font-bold outline-none">
              <option value="">{t("filter.any")}</option>
              {PRICE_BANDS.map((band) => <option key={band.key} value={band.key}>{t(`filter.price.${band.key}`)}</option>)}
            </select>
          </label>
          {JSON.stringify(filters) !== JSON.stringify(NO_FILTERS) ? <button type="button" onClick={() => setFilters(NO_FILTERS)} className="min-h-[40px] shrink-0 px-2 text-[14px] font-bold text-app-accent-ink underline underline-offset-4">{t("filter.clear")}</button> : null}
        </div>
      )}
      {products.length > 0 ? <p className="m-0 text-[13.5px] text-app-ink-soft">{selecting ? t("select.hint") : t("quick.hint", { count: shown.length })}</p> : null}
      {filters.near === "customers" && customers ? (
        <p data-testid="near-customers-hint" className="m-0 flex flex-wrap items-center gap-1.5 text-[13.5px] text-app-ink-soft">
          <Icon name="pin" size={14} />
          {customers.basis === "orders" ? t("filter.nearCustomersFrom", { places: customers.states.join(", ") }) : t("filter.nearCustomersStore", { places: customers.states.join(", ") })}
        </p>
      ) : null}

      {shown.length === 0 ? (
        <div className="rounded-[22px] border border-app-line bg-white px-6 py-12 text-center">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-app-peach text-app-accent-ink"><Icon name="search" size={22} /></span>
          <p className="mx-auto mb-0 mt-4 max-w-[420px] text-[14.5px] leading-[1.55] text-app-ink-soft">{products.length ? t("filter.none") : emptyText}</p>
          {products.length ? (
            <button type="button" onClick={() => setFilters(NO_FILTERS)} className="mt-4 inline-flex min-h-[40px] items-center rounded-full bg-app-ink px-4 text-[14px] font-bold text-white">{t("filter.clear")}</button>
          ) : (
            <Link href="/marketplace" className="mt-4 inline-flex min-h-[40px] items-center rounded-full bg-app-ink px-4 text-[14px] font-bold text-white no-underline">{t("grid.seeEverything")}</Link>
          )}
        </div>
      ) : (
        <ul className="m-0 grid list-none grid-cols-2 gap-3 p-0 lg:grid-cols-3 xl:grid-cols-4 sm:gap-4">
          {shown.map((product) => {
            const isAdded = added.has(product.id);
            const isPicked = picked.includes(product.id);
            const href = `/marketplace/product/${encodeURIComponent(product.id)}`;
            const price = priceOf(product);
            // "Sell": the supplier's suggested price, else what one click would list it at (cost + your markup).
            const sell = product.price > 0 ? product.price : price;
            const sale = saleBreakdown(sell, product.cost);
            const canPick = selecting && !isAdded && !product.sample;
            return (
              <li
                key={product.id}
                data-testid={`find-card-${product.id}`}
                // Cards off screen aren't laid out or painted until they scroll near (a long list stays quick).
                style={{ contentVisibility: "auto", containIntrinsicSize: "auto 460px" }}
                className={cx("relative flex min-w-0 flex-col overflow-hidden rounded-[18px] border bg-white sm:rounded-[22px]", isPicked ? "border-2 border-app-ink" : "border-app-line", selecting && isAdded && "opacity-60")}
              >
                <Link href={href} className="relative block aspect-[4/3] overflow-hidden bg-app-canvas" aria-label={t("grid.details", { name: product.name })} onClick={canPick ? (event) => { event.preventDefault(); toggle(product.id); } : undefined}>
                  {product.images[0] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={product.images[0]} alt={product.name} loading="lazy" className="h-full w-full object-cover transition duration-300 hover:scale-[1.03]" />
                  ) : (
                    <span className="absolute inset-0 grid place-items-center text-app-ink-faint"><Icon name="image" size={32} /></span>
                  )}
                  {product.featured || product.preorder || isAdded ? (
                    <span className="absolute left-2 right-12 top-2 flex flex-col items-start gap-1">
                      {isAdded ? <span className="rounded-full bg-app-success-tint px-2.5 py-1 text-[11.5px] font-bold text-app-success">{t("grid.inShop")}</span> : null}
                      {product.featured ? <span className="rounded-full bg-app-ink px-2.5 py-1 text-[11.5px] font-bold text-white">{t("featured")}</span> : null}
                      {/* The supplier takes preorders on this listing (shared/preorder.ts). */}
                      {product.preorder ? (
                        <span className="max-w-full truncate rounded-full bg-[#FDF0D5] px-2.5 py-1 text-[11.5px] font-bold text-[#8A5A00]">
                          {!product.preorder.open
                            ? t("pd.preorderFull")
                            : product.preorder.shipsOn
                              ? `${t("pd.preorder")} · ${formatDate(new Date(`${product.preorder.shipsOn}T12:00:00Z`), locale, { day: "numeric", month: "short", timeZone: "UTC" })}`
                              : t("pd.preorder")}
                        </span>
                      ) : null}
                    </span>
                  ) : null}
                </Link>
                {canPick ? (
                  <button type="button" role="checkbox" aria-checked={isPicked} aria-label={t("select.pickOne", { name: product.name })} onClick={() => toggle(product.id)} className={cx("absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full border-2", isPicked ? "border-app-ink bg-app-ink text-white" : "border-white bg-black/30 text-white")}>
                    {isPicked ? <Icon name="check" size={16} strokeWidth={3} /> : null}
                  </button>
                ) : null}
                <div className="flex flex-1 flex-col p-3 sm:p-3.5">
                  <h3 className="m-0 text-[14.5px] font-extrabold leading-tight sm:text-[15.5px]">
                    <Link href={href} className="text-app-ink no-underline hover:underline">{product.name}</Link>
                  </h3>
                  <p className="mb-0 mt-1 text-[12px] leading-[1.4] text-app-ink-soft sm:text-[12.5px]">{supplierLine(product)}</p>
                  {!product.sample ? <div className="mt-1.5"><SupplierTrustBadges supplier={product.supplier} compact /></div> : null}
                  <CardFacts product={product} />
                  <div className="mt-2 flex flex-wrap items-baseline justify-between gap-x-2 text-[13px] sm:text-[14px]">
                    <span>{t("grid.cost")} <strong className="font-extrabold">{money(product.cost)}</strong></span>
                    <span>{t("grid.sell")} <strong className="font-extrabold">{money(sell)}</strong></span>
                  </div>
                  <p className="mb-0 mt-0.5 text-[13px] font-extrabold text-app-success sm:text-[14px]">{t("grid.keep", { amount: money(sale.keep), pct: sale.keepPct })}</p>
                  <div className="mt-auto pt-3">
                    {isAdded ? (
                      <p className="m-0 flex min-h-[40px] items-center justify-center gap-1.5 text-[14px] font-extrabold text-app-success"><Icon name="check" size={16} /> {t("grid.addedToStore")}</p>
                    ) : selecting ? (
                      <button type="button" onClick={() => (product.sample ? setSample(product) : toggle(product.id))} className={cx("inline-flex min-h-[40px] w-full items-center justify-center rounded-full border px-3 text-[13.5px] font-bold", isPicked ? "border-app-ink bg-app-ink text-white" : "border-app-line bg-white")}>
                        {isPicked ? t("select.picked") : t("select.pick")}
                      </button>
                    ) : needsAgreement(product) ? (
                      // Dropship from a supplier the seller hasn't agreed with yet: call, check the stock and agree first.
                      <Link href={`${href}#before-you-list`} className="inline-flex min-h-[40px] w-full items-center justify-center rounded-full border border-app-ink bg-white px-3 text-center text-[13px] font-bold text-app-ink no-underline sm:min-h-[42px]">
                        {t("trust.checkFirst")}
                      </Link>
                    ) : (
                      <div className="flex flex-col gap-2 min-[520px]:flex-row">
                        <button
                          type="button"
                          data-testid={`find-add-${product.id}`}
                          onClick={() => (product.sample ? setSample(product) : quick.addOne(product.id, href))}
                          disabled={quick.busy === product.id}
                          className="inline-flex min-h-[40px] flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-full bg-app-ink px-3 text-[13.5px] font-bold text-white hover:bg-black disabled:opacity-60 sm:min-h-[42px] sm:text-[14px]"
                          aria-label={t("quick.addLabel", { name: product.name, price: money(price) })}
                        >
                          <Icon name="plus" size={15} />
                          {quick.busy === product.id ? t("grid.adding") : t("quick.addShort", { price: money(price) })}
                        </button>
                        <Link href={href} className="inline-flex min-h-[40px] items-center justify-center rounded-full border border-app-line bg-white px-4 text-[13.5px] font-bold text-app-ink no-underline hover:border-app-line-strong sm:min-h-[42px] sm:text-[14px]">
                          {t("grid.detailsBtn")}
                        </Link>
                      </div>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {selecting ? (
        <div className="sticky bottom-3 z-30 flex flex-wrap items-center gap-3 rounded-[20px] border border-app-line bg-white px-4 py-3 shadow-lg" data-testid="select-bar">
          <span className="text-[14.5px] font-extrabold">{t("select.count", { count: picked.length })}</span>
          <button type="button" onClick={() => setPicked(picked.length >= pickable.length ? [] : pickable.map((product) => product.id))} className="min-h-[40px] text-[14px] font-bold text-app-accent-ink underline underline-offset-4">
            {picked.length >= pickable.length && pickable.length ? t("select.none") : t("select.all", { count: pickable.length })}
          </button>
          <button type="button" onClick={stop} className="min-h-[40px] text-[14px] font-bold text-app-ink-soft">{t("select.cancel")}</button>
          <button type="button" data-testid="select-add" disabled={!picked.length} onClick={() => quick.addMany(picked, stop)} className="ml-auto inline-flex min-h-[46px] items-center gap-2 rounded-full bg-app-accent px-5 text-[15px] font-extrabold text-app-ink disabled:opacity-50">
            <Icon name="plus" size={16} /> {picked.length ? t("select.add", { count: picked.length }) : t("select.tick")}
          </button>
        </div>
      ) : null}

      {quick.ui}
      <SampleNotice open={Boolean(sample)} onClose={() => setSample(null)} productName={sample?.name} notified={notified} />
    </>
  );
}

/** "★ 4.6 (18) · 12 shops selling": the supplier's rating from shops and how many shops sell it now (hidden at 0). */
function CardFacts({ product }: { product: FindProduct }) {
  const t = useT("marketplace");
  const rated = !product.sample && product.supplier.rating && (product.supplier.ratingCount ?? 0) > 0;
  const selling = product.shopsSelling ?? 0;
  if (!rated && selling <= 0) return null;
  return (
    <p className="mb-0 mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] font-bold text-app-ink-soft" data-testid={`find-facts-${product.id}`}>
      {rated ? (
        <span aria-label={t("rate.cardLabel", { rating: product.supplier.rating!.toFixed(1), count: product.supplier.ratingCount ?? 0 })}>
          <span className="text-[#F2A93B]">★</span> {product.supplier.rating!.toFixed(1)} <span className="font-normal">({product.supplier.ratingCount})</span>
        </span>
      ) : null}
      {selling > 0 ? <span className="rounded-full bg-[#E2F6F1] px-2 py-0.5 text-[#0C4A44]">{t("shops.selling", { count: selling })}</span> : null}
    </p>
  );
}
