"use client";

import { boolSetting, choice, str } from "./block-logic";
import { heightFor, overlayColor, useReducedMotion, type BlockContext, words } from "./shared";

const JUSTIFY = { top: "flex-start", center: "center", bottom: "flex-end" } as const;
const ITEMS = { left: "flex-start", center: "center", right: "flex-end" } as const;

/**
 * Full-width banner: an edge-to-edge picture with a badge, heading, text and button placed where the seller chose.
 * Parallax uses a fixed background on computers with a mouse only (phones and reduced motion get a still picture).
 */
export function ParallaxBanner({ ctx }: { ctx: BlockContext }) {
  const { copy, settings, look, products, headingId } = ctx;
  const reduced = useReducedMotion();
  const image = str(copy.mediaUrl) || products.find((product) => product.images[0])?.images[0] || "";
  const align = choice(settings.textAlign, ["left", "center", "right"] as const, "center");
  const vertical = choice(settings.textVertical, ["top", "center", "bottom"] as const, "center");
  const parallax = boolSetting(settings.parallax, true) && !reduced;
  const title = str(copy.title);
  const badge = str(copy.badge);
  const cta = str(copy.cta);
  return (
    <section aria-labelledby={title ? headingId : undefined} aria-label={title ? undefined : "Banner"}>
      <style>{`.bqb-par{background-size:cover;background-position:center}@media (hover:hover) and (pointer:fine){.bqb-par[data-parallax="1"]{background-attachment:fixed}}`}</style>
      <div
        className="bqb-par relative flex w-full"
        data-parallax={parallax ? "1" : "0"}
        style={{
          minHeight: heightFor(str(settings.height)),
          backgroundColor: image ? look.placeholder : look.tokens.heroBg,
          backgroundImage: image ? `url("${image.replace(/"/g, "%22")}")` : undefined,
        }}
      >
        <div className="absolute inset-0" style={{ background: image ? overlayColor(str(settings.overlay)) : "transparent" }} aria-hidden />
        <div className="bq-wrap relative flex w-full flex-col py-12" style={{ justifyContent: JUSTIFY[vertical], alignItems: ITEMS[align], textAlign: align, color: image ? "#fff" : look.tokens.heroText }}>
          {badge ? <span className="mb-4 inline-block rounded-full px-3.5 py-1.5 text-[12px] font-bold uppercase" style={{ background: look.tokens.accent, color: look.onAccent, letterSpacing: "0.12em" }}>{words(ctx, "badge", badge)}</span> : null}
          {title ? <h2 id={headingId} className="bq-h max-w-[18ch]" style={{ ...look.headingStyle, fontSize: "clamp(34px, 6cqi, 76px)", lineHeight: 1.02 }}>{words(ctx, "title", title)}</h2> : null}
          {str(copy.body) ? <p className="m-0 mt-3 max-w-[540px] text-[16px] leading-7 opacity-90">{words(ctx, "body")}</p> : null}
          {cta ? (
            <button type="button" className="bq-btn mt-6" style={image ? { background: "#fff", color: "#111", border: "1.5px solid #fff" } : look.primaryButton} onClick={() => ctx.go(str(settings.action) || "products")}>{words(ctx, "cta", cta)}</button>
          ) : null}
        </div>
      </div>
    </section>
  );
}
