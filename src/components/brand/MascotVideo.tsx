"use client";

// <MascotVideo clip="peggy-hello|rex-hello|rex-thumbs" size={…} />: a short studio clip of Rex or Peggy in a soft
// round "spotlight". The clips have a light grey studio background that cannot be keyed out cleanly, so a radial
// CSS mask fades the edge of the frame into whatever page is behind it.
//
// - The poster (first frame) shows first, and is all that shows under prefers-reduced-motion.
// - The <video> is only created once the spotlight is near the viewport (lazy), plays muted, looped and inline,
//   and pauses when it scrolls away or the tab is hidden.
// - Decorative clips (next to text that already greets the person) are hidden from screen readers.

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { cx } from "@/components/app-ui/cx";
import { MASCOT_CLIP_INFO, mascotClipLabel, type MascotClip } from "@shared/mascots";
import { usePrefersReducedMotion } from "./Mascot";

export type { MascotClip } from "@shared/mascots";

const BASE = "/brand/mascots/video/";

/** The edge fade: solid to 64% of the radius, gone by 100%, so the grey studio background dissolves into the page. */
const SPOTLIGHT_MASK = "radial-gradient(circle closest-side at 50% 50%, #000 64%, rgba(0,0,0,0.55) 80%, transparent 100%)";

export function mascotClipPoster(clip: MascotClip) {
  return `${BASE}${clip}-poster.jpg`;
}

export interface MascotVideoProps {
  clip: MascotClip;
  /** Square size in px. Leave out to size with className instead (e.g. "w-[220px] max-w-full aspect-square"). */
  size?: number;
  /** Hidden from screen readers (the text next to it already says hello). */
  decorative?: boolean;
  /** Overrides the default "Rex" / "Peggy". */
  alt?: string;
  className?: string;
  style?: CSSProperties;
}

export function MascotVideo({ clip, size, decorative = false, alt, className, style }: MascotVideoProps) {
  const reducedMotion = usePrefersReducedMotion();
  const boxRef = useRef<HTMLSpanElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [near, setNear] = useState(false);
  const [visible, setVisible] = useState(false);
  const [playing, setPlaying] = useState(false);

  // Lazy-load when near the viewport; play only while on screen.
  useEffect(() => {
    const box = boxRef.current;
    if (!box || reducedMotion) return;
    if (typeof IntersectionObserver === "undefined") {
      setNear(true);
      setVisible(true);
      return;
    }
    const nearObserver = new IntersectionObserver(([entry]) => entry?.isIntersecting && setNear(true), { rootMargin: "200px" });
    const visibleObserver = new IntersectionObserver(([entry]) => setVisible(Boolean(entry?.isIntersecting)), { threshold: 0.15 });
    nearObserver.observe(box);
    visibleObserver.observe(box);
    return () => {
      nearObserver.disconnect();
      visibleObserver.disconnect();
    };
  }, [reducedMotion]);

  // Play while visible and the tab is showing; pause otherwise.
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !near || reducedMotion) return;
    const sync = () => {
      if (visible && document.visibilityState === "visible") {
        video.muted = true;
        void video.play().catch(() => setPlaying(false));
      } else {
        video.pause();
      }
    };
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  }, [near, visible, reducedMotion]);

  const label = decorative ? "" : alt ?? mascotClipLabel(clip);
  const poster = mascotClipPoster(clip);
  const mask: CSSProperties = { maskImage: SPOTLIGHT_MASK, WebkitMaskImage: SPOTLIGHT_MASK };
  const boxStyle: CSSProperties = { ...(size ? { width: size, height: size } : {}), ...style };

  return (
    <span
      ref={boxRef}
      className={cx("relative block shrink-0 overflow-hidden rounded-full", !size && "aspect-square", className)}
      style={boxStyle}
      data-mascot-clip={clip}
      role={label ? "img" : undefined}
      aria-label={label || undefined}
      aria-hidden={label ? undefined : true}
    >
      <span className="absolute inset-0 block" style={{ ...mask, backgroundColor: MASCOT_CLIP_INFO[clip].backdrop }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={poster}
          alt=""
          draggable={false}
          decoding="async"
          loading="lazy"
          className={cx("pointer-events-none absolute inset-0 h-full w-full select-none object-cover transition-opacity duration-300", playing && "opacity-0")}
        />
        {near && !reducedMotion ? (
          <video
            ref={videoRef}
            muted
            loop
            playsInline
            preload="metadata"
            poster={poster}
            aria-hidden
            tabIndex={-1}
            disablePictureInPicture
            onPlaying={() => setPlaying(true)}
            onError={() => setPlaying(false)}
            className="pointer-events-none absolute inset-0 h-full w-full object-cover"
          >
            <source src={`${BASE}${clip}.webm`} type="video/webm" />
            <source src={`${BASE}${clip}.mp4`} type="video/mp4" />
          </video>
        ) : null}
      </span>
    </span>
  );
}

export default MascotVideo;
