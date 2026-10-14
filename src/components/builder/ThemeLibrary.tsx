"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type React from "react";
import { AssistantNote } from "@/components/app-kit";
import { Notice, PillButton, Toggle, cx } from "@/components/app-ui";
import { Icon } from "@/components/ui/Icon";
import { BOUTIQUE_FONT_CLASS, BQ_GROTESK, BQ_SANS, BQ_SERIF } from "@/components/storefront/boutique/fonts";
import { ownPreviewProducts } from "@/lib/store-templates/demo-catalogue";
import {
  THEME_LIBRARY,
  chipForStoreCategory,
  filterThemes,
  searchThemes,
  themeCategoryChips,
  themeLibraryEntry,
  themeMeaningLine,
  type ThemeChipId,
  type ThemeLibraryEntry,
} from "@/lib/store-templates/theme-library";
import { ThemePreviewDialog, ThemeThumbnail } from "./theme-preview/ThemePreview";
import type { PreviewOwnStore } from "./theme-preview/preview-store";
import { Mascot } from "@/components/brand/Mascot";
import { useT } from "@/components/i18n/I18nProvider";

// The 2026 storefront themes as cards with real previews (the storefront renderer, scaled down, with a sample
// catalogue or the seller's own products). Used by /builder/templates (mode "page") and the builder's Themes view
// (mode "builder"). Switching changes the draft only on a live store; products, prices, orders and the seller's
// own words carry over.

export interface ThemeSwitchedResult {
  templateId: string;
  templateName: string;
  storeSlug: string | null;
  draftOnly: boolean;
  draft: unknown;
}

export type ThemeLibraryProps = {
  mode: "page" | "builder";
  currentThemeId: string | null;
  /** Builder only: open a theme in the builder canvas (used after Rex's pick and a switch). */
  onPreview?: (id: string) => void;
  onCustomize?: () => void;
  /** Optional: the store's onboarding category, to open on the matching chip. */
  initialCategory?: string | null;
  /** Optional: first-run path. After a switch the seller goes straight here. */
  nextPath?: string | null;
  /** Optional: told after a successful switch (the builder reloads its draft). Also sent as a window event. */
  onSwitched?: (result: ThemeSwitchedResult) => void;
  /** Optional: the seller's store, for "Show with my products" (needs 4 or more products with photos). */
  ownStore?: PreviewOwnStore | null;
  /** Optional: a theme to open in preview straight away (e.g. "Use this template" on shopinbos.com). */
  initialPreviewId?: string | null;
};

export const THEME_SWITCHED_EVENT = "shopinbos:theme-switched";

type RexPick = { themeId: string; reason: string; source: "rex" | "rules"; note?: string };

function nameFont(theme: ThemeLibraryEntry): React.CSSProperties {
  const family = theme.preview.nameFont === "serif" ? BQ_SERIF : theme.preview.nameFont === "grotesk" ? BQ_GROTESK : BQ_SANS;
  return { fontFamily: family, fontWeight: Math.max(500, theme.preview.nameWeight), fontStyle: theme.preview.nameItalic ? "italic" : undefined, letterSpacing: theme.preview.nameFont === "sans" ? "-0.02em" : "-0.01em" };
}

