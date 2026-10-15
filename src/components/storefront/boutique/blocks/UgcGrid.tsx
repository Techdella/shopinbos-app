"use client";

import type React from "react";
import { itemMediaUrl } from "@/lib/store-templates/section-content";
import { intSetting, str } from "./block-logic";
import { ItemLink, itemLink, SampleLabel, type BlockContext } from "./shared";

/** Customer photo grid: uploaded photos (with permission), each optionally linking to a product, page or post. */
export function UgcGrid({ ctx }: { ctx: BlockContext }) {
  const { copy, settings, items, look, products, headingId } = ctx;
  const t = look.tokens;
  let photos = items.map((item, index) => ({ key: index, src: itemMediaUrl(item), label: str(item.label), link: itemLink(item) })).filter((photo) => photo.src);
  const sample = ctx.editor && !photos.length;
  if (sample) photos = products.flatMap((product) => product.images.slice(0, 1)).slice(0, 8).map((src, key) => ({ key, src, label: "", link: null }));
  if (!photos.length) return ctx.editorHint("Add customer photos in the panel on the right.");
  const columns = intSetting(settings.columns, 3, 6, 4);
  return (
    <section aria-labelledby={headingId} className="bq-wrap py-12">
      <style>{`.bqb-ugc{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}@container bq (min-width:520px){.bqb-ugc{grid-template-columns:repeat(3,minmax(0,1fr))}}@container bq (min-width:760px){.bqb-ugc{grid-template-columns:repeat(var(--bqb-cols),minmax(0,1fr));gap:12px}}.bqb-ugc-tile img{transition:transform .4s ease}.bqb-ugc-tile:hover img{transform:scale(1.05)}@media (prefers-reduced-motion: reduce){.bqb-ugc-tile img{transition:none}.bqb-ugc-tile:hover img{transform:none}}`}</style>
      {sample ? <SampleLabel look={look}>{ctx.say("Sample with your product photos. Add your customers' photos.")}</SampleLabel> : null}
      <div className="mb-6 text-center">
        <h2 id={headingId} className="bq-h text-[26px] @3xl:text-[30px]" style={look.headingStyle}>{str(copy.title) || "As worn by you"}</h2>
        {str(copy.body) ? <p className="m-0 mt-2 text-[15px]" style={{ color: t.muted }}>{str(copy.body)}</p> : null}
      </div>
      <ul className="bqb-ugc m-0 list-none p-0" style={{ "--bqb-cols": columns } as React.CSSProperties}>
        {photos.map((photo) => (
          <li key={photo.key}>
            <ItemLink ctx={ctx} link={photo.link} className="bqb-ugc-tile relative block" label={photo.label || undefined}>
              <span className="bq-media block" style={{ aspectRatio: "1 / 1", borderRadius: Math.min(look.cardRadius, 12) }}>
                <img src={photo.src} alt={photo.label ? `Customer photo: ${photo.label}` : "Customer photo"} width={400} height={400} loading="lazy" decoding="async" />
                {photo.label ? <span className="absolute inset-x-0 bottom-0 truncate px-2.5 py-2 text-[12.5px] font-semibold text-white" style={{ background: "linear-gradient(to top, rgba(0,0,0,.55), rgba(0,0,0,0))" }}>{photo.label}</span> : null}
              </span>
            </ItemLink>
          </li>
        ))}
      </ul>
    </section>
  );
}
