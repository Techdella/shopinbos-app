"use client";

import type React from "react";
import { useT } from "@/components/i18n/I18nProvider";
import { SectionTitle } from "../BoutiqueChrome";
import { choice, str } from "./block-logic";
import { ItemLink, itemLink, type BlockContext } from "./shared";

/** Gift guide: picture tiles that send shoppers to gift ideas ("For him", "Under ₦20,000"); the store's collections when the seller hasn't added tiles. */
export function CampaignGiftGuide({ ctx }: { ctx: BlockContext }) {
  const t = useT("campaigns");
  const { copy, settings, look, shopper, products, headingId } = ctx;
  const own = ctx.items
    .map((item, index) => ({ key: `tile-${index}`, label: str(item.label), image: str(item.imageUrl), link: itemLink(item), collectionId: null as string | null }))
    .filter((tile) => tile.label);
  const tiles = own.length
    ? own
    : shopper.collections.slice(0, 8).map((collection) => ({
        key: collection.id,
        label: collection.name,
        image: collection.imageUrl ?? products.find((product) => collection.productIds.includes(product.id))?.images[0] ?? "",
        link: null,
        collectionId: collection.id as string | null,
      }));
  if (!tiles.length) return ctx.editorHint(t("section.giftsHint"));
  const columns = choice(settings.columns, ["2", "3", "4"] as const, "4");
  const tokens = look.tokens;
  const tile = (entry: (typeof tiles)[number]) => (
    <span className="relative block overflow-hidden" style={{ aspectRatio: "4 / 5", borderRadius: look.cardRadius, background: entry.image ? look.placeholder : tokens.accent }}>
      {entry.image ? <img src={entry.image} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" /> : null}
      <span aria-hidden className="absolute inset-0" style={{ background: entry.image ? "linear-gradient(to top, rgba(0,0,0,.6), rgba(0,0,0,0) 55%)" : "transparent" }} />
      <span className="absolute inset-x-0 bottom-0 p-4 text-[17px] font-semibold" style={{ color: entry.image ? "#FFFFFF" : look.onAccent, fontFamily: look.headingFont }}>{entry.label}</span>
    </span>
  );
  return (
    <section aria-labelledby={headingId} className="bq-wrap py-10">
      <style>{`.bqb-gifts{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}@container bq (min-width:760px){.bqb-gifts{grid-template-columns:repeat(var(--bqb-cols),minmax(0,1fr));gap:18px}}`}</style>
      <SectionTitle look={look} id={headingId}>{str(copy.title) || t("section.giftsTitle")}</SectionTitle>
      {str(copy.body) ? <p className="m-0 mb-5 max-w-[640px] text-[15px] leading-7" style={{ color: tokens.muted }}>{str(copy.body)}</p> : null}
      <ul className="bqb-gifts m-0 list-none p-0" style={{ "--bqb-cols": columns } as React.CSSProperties}>
        {tiles.map((entry) => (
          <li key={entry.key} className="min-w-0">
            {entry.collectionId ? (
              <button type="button" onClick={() => ctx.shopCollection(entry.collectionId!)} className="block w-full cursor-pointer border-0 bg-transparent p-0 text-left">{tile(entry)}</button>
            ) : (
              <ItemLink ctx={ctx} link={entry.link} className="block" label={entry.label}>{tile(entry)}</ItemLink>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
