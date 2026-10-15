"use client";

import { useT } from "@/components/i18n/I18nProvider";
import { choice, str } from "./block-logic";
import { heightFor, overlayColor, type BlockContext } from "./shared";
import { SectionCountdown } from "./campaign-timer";

/** Countdown banner: a full-width campaign banner with a picture (or the campaign colour), words, a button and a big timer. */
export function CampaignCountdownHero({ ctx }: { ctx: BlockContext }) {
  const t = useT("campaigns");
  const { copy, settings, look, headingId } = ctx;
  const image = str(copy.mediaUrl);
  const video = /\.(mp4|webm|mov)(\?|$)/i.test(image);
  const tone = choice(settings.tone, ["dark", "accent", "light"] as const, "dark");
  const background = tone === "accent" ? look.tokens.accent : tone === "light" ? look.tokens.cardBg : look.tokens.heroBg;
  const color = image ? "#FFFFFF" : tone === "accent" ? look.onAccent : tone === "light" ? look.tokens.ink : look.tokens.heroText;
  const title = str(copy.title);
  const cta = str(copy.primaryCta);
  return (
    <section aria-labelledby={title ? headingId : undefined} aria-label={title ? undefined : t("section.heroAria")} className="relative overflow-hidden" style={{ background, color }}>
      {image ? (
        video ? (
          <video src={image} autoPlay muted loop playsInline aria-hidden className="absolute inset-0 h-full w-full object-cover motion-reduce:hidden" />
        ) : (
          <span aria-hidden className="absolute inset-0" style={{ backgroundImage: `url("${image.replace(/"/g, "%22")}")`, backgroundSize: "cover", backgroundPosition: "center" }} />
        )
      ) : null}
      {image ? <span aria-hidden className="absolute inset-0" style={{ background: overlayColor("strong") }} /> : null}
      <div className="relative mx-auto flex w-full max-w-[1200px] flex-col items-center justify-center px-5 py-12 text-center sm:px-8" style={{ minHeight: heightFor(str(settings.height) || "medium") }}>
        {str(copy.eyebrow) ? <p className="m-0 text-[12px] font-bold uppercase" style={{ letterSpacing: "0.22em", fontFamily: look.eyebrowFont, color: image ? "#FFFFFF" : tone === "dark" ? look.tokens.accent : color }}>{str(copy.eyebrow)}</p> : null}
        {title ? <h2 id={headingId} className="bq-h m-0 mt-3 max-w-[20ch]" style={{ ...look.headingStyle, color, fontSize: "clamp(32px, 6cqi, 72px)", lineHeight: 1.02 }}>{title}</h2> : null}
        {str(copy.body) ? <p className="m-0 mt-3 max-w-[560px] text-[16px] leading-7 opacity-90">{str(copy.body)}</p> : null}
        <SectionCountdown
          ctx={ctx}
          className="mt-7 block"
          look={{ style: "boxed", format: "dhms", size: "lg", color: image || tone !== "light" ? color : look.tokens.ink, boxBackground: tone === "light" && !image ? look.tokens.paperBg : "rgba(255,255,255,.12)", boxBorder: tone === "light" && !image ? look.tokens.border : undefined }}
        />
        {cta ? (
          <button
            type="button"
            className="bq-btn mt-7"
            style={tone === "dark" || image ? { background: look.tokens.accent, color: look.onAccent, border: `1.5px solid ${look.tokens.accent}`, minHeight: 48, padding: "0 28px", borderRadius: look.buttonRadius, fontWeight: 700 } : { ...look.primaryButton, minHeight: 48 }}
            onClick={() => ctx.go(str(settings.action) || "products")}
          >
            {cta}
          </button>
        ) : null}
      </div>
    </section>
  );
}
