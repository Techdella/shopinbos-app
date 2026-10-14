"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/ui/Icon";
import { LANGUAGES, languageOf, type Locale } from "@shared/i18n";
import { useLocale, useLocaleChanging, useSetLocale, useT } from "./I18nProvider";

// Choose the app language. Each choice shows the name its speakers use (Yorùbá) with the English name under it,
// and a tick on the current one. Variants:
//  - "list":    the full list, for Settings and onboarding;
//  - "compact": one row ("🌐 Language · Yorùbá") that opens the list in place, for menus;
//  - "globe":   a small round globe button with a popover, for the corners of sign-up and log-in.

type Variant = "list" | "compact" | "globe";

function LanguageOptions({ onChosen, dense = false }: { onChosen?: () => void; dense?: boolean }) {
  const locale = useLocale();
  const setLocale = useSetLocale();
  const t = useT("settings");
  const name = useId();
  const choose = (code: Locale) => {
    onChosen?.();
    if (code !== locale) void setLocale(code);
  };
  return (
    <div role="radiogroup" aria-label={t("language.choose")} className={dense ? "grid gap-0.5" : "grid gap-2 sm:grid-cols-2"}>
      {LANGUAGES.map((language) => {
        const on = language.code === locale;
        const showEnglish = language.name !== language.nativeName;
        return (
          <label
            key={language.code}
            lang={language.code}
            className={
              dense
                ? `flex min-h-[44px] cursor-pointer items-center gap-3 rounded-[12px] px-3 py-1.5 text-app-ink ${on ? "bg-[#F1EFF6]" : "hover:bg-app-canvas"}`
                : `flex min-h-[60px] cursor-pointer items-center gap-3 rounded-[16px] border px-4 py-2.5 text-app-ink transition ${on ? "border-app-ink bg-white shadow-[0_0_0_1px_var(--color-app-ink,#16141F)]" : "border-app-line bg-white hover:border-app-line-strong"}`
            }
          >
            <input type="radio" name={name} value={language.code} checked={on} onChange={() => choose(language.code)} className="sr-only" />
            <span className="min-w-0 flex-1">
              <span className={`block truncate ${dense ? "text-[14px]" : "text-[15.5px]"} font-extrabold`}>{language.nativeName}</span>
              {showEnglish && <span lang="en" className="block truncate text-[12.5px] text-app-ink-soft">{language.name}</span>}
            </span>
            <span
              aria-hidden
              className={`grid h-6 w-6 shrink-0 place-items-center rounded-full ${on ? "bg-app-ink text-white" : dense ? "" : "border border-app-line"}`}
            >
              {on && <Icon name="check" size={13} strokeWidth={2.6} />}
            </span>
          </label>
        );
      })}
    </div>
  );
}

function usePopover() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  // The globe's list is portalled to <body>, so clicks inside it count as inside too.
  const panelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (ref.current?.contains(target) || panelRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return { open, setOpen, ref, panelRef };
}

const PANEL_WIDTH = 260;
const GAP = 8;
const EDGE = 12;
/** Below this width the list is a bottom sheet instead of a popover. */
const SHEET_BELOW = 640;

type Placement = { sheet: true } | { sheet: false; style: CSSProperties };

/**
 * Where the globe's list goes: a bottom sheet on phones; otherwise a popover under the button, or above it when
 * there isn't room below (the footer of sign-up), always inside the window and scrolling if it's short.
 */
function placePanel(button: HTMLElement): Placement {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  if (vw < SHEET_BELOW) return { sheet: true };
  const rect = button.getBoundingClientRect();
  const width = Math.min(PANEL_WIDTH, vw - EDGE * 2);
  const left = Math.min(Math.max(EDGE, rect.right - width), vw - width - EDGE);
  const below = vh - rect.bottom - GAP - EDGE;
  const above = rect.top - GAP - EDGE;
  const openUp = below < 340 && above > below;
  const maxHeight = Math.max(160, openUp ? above : below);
  return {
    sheet: false,
    style: openUp
      ? { position: "fixed", left, width, bottom: vh - rect.top + GAP, maxHeight }
      : { position: "fixed", left, width, top: rect.bottom + GAP, maxHeight },
  };
}

