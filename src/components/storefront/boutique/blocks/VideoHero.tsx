"use client";

import { SlideMedia } from "../../HeroSlider";
import { mediaKind, type HeroSlide } from "@/lib/store-templates/section-content";
import { choice, str } from "./block-logic";
import { heightFor, overlayColor, SampleLabel, useReducedMotion, type BlockContext } from "./shared";

function asSlide(url: string): HeroSlide {
  return { mediaUrl: url, mediaType: mediaKind(url), alt: "", heading: "", text: "", buttonLabel: "", link: { type: "page", value: "products" }, textTone: "light", textPosition: "left" };
}

/** Video hero: a muted, looping video (upload or YouTube) behind the words. Reduced motion shows the cover picture. */
export function VideoHero({ ctx }: { ctx: BlockContext }) {
  const { copy, settings, look, products, headingId } = ctx;
  const reduced = useReducedMotion();
  const video = str(copy.videoUrl);
  const poster = str(copy.posterUrl) || products.find((product) => product.images[0])?.images[0] || "";
  const kind = mediaKind(video);
  const playable = (kind === "video" || kind === "youtube") && !reduced;
  const align = choice(settings.textAlign, ["left", "center", "right"] as const, "center");
  const title = str(copy.title);
  const cta = str(copy.cta);
  const background = playable ? asSlide(video) : poster ? asSlide(poster) : null;
  return (
    <section aria-labelledby={title ? headingId : undefined} aria-label={title ? undefined : "Video banner"}>
      <div className="relative flex w-full overflow-hidden" style={{ minHeight: heightFor(str(settings.height)), background: look.tokens.heroBg }}>
        {background ? <SlideMedia slide={background} eager /> : null}
        <div className="absolute inset-0" style={{ background: background ? overlayColor(str(settings.overlay)) : "transparent" }} aria-hidden />
        <div className="bq-wrap relative flex w-full flex-col justify-center py-14" style={{ alignItems: align === "left" ? "flex-start" : align === "right" ? "flex-end" : "center", textAlign: align, color: background ? "#fff" : look.tokens.heroText }}>
          {ctx.editor && !video ? <SampleLabel look={look}>{ctx.say("Add a video in the panel on the right.")}</SampleLabel> : null}
          {title ? <h2 id={headingId} className="bq-h max-w-[18ch]" style={{ ...look.headingStyle, fontSize: "clamp(34px, 6cqi, 76px)", lineHeight: 1.02 }}>{title}</h2> : null}
          {str(copy.body) ? <p className="m-0 mt-3 max-w-[540px] text-[16px] leading-7 opacity-90">{str(copy.body)}</p> : null}
          {cta ? <button type="button" className="bq-btn mt-6" style={background ? { background: "#fff", color: "#111", border: "1.5px solid #fff" } : look.primaryButton} onClick={() => ctx.go(str(settings.action) || "products")}>{cta}</button> : null}
        </div>
      </div>
    </section>
  );
}