export function ThemeLibrary({ mode, currentThemeId, onPreview, onCustomize, initialCategory, nextPath, onSwitched, ownStore, initialPreviewId }: ThemeLibraryProps) {
  const router = useRouter();
  const t = useT("builder");
  const meaningLine = (theme: ThemeLibraryEntry) => themeMeaningLine({ name: theme.name, meaning: t.dynamic(`theme.${theme.id}.meaning`, theme.meaning) });
  const chips = useMemo(() => themeCategoryChips(THEME_LIBRARY), []);
  const [category, setCategory] = useState<ThemeChipId>(() => {
    const wanted = chipForStoreCategory(initialCategory);
    return chips.some((chip) => chip.id === wanted) ? wanted : "all";
  });
  const [query, setQuery] = useState("");
  const [previewId, setPreviewId] = useState<string | null>(initialPreviewId ?? null);
  // "Show with my products": only when the store has enough products with photos to fill a page.
  const own = useMemo<PreviewOwnStore | null>(() => {
    const products = ownStore ? ownPreviewProducts(ownStore.storeProducts) : null;
    return ownStore && products ? { ...ownStore, storeProducts: products } : null;
  }, [ownStore]);
  const [useOwn, setUseOwn] = useState(false);
  const thumbOwn = useOwn ? own : null;
  const [current, setCurrent] = useState<string | null>(currentThemeId);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [switched, setSwitched] = useState<ThemeSwitchedResult | null>(null);
  const [pick, setPick] = useState<RexPick | null>(null);
  const [picking, setPicking] = useState(false);
  const themes = searchThemes(query, filterThemes(category));

  async function applyTheme(id: string) {
    setBusyId(id);
    setError(null);
    try {
      const response = await fetch("/api/store/templates/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateId: id }),
      });
      const json = (await response.json().catch(() => null)) as {
        data?: { template?: { templateId: string; templateName: string }; storeSlug?: string; draftOnly?: boolean; draft?: unknown };
        error?: { message?: string };
      } | null;
      if (!response.ok || !json?.data) {
        setError(json?.error?.message ?? t("tl.err.switch"));
        return;
      }
      const result: ThemeSwitchedResult = {
        templateId: json.data.template?.templateId ?? id,
        templateName: json.data.template?.templateName ?? themeLibraryEntry(id)?.name ?? id,
        storeSlug: json.data.storeSlug ?? null,
        draftOnly: Boolean(json.data.draftOnly),
        draft: json.data.draft ?? null,
      };
      setCurrent(result.templateId);
      setPick(null);
      onSwitched?.(result);
      if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(THEME_SWITCHED_EVENT, { detail: result }));
      if (nextPath) {
        router.push(nextPath);
        return;
      }
      setSwitched(result);
      router.refresh();
    } catch {
      setError(t("tl.err.switchNet"));
    } finally {
      setBusyId(null);
    }
  }

  async function askRex() {
    setPicking(true);
    setError(null);
    try {
      const response = await fetch("/api/store/templates/recommend", { method: "POST" });
      const json = (await response.json().catch(() => null)) as { data?: RexPick; error?: { message?: string } } | null;
      if (!response.ok || !json?.data) {
        setError(json?.error?.message ?? t("tl.err.pick"));
        return;
      }
      setPick(json.data);
      setCategory("all");
    } catch {
      setError(t("tl.err.pickNet"));
    } finally {
      setPicking(false);
    }
  }

  const picked = pick ? themeLibraryEntry(pick.themeId) : null;

  return (
    <div className={cx("font-app text-app-ink", BOUTIQUE_FONT_CLASS)}>
      {mode === "builder" ? (
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h2 className="m-0 text-[28px] font-extrabold leading-[1.1] tracking-[-0.6px]">{t("tl.title")}</h2>
            <p className="mb-0 mt-1.5 text-[14.5px] text-app-ink-soft">
              {t("tl.sub", { count: THEME_LIBRARY.length })}
            </p>
          </div>
          <PillButton tone="white" size="md" onClick={() => void askRex()} busy={picking}>
            <Mascot who="rex" mood={picking ? "thinking" : "idle"} className="h-6 w-6" decorative />
            {t("tl.letRex")}
          </PillButton>
        </div>
      ) : null}

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <label className="flex h-11 min-w-[220px] max-w-[420px] flex-1 items-center gap-2 rounded-full border border-app-line bg-white px-4 focus-within:border-app-ink">
          <Icon name="search" size={16} />
          <span className="sr-only">{t("tl.search")}</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("tl.searchPh")}
            className="h-full min-w-0 flex-1 bg-transparent text-[14.5px] outline-none"
          />
        </label>
        {own ? (
          <label className="flex items-center gap-2.5 text-[14px] font-bold">
            <Toggle on={useOwn} onChange={setUseOwn} label={t("tl.showOwn")} />
            {t("tl.showOwn")}
          </label>
        ) : null}
      </div>

      <div className="mb-5 flex flex-wrap gap-2" role="group" aria-label={t("tl.filter")}>
        {chips.map((chip) => {
          const active = category === chip.id;
          return (
            <button
              key={chip.id}
              type="button"
              aria-pressed={active}
              onClick={() => setCategory(chip.id)}
              className={cx(
                "inline-flex min-h-[40px] items-center rounded-full border px-4 text-[14px] font-bold",
                active ? "border-app-ink bg-app-ink text-white" : "border-app-line bg-white text-app-ink hover:border-app-line-strong",
              )}
            >
              {t.dynamic(`chipf.${chip.id}`, chip.label)}
            </button>
          );
        })}
      </div>

      <div className="mb-5 grid gap-3 empty:hidden">
        {error ? <Notice tone="error">{error}</Notice> : null}
        {switched ? (
          <div role="status" className="flex flex-wrap items-center gap-3 rounded-[18px] bg-app-success-tint px-4 py-3">
            <p className="m-0 min-w-0 flex-1 text-[14.5px] font-medium leading-6 text-app-ink">
              {t("tl.switched", { name: switched.templateName })}
              {switched.draftOnly ? <span className="text-app-ink-soft">{t("tl.liveUntil")}</span> : null}
            </p>
            <div className="flex flex-wrap gap-2">
              {mode === "builder" ? (
                <>
                  {onPreview ? <PillButton tone="white" size="sm" onClick={() => onPreview(switched.templateId)}>{t("tl.preview")}</PillButton> : null}
                  {onCustomize ? <PillButton tone="ink" size="sm" onClick={onCustomize}>{t("tl.customize")}</PillButton> : null}
                </>
              ) : (
                <>
                  {switched.storeSlug ? (
                    <a href={`/s/${switched.storeSlug}/preview`} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-[38px] items-center rounded-full border border-app-line bg-white px-4 text-[13px] font-bold text-app-ink no-underline hover:border-app-line-strong">
                      {t("tl.preview")}
                    </a>
                  ) : null}
                  <Link href="/builder/editor" className="inline-flex min-h-[38px] items-center rounded-full bg-app-ink px-4 text-[13px] font-bold text-white no-underline hover:bg-black">
                    {t("tl.openBuilder")}
                  </Link>
                </>
              )}
            </div>
          </div>
        ) : null}
        {pick && picked ? (
          <AssistantNote
            who="rex"
            action={
              picked.id === current ? (
                <span className="text-[13.5px] font-bold">{t("tl.already")}</span>
              ) : (
                <div className="flex flex-wrap gap-2">
                  <PillButton tone="white" size="sm" onClick={() => setPreviewId(picked.id)}>{t("tl.preview")}</PillButton>
                  <PillButton tone="ink" size="sm" busy={busyId === picked.id} onClick={() => void applyTheme(picked.id)}>{t("tl.useName", { name: picked.name })}</PillButton>
                </div>
              )
            }
          >
            <strong>{picked.name}.</strong> {pick.reason}
            {pick.note ? <span className="block text-[13px] text-app-ink-soft">{pick.note}</span> : null}
          </AssistantNote>
        ) : null}
      </div>

      <ul className="m-0 grid list-none gap-x-5 gap-y-8 p-0 sm:grid-cols-2 lg:grid-cols-3 min-[1360px]:grid-cols-4">
        {themes.map((theme) => {
          const isCurrent = theme.id === current;
          const isPicked = pick?.themeId === theme.id && !isCurrent;
          return (
            <li key={theme.id} className="min-w-0">
              <article aria-labelledby={`theme-${theme.id}`} className={cx("rounded-[24px]", isPicked && "outline outline-2 outline-offset-4 outline-app-ink")}>
                <div
                  className={cx(
                    "group relative overflow-hidden rounded-[22px] border border-app-line bg-white transition hover:border-app-line-strong",
                    isCurrent && "ring-[3px] ring-app-accent ring-offset-[3px] ring-offset-white",
                  )}
                >
                  <ThemeThumbnail themeId={theme.id} own={thumbOwn} />
                  {/* The preview is a whole storefront (links, buttons), so it sits beside the button, never inside it. */}
                  <button
                    type="button"
                    onClick={() => setPreviewId(theme.id)}
                    aria-label={t("tl.previewName", { name: theme.name })}
                    className="absolute inset-0 z-[1] block h-full w-full cursor-pointer rounded-[22px] border-0 bg-transparent p-0 focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-[-3px] focus-visible:outline-app-ink"
                  />
                  <span className="pointer-events-none absolute left-3 top-3 z-[2] flex flex-wrap gap-1.5">
                    {theme.isNew ? <span className="rounded-full bg-app-accent px-2.5 py-1 text-[11px] font-bold text-white shadow-sm">{t("tl.new")}</span> : null}
                    {isCurrent ? <span className="rounded-full bg-app-ink px-2.5 py-1 text-[11px] font-bold text-white shadow-sm">{t("tl.current")}</span> : null}
                  </span>
                  <span aria-hidden className="pointer-events-none absolute bottom-3 right-3 z-[2] inline-flex items-center gap-1.5 rounded-full bg-white/95 px-3 py-1.5 text-[12.5px] font-bold text-app-ink opacity-0 shadow-sm transition group-hover:opacity-100 group-focus-within:opacity-100">
                    <Icon name="eye" size={14} /> {t("tl.preview")}
                  </span>
                </div>
                <div className="mt-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 id={`theme-${theme.id}`} className="m-0 text-[18px] leading-tight" style={nameFont(theme)}>
                      {theme.name}
                      {isCurrent ? <span className="sr-only">{t("tl.currentSr")}</span> : null}
                    </h3>
                    <p className="m-0 mt-0.5 text-[12.5px] font-semibold text-app-ink-soft">{meaningLine(theme)}</p>
                    <p className="m-0 mt-1 text-[13px] leading-[1.45] text-app-ink-soft">{t.dynamic(`theme.${theme.id}.blurb`, theme.blurb)}</p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-2 min-[420px]:flex-row min-[420px]:items-center">
                    <PillButton tone="white" size="sm" onClick={() => setPreviewId(theme.id)} aria-label={t("tl.previewName", { name: theme.name })}>{t("tl.preview")}</PillButton>
                    {isCurrent ? (
                      mode === "builder" && onCustomize ? <PillButton tone="ink" size="sm" onClick={onCustomize}>{t("tl.customize")}</PillButton> : null
                    ) : (
                      <PillButton tone="ink" size="sm" busy={busyId === theme.id} disabled={Boolean(busyId)} onClick={() => void applyTheme(theme.id)} aria-label={t("tl.useName", { name: theme.name })}>
                        {mode === "page" ? t("tl.useThis") : t("tl.use")}
                      </PillButton>
                    )}
                  </div>
                </div>
              </article>
            </li>
          );
        })}
      </ul>
      {!themes.length ? (
        <p className="py-10 text-center text-[14.5px] text-app-ink-soft">
          {(() => {
            const [before, after = ""] = t(category !== "all" ? "tl.noMatchCat" : "tl.noMatch", { query, link: "\u0001" }).split("\u0001");
            return <>{before}<button type="button" className="font-bold underline underline-offset-4" onClick={() => { setQuery(""); setCategory("all"); }}>{t("tl.seeAll")}</button>{after}</>;
          })()}
        </p>
      ) : null}

      {previewId ? (
        <ThemePreviewDialog
          themeId={previewId}
          onClose={() => setPreviewId(null)}
          own={own}
          useOwn={useOwn}
          onUseOwnChange={setUseOwn}
          isCurrent={previewId === current}
          busy={busyId === previewId}
          onUse={() => {
            const id = previewId;
            void applyTheme(id).then(() => setPreviewId((open) => (open === id ? null : open)));
          }}
        />
      ) : null}

      {current && !themeLibraryEntry(current) ? (
        <p className="mt-6 text-[13.5px] text-app-ink-soft">
          {t("tl.older")}
        </p>
      ) : null}
    </div>
  );
}

export default ThemeLibrary;
