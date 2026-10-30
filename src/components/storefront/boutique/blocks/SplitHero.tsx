"use client";

import { SlideMedia } from "../../HeroSlider";
import { mediaKind } from "@/lib/store-templates/section-content";
import { choice, str } from "./block-logic";
import { words, type BlockContext } from "./shared";

/** Split hero: picture or video on one side, eyebrow, headline, text and up to two buttons on the other. */
export function SplitHero({ ctx }: { ctx: BlockContext }) {
  const { copy, settings, look, store, products, headingId } = ctx;
  const t = look.tokens;
  const media = str(copy.mediaUrl) || products.find((product) => product.images[0])?.images[0] || "";
  const side = choice(settings.imageSide, ["left", "right"] as const, "right");
  const title = str(copy.title) || store.name;
  const primary = str(copy.primaryCta);
  const secondary = str(copy.secondaryCta);
  const slide = { mediaUrl: media, mediaType: mediaKind(media), alt: "", heading: "", text: "", buttonLabel: "", link: { type: "page" as const, value: "products" }, textTone: "light" as const, textPosition: "left" as const };
  return (
    <section aria-labelledby={headingId} style={{ background: t.heroBg, color: t.heroText }}>
      <style>{`.bqb-split{display:grid}.bqb-split-media{aspect-ratio:4/3}@container bq (min-width:760px){.bqb-split{grid-template-columns:1fr 1fr;min-height:520px}.bqb-split-media{aspect-ratio:auto;min-height:100%}.bqb-split[data-side="left"] .bqb-split-media{order:-1}.bqb-split[data-side="right"] .bqb-split-media{order:2}}`}</style>
      <div className="bqb-split" data-side={side}>
        <div className="bqb-split-media bq-media relative">
          {media ? <SlideMedia slide={slide} eager /> : null}
        </div>
        <div className="flex flex-col justify-center gap-4 px-6 py-10 @3xl:px-14">
          {str(copy.eyebrow) ? <p className="m-0 text-[12px] font-semibold uppercase" style={{ fontFamily: look.eyebrowFont, letterSpacing: "0.18em", color: t.accent }}>{words(ctx, "eyebrow")}</p> : null}
          <h2 id={headingId} className="bq-h max-w-[16ch]" style={{ ...look.headingStyle, fontSize: "clamp(34px, 5.4cqi, 64px)", lineHeight: 1.04 }}>{words(ctx, "title", title)}</h2>
          {str(copy.body) ? <p className="m-0 max-w-[480px] text-[16px] leading-7 opacity-85">{words(ctx, "body")}</p> : null}
          {primary || secondary ? (
            <div className="mt-1 flex flex-wrap gap-3">
              {primary ? <button type="button" className="bq-btn" style={look.primaryButton} onClick={() => ctx.go(str(settings.primaryAction) || "products")}>{words(ctx, "primaryCta", primary)}</button> : null}
              {secondary ? <button type="button" className="bq-btn" style={{ background: "transparent", color: t.heroText, border: `1.5px solid ${t.heroText}` }} onClick={() => ctx.go(str(settings.secondaryAction) || "about")}>{words(ctx, "secondaryCta", secondary)}</button> : null}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
