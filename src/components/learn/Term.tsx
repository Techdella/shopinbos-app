"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { findTerm, glossaryTerm, type GlossaryEntry } from "@shared/glossary";
import { introByKey } from "@shared/feature-intros";
import { translateTerm } from "@shared/i18n/learn";
import { useT } from "@/components/i18n/I18nProvider";
import { useTipsOn } from "@/components/shell/useShellCounts";

// <Term k="segments">Segments</Term>: the standard word with a dotted underline and a tiny info dot. Hover or
// keyboard focus shows a tooltip; a tap (or click) opens it as a small dialog with a close button. Escape closes
// either. It says what the word means in one plain line, gives an everyday example and, when there's one, offers
// the 60-second intro (FeatureIntroHost listens for OPEN_INTRO_EVENT).

export const OPEN_INTRO_EVENT = "shopinbos:open-intro";

/** Opens a feature intro by key, or the one for the current page when no key is given. */
export function openFeatureIntro(key?: string) {
  window.dispatchEvent(new CustomEvent<{ key?: string }>(OPEN_INTRO_EVENT, { detail: { key } }));
}

/** Where tips and tooltips are switched off (Customise your menu) for the portal a page belongs to; none for admin. */
export function tipsSettingsHref(pathname: string | null): string | null {
  if (!pathname || pathname.startsWith("/admin")) return null;
  if (pathname.startsWith("/supplier")) return "/supplier/features#tips";
  if (pathname.startsWith("/logistics")) return "/logistics/features#tips";
  return "/home/features#tips";
}

/** "Don't need tips? Turn them off in Settings." under every tip, so people know they can. */
export function TipsOffNote({ onNavigate, className = "" }: { onNavigate?: () => void; className?: string }) {
  const t = useT("learn");
  const href = tipsSettingsHref(usePathname());
  if (!href) return null;
  return (
    <p className={`m-0 text-[12px] leading-[1.4] text-[rgba(244,241,234,0.62)] ${className}`}>
      {t("tipsOffLead")}{" "}
      <Link href={href} onClick={onNavigate} className="font-extrabold text-[#73D8C8] underline underline-offset-2">{t("tipsOffLink")}</Link>
    </p>
  );
}

const NAVY = "#0E2A38";
const MINT = "#73D8C8";

/** The tooltip body, shared with the sidebar's hover tips. */
export function TermCard({ entry: source, onWatch, compact = false, hideWatch = false }: { entry: GlossaryEntry; onWatch?: () => void; compact?: boolean; hideWatch?: boolean }) {
  // The meaning and example in the person's language (the word itself stays the standard one).
  const t = useT("learn");
  const entry = translateTerm(source, useT("glossary"));
  const intro = introByKey(entry.introKey);
  return (
    <div className="font-app text-[#F4F1EA]">
      <div className="flex items-center gap-2">
        <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ background: MINT }} />
        <span className="text-[14px] font-extrabold">{entry.term}</span>
      </div>
      <p className="m-0 mt-1 text-[13.5px] leading-[1.45]">{entry.short}</p>
      {!compact && <p className="m-0 mt-1.5 text-[12.5px] leading-[1.45] text-[rgba(244,241,234,0.7)]">{t("eg", { example: entry.example })}</p>}
      {intro && !hideWatch && (
        <button
          type="button"
          onClick={() => {
            onWatch?.();
            openFeatureIntro(intro.key);
          }}
          className="mt-2 inline-flex min-h-[32px] items-center gap-1.5 rounded-full px-3 text-[12.5px] font-bold"
          style={{ background: MINT, color: NAVY }}
        >
          <svg aria-hidden width="10" height="10" viewBox="0 0 10 10"><path d="M2 1 L9 5 L2 9 Z" fill="currentColor" /></svg>
          {t("watchIntro")}
        </button>
      )}
      <TipsOffNote onNavigate={onWatch} className="mt-2.5 border-t border-[rgba(244,241,234,0.12)] pt-2" />
    </div>
  );
}

const CARD_CLASS = "fixed z-[95] rounded-[16px] p-3.5 shadow-[0_18px_44px_-14px_rgba(6,18,26,0.55)] animate-slide-up";

/** Where a popover of `width` goes next to `rect`: under it if there's room, else above; always 16px from the edges. */
function place(rect: DOMRect, width: number, height: number) {
  const gutter = 16;
  const left = Math.min(Math.max(gutter, rect.left + rect.width / 2 - width / 2), window.innerWidth - width - gutter);
  const below = rect.bottom + 8 + height < window.innerHeight - gutter;
  const top = below ? rect.bottom + 8 : Math.max(gutter, rect.top - 8 - height);
  return { left, top };
}