export function LanguagePicker({ variant = "list", className = "" }: { variant?: Variant; className?: string }) {
  const locale = useLocale();
  const changing = useLocaleChanging();
  const t = useT("settings");
  const current = languageOf(locale);
  const { open, setOpen, ref } = usePopover();
  const panelId = useId();

  if (variant === "list") {
    return (
      <div className={className} aria-busy={changing}>
        <LanguageOptions />
        {locale !== "en" && <p className="m-0 mt-3 text-[12.5px] leading-[1.45] text-app-ink-soft">{t("language.draftNote")}</p>}
      </div>
    );
  }

  if (variant === "compact") {
    return (
      <div className={className}>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((value) => !value)}
          className="flex w-full items-center gap-2.5 rounded-[12px] px-3 py-2 text-left text-[13.5px] font-semibold text-app-ink hover:bg-app-canvas"
        >
          <Icon name="globe" size={15} />
          <span className="flex-1">{t("language.title")}</span>
          <span className="text-[12.5px] font-bold text-app-ink-soft">{current.nativeName}</span>
          <Icon name="chevDown" size={13} className={`text-app-ink-faint transition ${open ? "rotate-180" : ""}`} />
        </button>
        {open && (
          <div id={panelId} className="px-1 pb-1">
            <LanguageOptions dense onChosen={() => setOpen(false)} />
          </div>
        )}
      </div>
    );
  }

  // globe
  return <GlobePicker className={className} />;
}

function GlobePicker({ className }: { className: string }) {
  const locale = useLocale();
  const t = useT("settings");
  const current = languageOf(locale);
  const { open, setOpen, ref, panelRef } = usePopover();
  const panelId = useId();
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const [placement, setPlacement] = useState<Placement | null>(null);

  const place = useCallback(() => {
    if (buttonRef.current) setPlacement(placePanel(buttonRef.current));
  }, []);
  useLayoutEffect(() => {
    if (!open) return;
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, place]);
  // The phone sheet covers the page: keep the page from scrolling behind it.
  useEffect(() => {
    if (!open || !placement?.sheet) return;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = overflow;
    };
  }, [open, placement]);

  const close = () => setOpen(false);
  const heading = <div className="px-3 pb-1 pt-2 text-[11px] font-extrabold uppercase tracking-[0.7px] text-[#9A96A8]">{t("language.choose")}</div>;

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        ref={buttonRef}
        type="button"
        aria-label={t("language.button", { language: current.nativeName })}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex h-10 items-center gap-1.5 rounded-full border border-app-line bg-white px-3 text-[13px] font-bold text-app-ink hover:border-app-line-strong"
      >
        <Icon name="globe" size={16} />
        <span className="uppercase tracking-[0.04em]">{locale}</span>
      </button>
      {open &&
        placement &&
        typeof document !== "undefined" &&
        createPortal(
          placement.sheet ? (
            <div className="fixed inset-0 z-[80] font-app">
              <div aria-hidden onClick={close} className="absolute inset-0 bg-[rgba(22,20,31,0.38)]" />
              <div
                ref={panelRef}
                id={panelId}
                role="dialog"
                aria-modal="true"
                aria-label={t("language.choose")}
                className="absolute inset-x-0 bottom-0 max-h-[80vh] overflow-y-auto overscroll-contain rounded-t-[22px] bg-white px-3 pb-[max(16px,env(safe-area-inset-bottom))] pt-2 shadow-[0_-20px_40px_-20px_rgba(22,20,31,0.35)]"
              >
                <div aria-hidden className="mx-auto mb-1 mt-1 h-1 w-10 rounded-full bg-app-line" />
                {heading}
                <LanguageOptions dense onChosen={close} />
              </div>
            </div>
          ) : (
            <div
              ref={panelRef}
              id={panelId}
              role="dialog"
              aria-label={t("language.choose")}
              style={placement.style}
              className="z-[80] overflow-y-auto overscroll-contain rounded-[18px] border border-app-line bg-white p-1.5 font-app shadow-[0_20px_40px_-20px_rgba(22,20,31,0.35)]"
            >
              {heading}
              <LanguageOptions dense onChosen={close} />
            </div>
          ),
          document.body,
        )}
    </div>
  );
}

/** A Settings card: title, one line, the full list. */
export function LanguageSettingsCard({ className = "" }: { className?: string }) {
  const t = useT("settings");
  return (
    <section id="language" className={`rounded-[22px] border border-app-line bg-white p-5 ${className}`} aria-labelledby="language-settings-title">
      <div className="flex items-center gap-2.5">
        <span className="grid h-9 w-9 place-items-center rounded-full bg-app-canvas text-app-ink"><Icon name="globe" size={17} /></span>
        <div className="min-w-0">
          <h2 id="language-settings-title" className="m-0 text-[16px] font-extrabold text-app-ink">{t("language.title")}</h2>
          <p className="m-0 text-[13px] leading-[1.45] text-app-ink-soft">{t("language.sub")}</p>
        </div>
      </div>
      <LanguagePicker className="mt-4" />
    </section>
  );
}
