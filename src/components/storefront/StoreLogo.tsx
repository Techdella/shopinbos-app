"use client";

import { useMemo } from "react";
import type React from "react";
import { chooseLogo, isDarkBackground, logoTreatmentStyle, readStoreLogo } from "@shared/logo-variants";

/**
 * The store's logo for the bar it sits on: the version for dark backgrounds on a dark header or footer, a
 * re-inked one-colour mark, or the logo on a small light tile (shared/logo-variants.ts). With no logo it renders
 * `fallback` (the store name, say), or nothing.
 */
export function StoreLogo({
  store,
  background,
  dark,
  under,
  className,
  style,
  alt = "",
  fallback = null,
}: {
  store: { logoUrl?: string | null; brandSettings?: unknown };
  /** The resolved colour behind the logo (hex or rgb[a]). */
  background?: string | null;
  /** Used when `background` can't be read (a gradient, a CSS variable). */
  dark?: boolean;
  /** The page colour behind a see-through bar. */
  under?: string | null;
  className?: string;
  style?: React.CSSProperties;
  alt?: string;
  fallback?: React.ReactNode;
}) {
  const choice = useMemo(() => {
    const onDark = isDarkBackground(background, { fallback: dark ?? false, under: under ?? undefined });
    return chooseLogo(readStoreLogo(store), onDark);
  }, [store, background, dark, under]);
  if (!choice) return <>{fallback}</>;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={choice.src}
      alt={alt}
      data-logo-treatment={choice.treatment}
      className={className}
      style={{ objectFit: "contain", ...logoTreatmentStyle(choice.treatment), ...style }}
      onError={(event) => { event.currentTarget.style.display = "none"; }}
    />
  );
}