export function Term({ k, children, className = "" }: { k: string; children?: ReactNode; className?: string }) {
  const entry = glossaryTerm(k);
  const t = useT("learn", "common");
  const id = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<"tip" | "dialog" | null>(null);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const fromTouch = useRef(false);
  const tipsOn = useTipsOn();

  const close = useCallback((returnFocus = false) => {
    window.clearTimeout(timer.current);
    setMode(null);
    setPosition(null);
    if (returnFocus) triggerRef.current?.focus();
  }, []);

  useLayoutEffect(() => {
    if (!mode || !triggerRef.current) return;
    const measure = () => {
      const width = Math.min(300, window.innerWidth - 32);
      const height = cardRef.current?.offsetHeight ?? 140;
      setPosition(place(triggerRef.current!.getBoundingClientRect(), width, height));
    };
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [mode]);

  useEffect(() => {
    if (!mode) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        close(true);
      }
    };
    const onDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!cardRef.current?.contains(target) && !triggerRef.current?.contains(target)) close();
    };
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("pointerdown", onDown, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("pointerdown", onDown, true);
    };
  }, [mode, close]);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  // Tips switched off: just the word.
  if (!entry || !tipsOn) return <>{children ?? entry?.term}</>;

  const showTip = (delay: number) => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setMode((current) => current ?? "tip"), delay);
  };
  const hideTip = () => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setMode((current) => (current === "tip" ? null : current)), 160);
  };

  const card =
    mode && typeof document !== "undefined"
      ? createPortal(
          <div
            ref={cardRef}
            id={id}
            role={mode === "tip" ? "tooltip" : "dialog"}
            aria-label={mode === "dialog" ? t("whatItMeans", { term: entry.term }) : undefined}
            onMouseEnter={() => window.clearTimeout(timer.current)}
            onMouseLeave={mode === "tip" ? hideTip : undefined}
            className={CARD_CLASS}
            style={{ background: NAVY, width: Math.min(300, typeof window === "undefined" ? 300 : window.innerWidth - 32), left: position?.left ?? -9999, top: position?.top ?? -9999 }}
          >
            {mode === "dialog" && (
              <button type="button" onClick={() => close(true)} aria-label={t("close")} className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full text-[rgba(244,241,234,0.7)] hover:text-[#F4F1EA]">
                <svg aria-hidden width="12" height="12" viewBox="0 0 12 12"><path d="M2 2 L10 10 M10 2 L2 10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
              </button>
            )}
            <TermCard entry={entry} onWatch={() => close()} />
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        data-term={entry.key}
        aria-describedby={mode === "tip" ? id : undefined}
        aria-expanded={mode === "dialog"}
        aria-haspopup="dialog"
        onPointerDown={(event) => {
          fromTouch.current = event.pointerType !== "mouse";
        }}
        onMouseEnter={() => showTip(350)}
        onMouseLeave={hideTip}
        onFocus={() => {
          if (!fromTouch.current) showTip(0);
        }}
        onBlur={(event) => {
          if (!cardRef.current?.contains(event.relatedTarget as Node)) hideTip();
        }}
        onClick={() => {
          window.clearTimeout(timer.current);
          setMode((current) => (current === "dialog" ? null : "dialog"));
          fromTouch.current = false;
        }}
        className={`inline cursor-help border-0 bg-transparent p-0 text-left font-[inherit] text-inherit underline decoration-dotted decoration-[1.5px] underline-offset-[5px] [text-decoration-color:color-mix(in_srgb,currentColor_45%,transparent)] hover:[text-decoration-color:currentColor] ${className}`}
        style={{ letterSpacing: "inherit", lineHeight: "inherit" }}
      >
        {children ?? entry.term}
        <span aria-hidden className="relative -top-[0.55em] ml-[2px] inline-block h-[6px] w-[6px] rounded-full align-baseline" style={{ background: MINT, boxShadow: "0 0 0 2px rgba(115,216,200,0.25)" }} />
        <span className="sr-only">{t("whatItMeansSr")}</span>
      </button>
      {card}
    </>
  );
}

/** A page title: the matching glossary word gets a Term tooltip; any other title is plain text. */
export function TitleTerm({ title }: { title: string }) {
  const entry = findTerm(title, { exact: true });
  return entry ? <Term k={entry.key}>{title}</Term> : <>{title}</>;
}
