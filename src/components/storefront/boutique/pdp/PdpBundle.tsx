"use client";

import { useT } from "@/components/i18n/I18nProvider";
import { formatStoreMoney } from "@/lib/storefront/shopper-info";
import type { BundleSummary } from "../../../../../shared/bundles.ts";
import type { BoutiqueLook } from "../look";

// "What's inside" on a bundle's product page (shared/bundles.ts): each item with how many, its size or option ("M / Red")
// when it has one, and its own price, then
// what they cost bought one by one and what the bundle saves. Items link to their own pages when `productHref` is set.

export function PdpBundle({ bundle, look, currency, productHref }: { bundle: BundleSummary; look: BoutiqueLook; currency: string; productHref?: (id: string) => string }) {
  const t = useT("bundles");
  const tokens = look.tokens;
  if (!bundle.items.length) return null;
  return (
    <section aria-label={t("shop.inside")} className="grid gap-3 border p-4" style={{ borderColor: tokens.border, borderRadius: Math.min(look.cardRadius, 16) }}>
      <p className="m-0 text-[11.5px] uppercase tracking-[0.14em]" style={{ color: tokens.muted, fontFamily: look.eyebrowFont }}>{t("shop.inside")}</p>
      <ul className="m-0 grid list-none gap-2.5 p-0">
        {bundle.items.map((item, index) => {
          const name = (
            <span className="min-w-0 flex-1 text-[14px] font-semibold leading-snug" style={{ color: tokens.ink }}>
              {item.quantity > 1 ? `${item.quantity} × ` : ""}
              {item.name}
              {item.variant ? <span className="font-normal" style={{ color: tokens.muted }}>{` · ${item.variant}`}</span> : null}
            </span>
          );
          return (
            <li key={`${item.id}:${item.variant ?? index}`} className="flex items-center gap-3">
              {item.image ? (
                <img src={item.image} alt="" width={44} height={44} className="h-11 w-11 shrink-0 object-cover" style={{ borderRadius: Math.min(look.cardRadius, 8) }} />
              ) : (
                <span aria-hidden className="h-11 w-11 shrink-0" style={{ background: tokens.border, borderRadius: Math.min(look.cardRadius, 8) }} />
              )}
              {productHref ? (
                <a href={productHref(item.id)} className="flex min-w-0 flex-1 no-underline hover:underline" style={{ color: "inherit" }}>{name}</a>
              ) : (
                name
              )}
              <span className="shrink-0 text-[13px]" style={{ color: tokens.muted }}>{formatStoreMoney(item.price * item.quantity, currency)}</span>
            </li>
          );
        })}
      </ul>
      <div className="grid gap-1 border-t pt-3 text-[13.5px]" style={{ borderColor: tokens.border }}>
        <p className="m-0 flex justify-between gap-3" style={{ color: tokens.muted }}>
          <span>{t("shop.separately")}</span>
          <span>{formatStoreMoney(bundle.partsTotal, currency)}</span>
        </p>
        {bundle.saving.amount > 0 ? (
          <p className="m-0 font-bold" style={{ color: tokens.ink }}>{t("shop.save", { amount: formatStoreMoney(bundle.saving.amount, currency), percent: bundle.saving.percent })}</p>
        ) : null}
      </div>
    </section>
  );
}
