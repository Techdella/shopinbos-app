"use client";

/* eslint-disable @next/next/no-img-element -- seller photos and Rex's library come from our storage at any size. */

import type { ReactNode } from "react";
import { Icon, type IconName } from "@/components/ui/Icon";
import { cx, Toggle } from "@/components/app-ui";
import { useT } from "@/components/i18n/I18nProvider";
import type { PaletteDef } from "@shared/seller-onboarding";

// Small pieces of the guided build's web screens (design RB-03…RB-16, the phone's rex-build/parts.tsx).

/** The black round tick on a picked card. */
export function CheckBadge({ className = "" }: { className?: string }) {
  return (
    <span aria-hidden className={cx("grid h-[30px] w-[30px] place-items-center rounded-full border-2 border-white bg-app-ink text-white", className)}>
      <Icon name="check" size={15} strokeWidth={2.8} />
    </span>
  );
}

/** "✨ Rex pick": the mint tag on Rex's recommendation. */
export function RexPick({ label, className = "" }: { label?: string; className?: string }) {
  const t = useT("rexBuild");
  return (
    <span className={cx("inline-flex items-center gap-1 self-start rounded-full bg-app-mint px-2.5 py-1 text-[13px] font-bold text-app-forest", className)}>
      <Icon name="sparkle" size={13} />
      {label ?? t("style.rexPick")}
    </span>
  );
}

/** A big clickable card that shows it's picked with a thick ink border and a tick. */
export function ChoiceCard({ on, onPress, children, label, className = "", testId, badge = true }: { on: boolean; onPress: () => void; children: ReactNode; label: string; className?: string; testId?: string; badge?: boolean }) {
  return (
    <button
      type="button"
      data-testid={testId}
      aria-label={label}
      aria-pressed={on}
      onClick={onPress}
      className={cx(
        "relative block w-full rounded-[22px] bg-white text-left transition hover:border-app-line-strong",
        on ? "border-[3px] border-app-ink p-3" : "border border-app-line p-[14px]",
        className,
      )}
    >
      {children}
      {on && badge ? <CheckBadge className="absolute right-2.5 top-2.5" /> : null}
    </button>
  );
}

/** A row with an icon tile, a title and hint, and a switch (extra sections, show prices, pay on delivery). */
export function SwitchRow({ icon, title, sub, on, onChange, tag, testId }: { icon?: IconName | "naira"; title: string; sub?: string; on: boolean; onChange: (on: boolean) => void; tag?: string; testId?: string }) {
  return (
    <div data-testid={testId} className="flex items-center gap-3 rounded-[22px] border border-app-line bg-white p-3.5">
      {icon ? (
        <span className="grid h-[46px] w-[46px] shrink-0 place-items-center rounded-[14px] bg-app-canvas">
          {icon === "naira" ? <span className="text-[18px] font-extrabold">₦</span> : <Icon name={icon} size={22} />}
        </span>
      ) : null}
      <span className="min-w-0 flex-1">
        <span className="block text-[16.5px] font-extrabold">{title}</span>
        {sub ? <span className="block text-[14px] leading-[1.35] text-app-ink-soft">{sub}</span> : null}
      </span>
      {tag ? <span className="shrink-0 rounded-full bg-app-mint px-2.5 py-1 text-[12.5px] font-bold text-app-forest">{tag}</span> : null}
      <Toggle on={on} onChange={onChange} label={title} />
    </div>
  );
}

/** A product photo square with its name under it; a green tick when it has a price, "Rex is writing…" while it's made. */
export function ProductTile({ image, name, ok, tag, note, onPress }: { image: string | null; name: string; ok: boolean; tag?: string | null; note?: string | null; onPress?: () => void }) {
  return (
    <button type="button" aria-label={name} onClick={onPress} disabled={!onPress} className="flex min-w-0 flex-col gap-1.5 text-left">
      <span className="relative block aspect-[1/0.84] w-full overflow-hidden rounded-[18px] bg-app-canvas">
        {image ? <img src={image} alt="" className="h-full w-full object-cover" /> : null}
        {ok ? (
          <span className="absolute right-2 top-2 grid h-[26px] w-[26px] place-items-center rounded-full bg-app-success text-white">
            <Icon name="check" size={14} strokeWidth={2.8} />
          </span>
        ) : null}
        {tag ? <span className="absolute inset-x-1.5 bottom-1.5 truncate rounded-full bg-[rgba(22,20,31,0.72)] px-2 py-[3px] text-[11px] font-bold text-white">{tag}</span> : null}
      </span>
      <span className="truncate text-[14px] font-semibold">{name}</span>
      {note ? <span className="-mt-1 truncate text-[12.5px] font-bold text-app-accent-ink">{note}</span> : null}
    </button>
  );
}

/**
 * The shop's banner as customers will see it, drawn small (the style cards, the colour preview, the banner photo and
 * words): the shop name bar, the photo with the headline, the button and the colour blocks.
 */
