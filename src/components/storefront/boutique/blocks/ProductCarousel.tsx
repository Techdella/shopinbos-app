"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { SectionTitle } from "../BoutiqueChrome";
import { blockProducts, boolSetting, intSetting, str } from "./block-logic";
import { BlockProductCard, useReducedMotion, type BlockContext } from "./shared";

export function pickedProductIds(items: Array<Record<string, unknown>>) {
  return items.map((item) => item.mappedStoreProductId).filter((id): id is string => typeof id === "string" && id.length > 0);
}

/** Products for a block with the usual source / collection / picked settings. */
export function sourcedProducts(ctx: BlockContext, limit: number) {
  const collectionId = str(ctx.settings.collectionId);
  const collection = ctx.shopper.collections.find((entry) => entry.id === collectionId);
  return blockProducts({
    products: ctx.products,
    source: str(ctx.settings.source) || "best-sellers",
    pickedIds: pickedProductIds(ctx.items),
    collectionProductIds: collection?.productIds ?? null,
    limit,
  });
}

/** Product carousel: a sliding row with arrows (computers), swipe (phones), stars from real reviews and quick add. */
export function ProductCarousel({ ctx }: { ctx: BlockContext }) {
  const { copy, settings, look, headingId } = ctx;
  const t = look.tokens;
  const track = useRef<HTMLUListElement>(null);
  const reduced = useReducedMotion();
  const [edges, setEdges] = useState({ start: true, end: false });
  const list = sourcedProducts(ctx, intSetting(settings.limit, 3, 20, 10));

  const measure = useCallback(() => {
    const node = track.current;
    if (!node) return;
    setEdges({ start: node.scrollLeft <= 4, end: node.scrollLeft + node.clientWidth >= node.scrollWidth - 4 });
  }, []);
  useEffect(() => {
    measure();
    const node = track.current;
    if (!node) return;
    node.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure);
    return () => {
      node.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
    };
  }, [measure, list.length]);

  if (!list.length) return ctx.editorHint(str(settings.source) === "picked" ? "Pick products in the panel on the right." : "Your products show here once you add some.");
  const title = str(copy.title) || "Featured products";
  const scroll = (direction: number) => {
    const node = track.current;
    if (node) node.scrollBy({ left: direction * node.clientWidth * 0.85, behavior: reduced ? "auto" : "smooth" });
  };
  const arrow = (direction: number, disabled: boolean) => (
    <button type="button" className="bq-icon-btn border" style={{ borderColor: t.border, width: 40, height: 40, opacity: disabled ? 0.35 : 1 }} disabled={disabled} onClick={() => scroll(direction)} aria-label={direction < 0 ? `Previous ${title}` : `More ${title}`}>
      <Icon name={direction < 0 ? "arrowLeft" : "chevRight"} size={16} />
    </button>
  );
  return (
    <section aria-labelledby={headingId} aria-roledescription="carousel" className="bq-wrap py-10">
      <style>{`.bqb-car{display:flex;gap:12px;overflow-x:auto;scroll-snap-type:x mandatory;scrollbar-width:none;padding-bottom:4px;-webkit-overflow-scrolling:touch}.bqb-car::-webkit-scrollbar{display:none}.bqb-car > li{flex:0 0 calc((100% - 12px)/2.2);scroll-snap-align:start;min-width:0}@container bq (min-width:760px){.bqb-car{gap:16px}.bqb-car > li{flex-basis:calc((100% - 48px)/4)}}@container bq (min-width:1100px){.bqb-car > li{flex-basis:calc((100% - 64px)/5)}}`}</style>
      <SectionTitle look={look} id={headingId} action={(
        <div className="flex items-center gap-3">
          {str(copy.cta) ? <button type="button" onClick={() => ctx.go("products")} className="border-0 bg-transparent p-0 text-[14px] font-semibold underline underline-offset-4" style={{ color: t.ink, cursor: "pointer" }}>{str(copy.cta)}</button> : null}
          <span className="bq-only-wide"><span className="flex gap-2">{arrow(-1, edges.start)}{arrow(1, edges.end)}</span></span>
        </div>
      )}>{title}</SectionTitle>
      <ul ref={track} className="bqb-car m-0 list-none p-0" aria-label={`${title}. Swipe or use the arrows for more.`} tabIndex={0}>
        {list.map((product, index) => (
          <li key={product.id} aria-roledescription="slide" aria-label={`${index + 1} of ${list.length}`}>
            <BlockProductCard ctx={ctx} product={product} eager={index < 2} rating={boolSetting(settings.showRating, true)} add={boolSetting(settings.quickAdd, true)} />
          </li>
        ))}
      </ul>
    </section>
  );
}
