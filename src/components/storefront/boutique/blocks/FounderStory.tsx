"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { mediaKind, youTubeEmbedUrl, youTubeId } from "@/lib/store-templates/section-content";
import { choice, str } from "./block-logic";
import { Paragraphs, SampleLabel, type BlockContext, words } from "./shared";

/** The founder's video: nothing loads until the shopper presses play (YouTube or an uploaded file). */
function LetterVideo({ url, poster, label, radius }: { url: string; poster: string; label: string; radius: number }) {
  const [playing, setPlaying] = useState(false);
  const kind = mediaKind(url);
  if (kind === "video") {
    return <video src={url} poster={poster || undefined} controls preload="metadata" playsInline className="block aspect-video w-full bg-black object-cover" style={{ borderRadius: radius }} aria-label={label} />;
  }
  const embed = kind === "youtube" ? youTubeEmbedUrl(url) : null;
  if (!embed) return null;
  const thumb = poster || `https://i.ytimg.com/vi/${youTubeId(url)}/hqdefault.jpg`;
  return (
    <div className="relative aspect-video w-full overflow-hidden bg-black" style={{ borderRadius: radius }}>
      {playing ? (
        <iframe src={`${embed}&autoplay=1`} title={label} allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen className="absolute inset-0 h-full w-full border-0" />
      ) : (
        <button type="button" onClick={() => setPlaying(true)} className="group absolute inset-0 border-0 p-0" style={{ cursor: "pointer", background: "transparent" }} aria-label={`Play: ${label}`}>
          <img src={thumb} alt="" className="absolute inset-0 h-full w-full object-cover opacity-90" loading="lazy" />
          <span className="absolute left-1/2 top-1/2 grid h-16 w-16 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-white text-black shadow-lg"><Icon name="play" size={24} /></span>
        </button>
      )}
    </div>
  );
}

/** Founder's letter: portrait, a personal note in paragraphs, a signature (handwriting style or a picture) and video. */
export function FounderStory({ ctx }: { ctx: BlockContext }) {
  const { copy, settings, look, store, products, headingId } = ctx;
  const t = look.tokens;
  const portrait = str(copy.portraitUrl) || str(store.logoUrl) || products.find((product) => product.images[0])?.images[0] || "";
  const letter = str(copy.body) || str(store.description);
  const sampleLetter = !letter && ctx.editor;
  if (!letter && !ctx.editor) return null;
  const side = choice(settings.imageSide, ["left", "right"] as const, "left");
  const signature = str(copy.signatureUrl);
  const name = str(copy.signatureName);
  const role = str(copy.role);
  const video = str(copy.videoUrl);
  return (
    <section aria-labelledby={headingId} className="py-14" style={{ background: look.storyBg }}>
      <style>{`.bqb-founder{display:grid;gap:28px}@container bq (min-width:760px){.bqb-founder{grid-template-columns:minmax(0,0.85fr) minmax(0,1.15fr);gap:56px;align-items:start}.bqb-founder[data-side="right"] .bqb-founder-pic{order:2}}`}</style>
      <div className="bq-wrap bqb-founder" data-side={side}>
        <div className="bqb-founder-pic">
          <div className="bq-media" style={{ aspectRatio: "4 / 5", borderRadius: look.cardRadius }}>
            {portrait ? <img src={portrait} alt={name ? `${name}, ${role || "founder"}` : ""} width={700} height={875} loading="lazy" decoding="async" /> : null}
          </div>
        </div>
        <div className="flex flex-col gap-4">
          {sampleLetter ? <SampleLabel look={look}>{ctx.say("Write your letter in the panel on the right.")}</SampleLabel> : null}
          {str(copy.eyebrow) ? <p className="m-0 text-[12px] font-semibold uppercase" style={{ color: t.muted, letterSpacing: "0.2em", fontFamily: look.eyebrowFont }}>{words(ctx, "eyebrow")}</p> : null}
          <h2 id={headingId} className="bq-h text-[30px] @3xl:text-[40px]" style={{ ...look.headingStyle, lineHeight: 1.08 }}>{words(ctx, "title", `Why we started ${store.name}`)}</h2>
          <div className="grid gap-3 text-[16px] leading-7" style={{ color: t.ink }}>
            {sampleLetter
              ? <p className="m-0" style={{ color: t.muted }}>Tell shoppers who you are, why you started and what you care about. A few honest paragraphs build more trust than any badge.</p>
              : <Paragraphs text={letter} className="m-0" />}
          </div>
          {signature || name ? (
            <div className="mt-2">
              {signature
                ? <img src={signature} alt={name ? `Signed, ${name}` : "Signature"} width={220} height={80} className="h-16 w-auto max-w-[220px] object-contain" style={look.dark ? { filter: "invert(1)" } : undefined} loading="lazy" />
                : <p className="m-0 text-[30px] leading-none" style={{ fontFamily: '"Brush Script MT", "Segoe Script", "Snell Roundhand", cursive', color: t.ink }}>{name}</p>}
              {name || role ? <p className="m-0 mt-2 text-[13.5px]" style={{ color: t.muted }}>{[name, role].filter(Boolean).join(", ")}</p> : null}
            </div>
          ) : null}
          {video ? <div className="mt-3"><LetterVideo url={video} poster={str(copy.portraitUrl)} label={str(copy.title) || "A video from our founder"} radius={look.cardRadius} /></div> : null}
        </div>
      </div>
    </section>
  );
}
