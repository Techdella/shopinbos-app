"use client";

import { cx } from "@/components/app-ui";
import type { BrandLook, BrandPalette } from "@shared/onboarding";

// The live store preview beside the sign-up questions on the web (the 2026 "Web onboarding, seller" design): a browser
// frame that fills in as the seller answers: the store's address, its name and logo, what it sells, the look's
// colours and the first products. Before a look is picked it stays plain, in the app's own greys.

export interface PreviewTile {
  key: string;
  imageUrl?: string | null;
  label?: string;
}

export interface StorePreviewProps {
  host: string;
  storeName: string;
  /** An uploaded or Rex-drawn logo. */
  logoUrl: string | null;
  /** Shown in a circle when the logo question is past without a picture ("AK"); null keeps the empty "logo" slot. */
  lettermark: string | null;
  categories: string[];
  /** The look and its colours, once the seller reaches "Pick a look" (null: plain). */
  look: BrandLook | null;
  palette: BrandPalette | null;
  heroText: string;
  tiles: PreviewTile[];
  live: boolean;
  labels: { heading: string; live: string; aria: string; logo: string; shopNow: string };
}

const PLAIN = {
  background: "#FFFFFF",
  ink: "var(--color-app-ink)",
  hero: "var(--color-app-canvas)",
  onHero: "var(--color-app-ink-soft)",
  accent: "var(--color-app-line)",
  onAccent: "var(--color-app-ink-soft)",
  tile: "var(--color-app-canvas)",
  logo: "var(--color-app-ink)",
};

export function StorePreview({ host, storeName, logoUrl, lettermark, categories, look, palette, heroText, tiles, live, labels }: StorePreviewProps) {
  const colours = look && palette
    ? {
        background: look.background,
        ink: look.ink,
        hero: palette.swatches[0],
        onHero: palette.swatches[2],
        accent: palette.swatches[1],
        onAccent: palette.swatches[2],
        tile: palette.swatches[2],
        logo: palette.swatches[0],
      }
    : PLAIN;
  const font = look ? look.fontCss : undefined;
  const shown = [...tiles.slice(0, 3), ...Array.from({ length: Math.max(0, 3 - tiles.length) }, (_, index) => ({ key: `empty-${index}` }) as PreviewTile)];

  return (
    <section aria-label={labels.aria} className="flex w-full flex-col items-center gap-3.5">
      <p className="m-0 flex items-center gap-2 text-[12px] font-extrabold uppercase tracking-[0.06em] text-app-ink-soft">
        {live && <span aria-hidden className="h-2 w-2 rounded-full bg-app-success shadow-[0_0_0_4px_var(--color-app-success-tint)]" />}
        {live ? labels.live : labels.heading}
      </p>
      <div className="w-full max-w-[520px] overflow-hidden rounded-[20px] bg-white shadow-[0_30px_60px_-36px_rgba(22,20,31,0.35)]">
        <div className="flex items-center gap-2 border-b border-app-line px-3.5 py-2.5 text-[13px] text-app-gray-ink">
          <span aria-hidden className="flex gap-[5px]">
            <i className="h-[9px] w-[9px] rounded-full bg-app-line" />
            <i className="h-[9px] w-[9px] rounded-full bg-app-line" />
            <i className="h-[9px] w-[9px] rounded-full bg-app-line" />
          </span>
          <span className="min-w-0 flex-1 truncate rounded-full bg-app-canvas px-3 py-1.5 font-bold text-app-gray-ink">{host}</span>
        </div>
        <div className="flex flex-col gap-3 p-4 transition-colors duration-300" style={{ background: colours.background, color: colours.ink }}>
          <div className="flex min-w-0 items-center gap-2.5">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt="" className="h-10 w-10 shrink-0 rounded-full bg-white object-contain" />
            ) : lettermark ? (
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full font-app-display text-[15px] font-extrabold tracking-[-0.04em] text-white" style={{ background: colours.logo }}>{lettermark}</span>
            ) : (
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full border-2 border-dashed border-app-locked text-[12px] font-bold text-[#8A8697]">{labels.logo}</span>
            )}
            <span className={cx("truncate text-[18px] font-extrabold", !font && "font-app-display")} style={{ fontFamily: font }}>{storeName}</span>
          </div>
          <div className="flex min-h-[150px] flex-col justify-end gap-2 rounded-[16px] p-5 transition-colors duration-300" style={{ background: colours.hero, color: colours.onHero }}>
            <span className={cx("text-[26px] font-extrabold leading-[1.05] tracking-[-0.02em]", !font && "font-app-display")} style={{ fontFamily: font }}>{heroText}</span>
            <span className="inline-flex h-8 w-fit items-center rounded-full px-3.5 text-[12px] font-extrabold" style={{ background: colours.accent, color: colours.onAccent }}>{labels.shopNow}</span>
          </div>
          {categories.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {categories.slice(0, 6).map((category) => (
                <span key={category} className="rounded-full bg-app-canvas px-2.5 py-1 text-[11px] font-extrabold text-app-ink">{category}</span>
              ))}
            </div>
          )}
          <div className="grid grid-cols-3 gap-2">
            {shown.map((tile) => (
              <span key={tile.key} className={cx("relative block h-[90px] overflow-hidden rounded-[12px]", !look && "bg-app-canvas")} style={look ? { background: colours.tile, boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.06)" } : undefined}>
                {tile.imageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={tile.imageUrl} alt="" className="h-full w-full object-cover" />
                )}
                {tile.label && <span className="absolute inset-x-0 bottom-0 truncate bg-white/90 px-2 py-1 text-[10px] font-bold text-app-ink">{tile.label}</span>}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
