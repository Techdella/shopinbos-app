"use client";

import { useState } from "react";
import type React from "react";
import { boolSetting, intSetting, str, tabProducts, type ProductTab } from "./block-logic";
import { BlockProductCard, type BlockContext, words } from "./shared";

/** Tabbed products: best sellers, new arrivals and sale items behind tabs that switch on the page. */
export function TabbedProducts({ ctx }: { ctx: BlockContext }) {
  const { copy, settings, look, products, headingId } = ctx;
  const t = look.tokens;
  const limit = intSetting(settings.limit, 2, 16, 8);
  const tabs = ([
    { id: "best", label: str(copy.bestLabel) || "Best sellers", on: boolSetting(settings.showBest, true) },
    { id: "new", label: str(copy.newLabel) || "New arrivals", on: boolSetting(settings.showNew, true) },
    { id: "sale", label: str(copy.saleLabel) || "On sale", on: boolSetting(settings.showSale, true) },
  ] as Array<{ id: ProductTab; label: string; on: boolean }>)
    .filter((tab) => tab.on)
    .map((tab) => ({ ...tab, products: tabProducts(products, tab.id, limit) }))
    .filter((tab) => tab.products.length > 0);
  const [active, setActive] = useState<ProductTab | null>(null);
  if (!tabs.length) return ctx.editorHint("Your products show here once you add some. The On sale tab needs products with a was-price.");
  const current = tabs.find((tab) => tab.id === active) ?? tabs[0]!;
  const tabId = (id: string) => `${headingId}-tab-${id}`;
  const panelId = `${headingId}-panel`;
  const onKey = (event: React.KeyboardEvent, index: number) => {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    const next = tabs[(index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length]!;
    setActive(next.id);
    document.getElementById(tabId(next.id))?.focus();
  };
  return (
    <section aria-labelledby={headingId} className="bq-wrap py-10">
      <h2 id={headingId} className="bq-h text-center text-[26px] @3xl:text-[30px]" style={look.headingStyle}>{words(ctx, "title", "Shop our favourites")}</h2>
      {tabs.length > 1 ? (
        <div role="tablist" aria-labelledby={headingId} className="mx-auto mb-6 mt-5 flex max-w-full justify-center gap-2 overflow-x-auto pb-1">
          {tabs.map((tab, index) => {
            const selected = tab.id === current.id;
            return (
              <button
                key={tab.id}
                id={tabId(tab.id)}
                type="button"
                role="tab"
                aria-selected={selected}
                aria-controls={panelId}
                tabIndex={selected ? 0 : -1}
                onKeyDown={(event) => onKey(event, index)}
                onClick={() => setActive(tab.id)}
                className="shrink-0 rounded-full border px-4 py-2 text-[14px] font-semibold"
                style={{ borderColor: selected ? t.ink : t.border, background: selected ? t.ink : "transparent", color: selected ? t.paperBg : t.ink, cursor: "pointer" }}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      ) : <div className="mb-6" />}
      <div id={panelId} role={tabs.length > 1 ? "tabpanel" : undefined} aria-labelledby={tabs.length > 1 ? tabId(current.id) : undefined} className="bq-shop-grid">
        {current.products.map((product, index) => <BlockProductCard key={product.id} ctx={ctx} product={product} eager={index < 4} />)}
      </div>
    </section>
  );
}
