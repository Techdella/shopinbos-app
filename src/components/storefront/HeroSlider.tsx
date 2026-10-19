"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Icon } from "@/components/ui/Icon";
import { youTubeEmbedUrl, type HeroSlide, type SlideTiming } from "@/lib/store-templates/section-content";

// The banner slider both storefront renderers use. Slides sit on a CSS scroll-snap track, so phones swipe natively;
// arrows and dots move it on larger screens and for keyboard users. It changes by itself only when the seller
// turned that on, pauses while a shopper points at, focuses or touches it, has a pause button, and never moves on
// its own for shoppers who ask their device for less motion.

export interface HeroSliderProps {
  slides: HeroSlide[];
  timing: SlideTiming;
  /** Accessible name of the carousel, e.g. the store name. */
  label: string;
  /** The words and button drawn over one slide. */
  renderOverlay: (slide: HeroSlide, index: number) => ReactNode;
  /** Shown behind a slide with no picture yet. */
  emptyBackground: string;
  /** Colour of arrows, dots and the pause button. */
  controlColor?: string;
  className?: string;
  style?: CSSProperties;
  /** Height of each slide (CSS), e.g. "min(78vh, 720px)". Ignored when slideClassName sets the size. */
  height?: string;
  /** Extra class for each slide, e.g. the theme's banner proportions. */
  slideClassName?: string;
}

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return reduced;
}

export function SlideMedia({ slide, eager }: { slide: HeroSlide; eager: boolean }) {
  const fill = "absolute inset-0 h-full w-full object-cover";
  if (slide.mediaType === "youtube") {
    const src = youTubeEmbedUrl(slide.mediaUrl, { background: true });
    return src ? (
      <span className="absolute inset-0 overflow-hidden" aria-hidden>
        {/* Scaled up so the 16:9 video covers the slide without black bars. */}
        <iframe src={src} title="" tabIndex={-1} allow="autoplay; encrypted-media; picture-in-picture" className="pointer-events-none absolute left-1/2 top-1/2 h-[max(100%,56.25vw)] w-[max(100%,177.78vh)] min-h-full min-w-full -translate-x-1/2 -translate-y-1/2 border-0" />
      </span>
    ) : null;
  }
  if (slide.mediaType === "video") return <video src={slide.mediaUrl} className={fill} autoPlay muted loop playsInline preload={eager ? "auto" : "metadata"} aria-hidden />;
  if (slide.mediaType === "image") {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={slide.mediaUrl} alt={slide.alt} className={fill} width={1600} height={900} loading={eager ? "eager" : "lazy"} decoding="async" {...(eager ? { fetchPriority: "high" as const } : {})} />;
  }
  return null;
}