export function ShopBanner({ name, photo, headline, sub, cta, palette, height = 150, serif = false, dots = false, label }: {
  name: string;
  photo: string | null;
  headline: string;
  sub?: string;
  cta?: string;
  palette: PaletteDef;
  height?: number;
  serif?: boolean;
  dots?: boolean;
  label?: string;
}) {
  const tokens = palette.tokens;
  const paper = tokens.paperBg ?? "#FFFFFF";
  const ink = tokens.ink ?? "#16141F";
  const big = height > 160;
  return (
    <div role="img" aria-label={label ?? `${name}. ${headline}`} className="overflow-hidden rounded-[16px] border" style={{ background: paper, borderColor: tokens.border ?? "#ECEAF2" }}>
      <div className="truncate px-3 py-2 text-[13px] font-extrabold" style={{ color: ink }}>{name}</div>
      <div className="relative mx-2 overflow-hidden rounded-[12px]" style={{ height, background: tokens.heroBg ?? "#F6F5F9" }}>
        {photo ? <img src={photo} alt="" className="absolute inset-0 h-full w-full object-cover" /> : null}
        {photo ? <span aria-hidden className="absolute inset-x-0 bottom-0 h-[70%] bg-gradient-to-b from-transparent to-black/55" /> : null}
        <div className="absolute inset-x-3 bottom-2.5 flex flex-col gap-1">
          <div
            className={cx("line-clamp-2", serif ? "font-serif italic" : "font-extrabold")}
            style={{ color: photo ? "#FFFFFF" : tokens.heroText ?? ink, fontSize: big ? 26 : 17, lineHeight: big ? "30px" : "20px" }}
          >
            {headline}
          </div>
          {sub ? <div className="line-clamp-2 text-[12px]" style={{ color: photo ? "rgba(255,255,255,0.92)" : tokens.muted ?? ink }}>{sub}</div> : null}
          {cta ? (
            <span className="mt-1 self-start rounded-full px-3 py-1.5 text-[12px] font-bold" style={{ background: tokens.ctaBg ?? "#16141F", color: tokens.ctaText ?? "#FFFFFF" }}>
              {cta}
            </span>
          ) : null}
        </div>
      </div>
      {dots ? (
        <div className="flex items-center gap-1.5 p-2">
          <span className="h-[26px] flex-1 rounded-[8px]" style={{ background: tokens.cardBg ?? "#F6F5F9" }} />
          <span className="h-[26px] flex-1 rounded-[8px]" style={{ background: tokens.cardBg ?? "#F6F5F9" }} />
          <span className="h-[18px] w-[52px] rounded-[9px]" style={{ background: tokens.accent ?? "#FF6A2B" }} />
        </div>
      ) : (
        <div className="h-2" />
      )}
    </div>
  );
}

/** Four colour blocks of a palette (D2b). */
export function Swatches({ palette }: { palette: PaletteDef }) {
  return (
    <span aria-hidden className="flex h-11 w-[110px] shrink-0 overflow-hidden rounded-[12px]">
      {palette.swatch.map((colour, index) => (
        <span key={index} className="flex-1" style={{ background: colour }} />
      ))}
    </span>
  );
}

/** A round outline button with an icon (Upload photos, Take a photo, Find stock). */
export function SourceButton({ icon, label, onPress, testId }: { icon: IconName; label: string; onPress: () => void; testId?: string }) {
  return (
    <button type="button" data-testid={testId} onClick={onPress} className="inline-flex min-h-[48px] items-center gap-2 rounded-full border-[1.5px] border-app-line bg-white px-4 text-[15px] font-bold text-app-ink hover:border-app-line-strong">
      <Icon name={icon} size={18} />
      {label}
    </button>
  );
}

/** A chip (what you sell, library tabs, quick changes). */
export function Chip({ label, on, onPress, disabled, testId }: { label: string; on: boolean; onPress: () => void; disabled?: boolean; testId?: string }) {
  return (
    <button
      type="button"
      data-testid={testId}
      aria-pressed={on}
      disabled={disabled}
      onClick={onPress}
      className={cx(
        "inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-full border px-4 text-[15px] font-bold transition disabled:opacity-50",
        on ? "border-app-ink bg-app-ink text-white" : "border-app-line bg-white text-app-ink hover:border-app-line-strong",
      )}
    >
      {on ? <Icon name="check" size={14} className="shrink-0" /> : null}
      <span>{label}</span>
    </button>
  );
}

/** A plain modal (the product check, "What should I change?"). */
export function Dialog({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: ReactNode }) {
  const t = useT("rexBuild");
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-[rgba(22,20,31,0.45)] p-0 font-app text-app-ink sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label={title} onClick={onClose}>
      <div className="max-h-[90dvh] w-full max-w-[480px] overflow-y-auto rounded-t-[26px] bg-white p-5 sm:rounded-[26px]" onClick={(event) => event.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="m-0 text-[19px] font-extrabold">{title}</h2>
          <button type="button" aria-label={t("frame.close")} onClick={onClose} className="grid h-10 w-10 place-items-center rounded-full hover:bg-app-canvas">
            <Icon name="x" size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
