"use client";

import type { CSSProperties } from "react";
import { POPUP_ART_PHOTOS, popupArtPhotoUrl, type PopupArt as ArtId } from "@/lib/marketing/forms";

// Built-in pictures for pop-ups that don't have the seller's own picture yet: real photos of people and products
// that fit the template (src/lib/marketing/forms.ts POPUP_ART_PHOTOS). They fill their box like a cover photo.

export interface ArtColors {
  bg: string;
  ink: string;
  button: string;
  accent: string;
}

function rgb(color: string) {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(color.trim());
  return m ? [parseInt(m[1]!, 16), parseInt(m[2]!, 16), parseInt(m[3]!, 16)] : null;
}

/** Mixes two #RRGGBB colours (t = 0 → a, 1 → b); anything else returns `a`. */
export function mix(a: string, b: string, t: number) {
  const x = rgb(a);
  const y = rgb(b);
  if (!x || !y) return a;
  const c = x.map((v, i) => Math.round(v + (y[i]! - v) * t));
  return `#${c.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

export function PopupArt({ art, colors, className, style, label }: { art: ArtId; colors: ArtColors; className?: string; style?: CSSProperties; label?: string }) {
  const src = popupArtPhotoUrl(art);
  if (!art || !src) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- a fixed-size crop from images.unsplash.com
    <img
      src={src}
      srcSet={`${popupArtPhotoUrl(art, 480)} 480w, ${src} 900w`}
      sizes="(max-width: 640px) 100vw, 480px"
      alt={label ?? POPUP_ART_PHOTOS[art].alt}
      loading="lazy"
      decoding="async"
      className={`${className ?? ""} object-cover`}
      // A soft tint of the pop-up's colour shows while the photo loads.
      style={{ background: mix(colors.bg, colors.button, 0.12), ...style }}
    />
  );
}
