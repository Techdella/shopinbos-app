"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { addSupplierProductToStore } from "@/app/actions/sourcing";
import { cx } from "@/components/app-ui/cx";
import { Icon } from "@/components/ui/Icon";
import { naira, saleBreakdown, supplierLine, type FindProduct } from "@/lib/marketplace/find";
import { SampleNotice } from "./SampleNotice";
import { useLocale, useT } from "@/components/i18n/I18nProvider";
import { formatMoney } from "@shared/i18n";

interface Chip {
  label: string;
  href: string;
  active: boolean;
}

/** Category chips and the product cards; "Add to store" adds in place and shows the green banner. */
export function ProductGrid({ products, addedIds, chips, notified, emptyText }: { products: FindProduct[]; addedIds: string[]; chips: Chip[]; notified: boolean; emptyText: string }) {
  const t = useT("marketplace");
  const locale = useLocale();
  const money = (amount: number) => (locale === "en" ? naira(amount) : formatMoney(Math.round(amount), locale));
  const [added, setAdded] = useState(() => new Set(addedIds));
  const [justAdded, setJustAdded] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sample, setSample] = useState<FindProduct | null>(null);
  const [, start] = useTransition();

  function add(product: FindProduct) {
    if (product.sample) {
      setSample(product);
      return;
    }
    setError(null);
    setBusy(product.id);
    start(async () => {
      const result = await addSupplierProductToStore({ supplierProductId: product.id });
      setBusy(null);
      if (!result.ok) {
        if (result.sample) setSample(product);
        else setError(result.error);
        return;
      }
      setAdded((current) => new Set(current).add(product.id));
      if (!result.already) setJustAdded((count) => count + 1);
    });
  }

  return (
    <>
      {justAdded > 0 && (
        <div role="status" className="flex flex-wrap items-center justify-between gap-2 rounded-[16px] bg-app-success-tint px-4 py-3 text-[14.5px] font-extrabold text-app-success">
          <span className="inline-flex items-center gap-2"><Icon name="check" size={17} /> {t("grid.added", { count: justAdded })}</span>
          <Link href="/products" className="text-app-success no-underline hover:underline">{t("grid.viewProducts")}</Link>
        </div>
      )}
      {error && <p role="alert" className="m-0 rounded-[16px] bg-app-danger-tint px-4 py-3 text-[14px] font-bold text-app-danger">{error}</p>}

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

      {products.length === 0 ? (
        <div className="rounded-[22px] border border-app-line bg-white px-6 py-12 text-center">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-app-peach text-app-accent-ink"><Icon name="search" size={22} /></span>
          <p className="mx-auto mb-0 mt-4 max-w-[420px] text-[14.5px] leading-[1.55] text-app-ink-soft">{emptyText}</p>
          <Link href="/marketplace" className="mt-4 inline-flex min-h-[40px] items-center rounded-full bg-app-ink px-4 text-[14px] font-extrabold text-white no-underline">{t("grid.seeEverything")}</Link>
        </div>
      ) : (
        <ul className="m-0 grid list-none grid-cols-2 gap-3 p-0 lg:grid-cols-3 xl:grid-cols-4 sm:gap-4">
          {products.map((product) => {
            const sale = saleBreakdown(product.price, product.cost);
            const isAdded = added.has(product.id);
            const href = `/marketplace/product/${encodeURIComponent(product.id)}`;
            return (
              <li key={product.id} className="flex min-w-0 flex-col overflow-hidden rounded-[18px] border border-app-line bg-white sm:rounded-[22px]">
                <Link href={href} className="relative block aspect-[4/3] overflow-hidden bg-app-canvas" aria-label={t("grid.details", { name: product.name })}>
                  {product.images[0] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={product.images[0]} alt={product.name} loading="lazy" className="h-full w-full object-cover transition duration-300 hover:scale-[1.03]" />
                  ) : (
                    <span className="absolute inset-0 grid place-items-center text-app-ink-faint"><Icon name="image" size={32} /></span>
                  )}
                </Link>
                <div className="flex flex-1 flex-col p-3 sm:p-3.5">
                  <h3 className="m-0 text-[14.5px] font-extrabold leading-tight sm:text-[15.5px]">
                    <Link href={href} className="text-app-ink no-underline hover:underline">{product.name}</Link>
                  </h3>
                  <p className="mb-0 mt-1 text-[12px] leading-[1.4] text-app-ink-soft sm:text-[12.5px]">{supplierLine(product)}</p>
                  <div className="mt-2 flex flex-wrap items-baseline justify-between gap-x-2 text-[13px] sm:text-[14px]">
                    <span>{t("grid.cost")} <strong className="font-extrabold">{money(product.cost)}</strong></span>
                    <span>{t("grid.sell")} <strong className="font-extrabold">{money(product.price)}</strong></span>
                  </div>
                  <p className="mb-0 mt-0.5 text-[13px] font-extrabold text-app-success sm:text-[14px]">{t("grid.keep", { amount: money(sale.keep), pct: sale.keepPct })}</p>
                  <div className="mt-auto pt-3">
                    {isAdded ? (
                      <p className="m-0 flex min-h-[40px] items-center justify-center gap-1.5 text-[14px] font-extrabold text-app-success"><Icon name="check" size={16} /> {t("grid.addedToStore")}</p>
                    ) : (
                      <div className="flex flex-col gap-2 min-[520px]:flex-row">
                        <button
                          type="button"
                          onClick={() => add(product)}
                          disabled={busy === product.id}
                          className="inline-flex min-h-[40px] flex-1 items-center justify-center whitespace-nowrap rounded-full bg-app-ink px-3 text-[13.5px] font-extrabold text-white hover:bg-black disabled:opacity-60 sm:min-h-[42px] sm:text-[14px]"
                          aria-label={t("grid.addLabel", { name: product.name })}
                        >
                          {busy === product.id ? t("grid.adding") : t("grid.add")}
                        </button>
                        <Link href={href} className="inline-flex min-h-[40px] items-center justify-center rounded-full border border-app-line bg-white px-4 text-[13.5px] font-extrabold text-app-ink no-underline hover:border-app-line-strong sm:min-h-[42px] sm:text-[14px]">
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

      <SampleNotice open={Boolean(sample)} onClose={() => setSample(null)} productName={sample?.name} notified={notified} />
    </>
  );
}
