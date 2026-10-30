"use client";

import { itemMediaUrl } from "@/lib/store-templates/section-content";
import { boolSetting, str } from "./block-logic";
import { ItemLink, itemLink, SampleLabel, type BlockContext, words } from "./shared";

/** "As seen in": a row of press or partner logos (or names), grey until pointed at. Hidden until one is added. */
export function PressLogos({ ctx }: { ctx: BlockContext }) {
  const { copy, settings, items, look, headingId } = ctx;
  const t = look.tokens;
  let logos = items.map((item, index) => ({ key: index, src: itemMediaUrl(item), name: str(item.name), link: itemLink(item) })).filter((logo) => logo.src || logo.name);
  const sample = ctx.editor && !logos.length;
  if (sample) logos = ["Your press", "Your partner", "A magazine", "A show"].map((name, key) => ({ key, src: "", name, link: null }));
  if (!logos.length) return null;
  const grey = boolSetting(settings.grayscale, true);
  return (
    <section aria-labelledby={headingId} className="bq-wrap py-10 text-center">
      <style>{`.bqb-press[data-grey="1"] .bqb-logo{filter:grayscale(1);opacity:.7;transition:filter .2s,opacity .2s}.bqb-press[data-grey="1"] .bqb-logo:hover,.bqb-press[data-grey="1"] .bqb-logo:focus-within{filter:none;opacity:1}`}</style>
      {sample ? <SampleLabel look={look} say={ctx.say} /> : null}
      <h2 id={headingId} className="m-0 text-[12px] font-semibold uppercase" style={{ color: t.muted, letterSpacing: "0.2em", fontFamily: look.eyebrowFont }}>{words(ctx, "title", "As seen in")}</h2>
      <ul className="bqb-press m-0 mt-6 flex list-none flex-wrap items-center justify-center gap-x-10 gap-y-6 p-0" data-grey={grey ? "1" : "0"}>
        {logos.map((logo) => (
          <li key={logo.key} className="bqb-logo">
            <ItemLink ctx={ctx} link={logo.link} className="block" label={logo.name || undefined}>
              {logo.src
                ? <img src={logo.src} alt={logo.name} width={160} height={48} loading="lazy" decoding="async" className="h-8 w-auto max-w-[150px] object-contain @3xl:h-10" />
                : <span className="text-[20px] font-semibold" style={{ fontFamily: look.headingFont, color: t.ink }}>{logo.name}</span>}
            </ItemLink>
          </li>
        ))}
      </ul>
    </section>
  );
}