export function HeroSlider({ slides, timing, label, renderOverlay, emptyBackground, controlColor = "#fff", className, style, height = "min(78vh, 680px)", slideClassName }: HeroSliderProps) {
  const track = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const [hovered, setHovered] = useState(false);
  const [userPaused, setUserPaused] = useState(false);
  const reduced = usePrefersReducedMotion();
  const count = slides.length;
  const many = count > 1;
  const playing = many && timing.autoplay && !reduced && !userPaused && !hovered;

  const goTo = useCallback((index: number) => {
    const node = track.current;
    if (!node || !count) return;
    const next = ((index % count) + count) % count;
    node.scrollTo({ left: next * node.clientWidth, behavior: reduced ? "auto" : "smooth" });
    setActive(next);
  }, [count, reduced]);

  // Follow swipes and scrolls.
  useEffect(() => {
    const node = track.current;
    if (!node) return;
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (node.clientWidth) setActive(Math.min(count - 1, Math.max(0, Math.round(node.scrollLeft / node.clientWidth))));
      });
    };
    node.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      node.removeEventListener("scroll", onScroll);
    };
  }, [count]);

  // Keep the current slide in place when the banner is resized (editor device switch, phone rotation).
  useEffect(() => {
    const node = track.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => node.scrollTo({ left: active * node.clientWidth, behavior: "auto" }));
    observer.observe(node);
    return () => observer.disconnect();
  }, [active]);

  useEffect(() => {
    if (active >= count && count) goTo(0);
  }, [active, count, goTo]);

  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") goTo(active + 1);
    }, timing.seconds * 1000);
    return () => window.clearInterval(timer);
  }, [playing, active, goTo, timing.seconds]);

  if (!count) return null;

  const control = "grid h-10 w-10 place-items-center rounded-full border-0 backdrop-blur";
  const controlStyle: CSSProperties = { background: "rgba(0,0,0,.32)", color: controlColor, cursor: "pointer" };

  return (
    <section
      aria-roledescription="carousel"
      aria-label={label}
      className={className}
      style={{ position: "relative", ...style }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocusCapture={() => setHovered(true)}
      onBlurCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setHovered(false); }}
      onTouchStart={() => setHovered(true)}
      onTouchEnd={() => setHovered(false)}
    >
      <div
        ref={track}
        aria-live={playing ? "off" : "polite"}
        className="flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        style={{ scrollBehavior: reduced ? "auto" : "smooth" }}
      >
        {slides.map((slide, index) => (
          <div
            key={index}
            role="group"
            aria-roledescription="slide"
            aria-label={`${index + 1} of ${count}`}
            aria-hidden={index !== active ? true : undefined}
            className={`relative w-full shrink-0 snap-start overflow-hidden ${slideClassName ?? ""}`}
            style={{ ...(slideClassName ? { margin: 0, borderRadius: 0, aspectRatio: undefined } : { height }), background: slide.mediaType === "none" ? emptyBackground : "#111" }}
            // Off-screen slides keep their links out of the tab order.
            {...(index !== active ? { inert: true } : {})}
          >
            <SlideMedia slide={slide} eager={index === 0} />
            {renderOverlay(slide, index)}
          </div>
        ))}
      </div>
      {many ? (
        <>
          <button type="button" aria-label="Previous slide" onClick={() => goTo(active - 1)} className={`${control} absolute left-3 top-1/2 -translate-y-1/2`} style={controlStyle}>
            <Icon name="arrowLeft" size={18} />
          </button>
          <button type="button" aria-label="Next slide" onClick={() => goTo(active + 1)} className={`${control} absolute right-3 top-1/2 -translate-y-1/2`} style={controlStyle}>
            <Icon name="arrow" size={18} />
          </button>
          <div className="absolute inset-x-0 bottom-3 flex items-center justify-center gap-1">
            {timing.autoplay && !reduced ? (
              <button type="button" aria-label={userPaused ? "Play slides" : "Pause slides"} onClick={() => setUserPaused((value) => !value)} className="mr-1 grid h-8 w-8 place-items-center rounded-full border-0" style={controlStyle}>
                <Icon name={userPaused ? "play" : "pause"} size={13} />
              </button>
            ) : null}
            {slides.map((_, index) => (
              <button
                key={index}
                type="button"
                onClick={() => goTo(index)}
                aria-label={`Show slide ${index + 1} of ${count}`}
                aria-current={index === active ? "true" : undefined}
                className="grid h-8 min-w-6 place-items-center border-0 bg-transparent p-0"
                style={{ cursor: "pointer" }}
              >
                <span className="block h-[4px] rounded-full transition-all" style={{ width: index === active ? 24 : 10, background: controlColor, opacity: index === active ? 1 : 0.55, boxShadow: "0 0 0 1px rgba(0,0,0,.15)" }} />
              </button>
            ))}
          </div>
        </>
      ) : null}
    </section>
  );
}

/** Where a slide's words sit, as flexbox alignment. */
export function slideAlign(position: HeroSlide["textPosition"]) {
  if (position === "center") return { items: "center", text: "center" as const };
  if (position === "right") return { items: "flex-end", text: "right" as const };
  return { items: "flex-start", text: "left" as const };
}
