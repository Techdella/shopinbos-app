"use client";

import { useEffect, useId, useRef, useState } from "react";
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
  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return { open, setOpen, ref };
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
  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
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
      {open && (
        <div
          id={panelId}
          role="dialog"
          aria-label={t("language.choose")}
          className="absolute right-0 top-full z-50 mt-2 w-[min(260px,calc(100vw-32px))] rounded-[18px] border border-app-line bg-white p-1.5 font-app shadow-[0_20px_40px_-20px_rgba(22,20,31,0.35)]"
        >
          <div className="px-3 pb-1 pt-2 text-[11px] font-extrabold uppercase tracking-[0.7px] text-[#9A96A8]">{t("language.choose")}</div>
          <LanguageOptions dense onChosen={() => setOpen(false)} />
        </div>
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
