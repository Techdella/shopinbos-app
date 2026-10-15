"use client";

import type React from "react";
import { productCategories } from "../../shopper/catalog";
import { SectionTitle } from "../BoutiqueChrome";
import { choice, intSetting, str } from "./block-logic";
import type { BlockContext } from "./shared";

const RATIO = { square: "1 / 1", portrait: "4 / 5", landscape: "3 / 2" } as const;

/** Collection grid: picture tiles for collections or categories, 2–5 across on computers, two on phones. */
export function CollectionGrid({ ctx }: { ctx: BlockContext }) {
  const { copy, settings, look, shopper, products, headingId } = ctx;
  const source = choice(settings.source, ["auto", "collections", "categories"] as const, "auto");
  const useCollections = source === "collections" || (source === "auto" && shopper.collections.length > 0);
  const tiles = useCollections
    ? shopper.collections.map((collection) => ({
        key: collection.id,
        name: collection.name,
        image: collection.imageUrl ?? products.find((product) => collection.productIds.includes(product.id))?.images[0] ?? null,
        count: collection.productIds.length,
        onSelect: () => ctx.shopCollection(collection.id),
      }))
    : productCategories(products).map((category) => ({ key: category.slug, name: category.name, image: category.imageUrl, count: category.count, onSelect: () => ctx.shopCategory(category.slug) }));
  if (!tiles.length) {
    return ctx.editorHint(useCollections
      ?"Tiles appear once you create collections in Products."
      : "Tiles appear once your products have categories or you create collections.");
  }
  const columns = intSetting(settings.columns, 2, 5, 4);
  const limit = intSetting(settings.limit, 2, 15, 8);
  const shape = choice(settings.shape, ["square", "portrait", "landscape"] as const, "portrait");
  const labels = choice(settings.labels, ["overlay", "below"] as const, "overlay");
  const hover = choice(settings.hover, ["zoom", "lift", "none"] as const, "zoom");
  const t = look.tokens;
  return (
    <section aria-labelledby={headingId} className="bq-wrap py-10">
      <style>{`.bqb-cgrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}@container bq (min-width:760px){.bqb-cgrid{grid-template-columns:repeat(var(--bqb-cols),minmax(0,1fr));gap:18px}}.bqb-ctile .bq-media img{transition:transform .5s ease}.bqb-ctile{transition:transform .25s ease,box-shadow .25s ease}.bqb-cgrid[data-hover="zoom"] .bqb-ctile:hover .bq-media img,.bqb-cgrid[data-hover="zoom"] .bqb-ctile:focus-visible .bq-media img{transform:scale(1.06)}.bqb-cgrid[data-hover="lift"] .bqb-ctile:hover,.bqb-cgrid[data-hover="lift"] .bqb-ctile:focus-visible{transform:translateY(-4px);box-shadow:0 14px 30px rgba(0,0,0,.14)}@media (prefers-reduced-motion: reduce){.bqb-ctile,.bqb-ctile .bq-media img{transition:none}.bqb-cgrid .bqb-ctile:hover,.bqb-cgrid .bqb-ctile:hover .bq-media img{transform:none}}`}</style>
      {str(copy.title) ? <SectionTitle look={look} id={headingId}>{str(copy.title)}</SectionTitle> : null}
      <ul className="bqb-cgrid m-0 list-none p-0" data-hover={hover} style={{ "--bqb-cols": columns } as React.CSSProperties} aria-label={str(copy.title) ? undefined : "Collections"}>
        {tiles.slice(0, limit).map((tile) => (
          <li key={tile.key}>
            <button type="button" onClick={tile.onSelect} className="bqb-ctile block w-full cursor-pointer border-0 bg-transparent p-0 text-left" style={{ color: t.ink, borderRadius: look.cardRadius }}>
              <span className="bq-media block" style={{ aspectRatio: RATIO[shape], borderRadius: look.cardRadius, border: look.tileBorder }}>
                {tile.image ? <img src={tile.image} alt="" width={600} height={750} loading="lazy" decoding="async" /> : null}
                {labels === "overlay" ? (
                  <>
                    <span className="absolute inset-0" style={{ background: tile.image ? "linear-gradient(to top, rgba(0,0,0,.55), rgba(0,0,0,0) 55%)" : "transparent" }} aria-hidden />
                    <span className="absolute inset-x-0 bottom-0 p-3.5 text-[16px] font-semibold @3xl:p-5 @3xl:text-[19px]" style={{ color: tile.image ? "#fff" : t.ink, fontFamily: look.headingFont }}>{tile.name}</span>
                  </>
                ) : null}
              </span>
              {labels === "below" ? (
                <span className="mt-2.5 flex items-baseline justify-between gap-2">
                  <span className="text-[15px] font-semibold" style={{ fontFamily: look.headingFont }}>{tile.name}</span>
                  <span className="text-[12.5px]" style={{ color: t.muted }}>{tile.count} {tile.count === 1 ? "item" : "items"}</span>
                </span>
              ) : null}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
