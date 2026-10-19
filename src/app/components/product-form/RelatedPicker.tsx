"use client";

import { useMemo, useState } from "react";
import { cx } from "@/components/app-ui";
import { Icon } from "@/components/ui/Icon";
import { field } from "@/components/seller-core";
import { useT } from "@/components/i18n/I18nProvider";

// "Customers also like" on the product form: up to 8 of the store's own products, in the order picked. When none are
// picked the product page fills the row itself (same type, category or tags).

export interface RelatedOption {
  id: string;
  name: string;
  image: string | null;
  price: number;
}

export const MAX_RELATED_PICKS = 8;

export function RelatedPicker({ products, value, onChange }: { products: RelatedOption[]; value: string[]; onChange: (ids: string[]) => void }) {
  const t = useT("productTypes");
  const [query, setQuery] = useState("");
  const byId = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);
  const picked = value.map((id) => byId.get(id)).filter((product): product is RelatedOption => Boolean(product));
  const matches = useMemo(() => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return products.filter((product) => !value.includes(product.id) && words.every((word) => product.name.toLowerCase().includes(word))).slice(0, 12);
  }, [products, query, value]);
  const full = value.length >= MAX_RELATED_PICKS;

  if (!products.length) return <p className="m-0 text-[14px] text-app-ink-soft">{t("related.noProducts")}</p>;

  return (
    <div className="grid gap-3">
      {picked.length ? (
        <ol className="m-0 grid list-none gap-2 p-0" aria-label={t("related.picked")}>
          {picked.map((product, index) => (
            <li key={product.id} className="flex items-center gap-3 rounded-[14px] border border-app-line p-2">
              <Thumb src={product.image} />
              <span className="min-w-0 flex-1 truncate text-[14px] font-bold">{product.name}</span>
              <button type="button" disabled={index === 0} onClick={() => onChange(move(value, index, index - 1))} aria-label={t("related.moveUp", { name: product.name })} className="grid h-10 w-10 place-items-center rounded-full hover:bg-app-canvas disabled:opacity-30">
                <Icon name="arrowUp" size={14} />
              </button>
              <button type="button" onClick={() => onChange(value.filter((id) => id !== product.id))} aria-label={t("related.remove", { name: product.name })} className="grid h-10 w-10 place-items-center rounded-full text-app-danger hover:bg-app-danger-tint">
                <Icon name="x" size={14} />
              </button>
            </li>
          ))}
        </ol>
      ) : (
        <p className="m-0 rounded-[14px] bg-app-canvas px-4 py-3 text-[14px] text-app-ink-soft">{t("related.auto")}</p>
      )}
      {full ? (
        <p className={field.hint}>{t("related.full", { max: MAX_RELATED_PICKS })}</p>
      ) : (
        <>
          <input value={query} onChange={(e) => setQuery(e.target.value)} className={field.input} placeholder={t("related.search")} aria-label={t("related.search")} />
          <ul className="m-0 grid list-none gap-1.5 p-0 sm:grid-cols-2">
            {matches.map((product) => (
              <li key={product.id}>
                <button type="button" onClick={() => onChange([...value, product.id].slice(0, MAX_RELATED_PICKS))} className={cx("flex w-full items-center gap-3 rounded-[14px] border border-app-line bg-white p-2 text-left hover:border-app-line-strong")}>
                  <Thumb src={product.image} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-bold">{product.name}</span>
                    <span className="block text-[12.5px] text-app-ink-soft">₦{Math.round(product.price).toLocaleString("en-NG")}</span>
                  </span>
                  <Icon name="plus" size={15} className="shrink-0" />
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function move(list: string[], from: number, to: number) {
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

function Thumb({ src }: { src: string | null }) {
  return (
    <span className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-[10px] bg-app-canvas">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {src ? <img src={src} alt="" className="h-full w-full object-cover" /> : <Icon name="image" size={15} />}
    </span>
  );
}
