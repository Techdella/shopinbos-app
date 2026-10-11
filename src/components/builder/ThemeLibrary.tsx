"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type React from "react";
import { AssistantNote } from "@/components/app-kit";
import { Notice, PillButton, cx } from "@/components/app-ui";
import { BOUTIQUE_FONT_CLASS, BQ_GROTESK, BQ_SANS, BQ_SERIF } from "@/components/storefront/boutique/fonts";
import {
  THEME_LIBRARY,
  filterThemes,
  themeCategoryChips,
  themeLibraryEntry,
  type ThemeChipId,
  type ThemeLibraryEntry,
} from "@/lib/store-templates/theme-library";

// The eight 2026 storefront themes as cards. Used by /builder/templates (mode "page") and the builder's
// Themes view (mode "builder"). Switching changes the draft only on a live store; products, prices, orders
// and the seller's own words carry over.

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
  onPreview?: (id: string) => void;
  onCustomize?: () => void;
  /** Optional: the store's onboarding category, to open on the matching chip. */
  initialCategory?: string | null;
  /** Optional: first-run path. After a switch the seller goes straight here. */
  nextPath?: string | null;
  /** Optional: told after a successful switch (the builder reloads its draft). Also sent as a window event. */
  onSwitched?: (result: ThemeSwitchedResult) => void;
};

export const THEME_SWITCHED_EVENT = "shopinbos:theme-switched";

type RexPick = { themeId: string; reason: string; source: "rex" | "rules"; note?: string };

function chipFromCategory(value?: string | null): ThemeChipId {
  const text = value?.toLowerCase() ?? "";
  if (/shoe|sneaker|footwear/.test(text)) return "shoes";
  if (/luxury|jewel|perfume|watch/.test(text)) return "luxury";
  if (/food|drink|grocer|snack|bak/.test(text)) return "food";
  if (/home|decor|furniture|living/.test(text)) return "home";
  if (/gadget|phone|electr|tech/.test(text)) return "gadgets";
  if (/fashion|cloth|wear|bag|fabric/.test(text)) return "fashion";
  return "all";
}

function nameFont(theme: ThemeLibraryEntry): React.CSSProperties {
  const family = theme.preview.nameFont === "serif" ? BQ_SERIF : theme.preview.nameFont === "grotesk" ? BQ_GROTESK : BQ_SANS;
  return { fontFamily: family, fontWeight: theme.preview.nameWeight, fontStyle: theme.preview.nameItalic ? "italic" : undefined, letterSpacing: theme.preview.nameFont === "sans" ? "-0.02em" : "-0.01em" };
}

/** A small layout sketch in the theme's colours: header line, its own hero shape and three product tiles. */
function ThemeSketch({ theme, current }: { theme: ThemeLibraryEntry; current: boolean }) {
  const p = theme.preview;
  const box = { border: `1.5px solid ${p.line}` } as const;
  const hero = (() => {
    if (theme.id === "pantry") {
      return (
        <div className="grid flex-1 grid-cols-2 gap-1.5">
          <div className="flex flex-col justify-end gap-1.5 rounded-[10px] p-3" style={{ background: p.accent }}>
            <span className="h-2 w-3/4 rounded-full bg-white/80" />
            <span className="h-2 w-1/2 rounded-full bg-white/60" />
          </div>
          <div className="rounded-[10px]" style={box} />
        </div>
      );
    }
    if (theme.id === "ile") {
      return (
        <div className="flex flex-1 flex-col gap-2">
          <span className="h-2 w-1/2 rounded-full" style={{ background: p.ink, opacity: 0.55 }} />
          <div className="flex-1 rounded-[6px]" style={box} />
        </div>
      );
    }
    if (theme.id === "plug") {
      return (
        <div className="grid flex-1 grid-cols-2 items-center gap-2">
          <div className="flex flex-col gap-1.5">
            <span className="h-1.5 w-8 rounded-full" style={{ background: p.accent }} />
            <span className="h-2 w-full rounded-full" style={{ background: p.ink, opacity: 0.6 }} />
            <span className="h-2 w-2/3 rounded-full" style={{ background: p.ink, opacity: 0.4 }} />
          </div>
          <div className="aspect-square rounded-[6px]" style={{ ...box, background: `radial-gradient(circle, ${p.accent}55, transparent 65%)` }} />
        </div>
      );
    }
    return (
      <div className="relative flex-1" style={box}>
        <span
          className="absolute bottom-3 h-2"
          style={{
            left: theme.id === "adire" || theme.id === "noir" ? "30%" : 12,
            width: theme.id === "stride" ? "55%" : "40%",
            background: theme.id === "stride" ? p.accent : p.ink,
            opacity: theme.id === "stride" ? 1 : 0.35,
            borderRadius: 999,
          }}
        />
      </div>
    );
  })();
  return (
    <div
      aria-hidden
      className={cx("flex aspect-[4/5] flex-col gap-2.5 rounded-[22px] p-4 transition", current && "ring-[3px] ring-app-accent ring-offset-[3px] ring-offset-white")}
      style={{ background: p.bg, color: p.ink }}
    >
      <div className="flex items-start justify-between gap-2 border-b pb-2.5" style={{ borderColor: p.line }}>
        <span className="truncate text-[22px] leading-none" style={nameFont(theme)}>{theme.name}</span>
        <span className="flex shrink-0 items-center gap-1.5">
          <span className="text-[11px] font-semibold opacity-80">{theme.categoryLabel}</span>
          {theme.isNew ? <span className="rounded-full bg-app-accent px-2 py-0.5 text-[10.5px] font-bold text-white">New</span> : null}
        </span>
      </div>
      {hero}
      <div className="grid h-[22%] grid-cols-3 gap-1.5">
        {[0, 1, 2].map((index) => <div key={index} style={{ ...box, borderRadius: theme.id === "pantry" || theme.id === "stride" ? 10 : 2 }} />)}
      </div>
    </div>
  );
}

export function ThemeLibrary({ mode, currentThemeId, onPreview, onCustomize, initialCategory, nextPath, onSwitched }: ThemeLibraryProps) {
  const router = useRouter();
  const chips = useMemo(() => themeCategoryChips(THEME_LIBRARY), []);
  const [category, setCategory] = useState<ThemeChipId>(() => {
    const wanted = chipFromCategory(initialCategory);
    return chips.some((chip) => chip.id === wanted) ? wanted : "all";
  });
  const [current, setCurrent] = useState<string | null>(currentThemeId);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [switched, setSwitched] = useState<ThemeSwitchedResult | null>(null);
  const [pick, setPick] = useState<RexPick | null>(null);
  const [picking, setPicking] = useState(false);
  const themes = filterThemes(category);

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
        setError(json?.error?.message ?? "That theme didn't switch. Please try again.");
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
      setError("That theme didn't switch. Check your connection and try again.");
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
        setError(json?.error?.message ?? "Rex couldn't pick a theme just now.");
        return;
      }
      setPick(json.data);
      setCategory("all");
    } catch {
      setError("Rex couldn't pick a theme just now. Check your connection and try again.");
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
            <h2 className="m-0 text-[28px] font-extrabold leading-[1.1] tracking-[-0.6px]">Theme library</h2>
            <p className="mb-0 mt-1.5 text-[14.5px] text-app-ink-soft">
              {THEME_LIBRARY.length} themes, each with its own home, product and collection layouts. Your products, brand and orders carry over.
            </p>
          </div>
          <PillButton tone="white" size="md" onClick={() => void askRex()} busy={picking}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/app/rex.png" alt="" className="h-6 w-6 object-contain" />
            Let Rex pick one
          </PillButton>
        </div>
      ) : null}

      <div className="mb-5 flex flex-wrap gap-2" role="group" aria-label="Filter themes by category">
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
              {chip.label}
            </button>
          );
        })}
      </div>

      <div className="mb-5 grid gap-3 empty:hidden">
        {error ? <Notice tone="error">{error}</Notice> : null}
        {switched ? (
          <div role="status" className="flex flex-wrap items-center gap-3 rounded-[18px] bg-app-success-tint px-4 py-3">
            <p className="m-0 min-w-0 flex-1 text-[14.5px] font-medium leading-6 text-app-ink">
              Switched to {switched.templateName}. Your products and pages stay. Publish when you&apos;re happy.
              {switched.draftOnly ? <span className="text-app-ink-soft"> Shoppers keep seeing your live store until then.</span> : null}
            </p>
            <div className="flex flex-wrap gap-2">
              {mode === "builder" ? (
                <>
                  {onPreview ? <PillButton tone="white" size="sm" onClick={() => onPreview(switched.templateId)}>Preview</PillButton> : null}
                  {onCustomize ? <PillButton tone="ink" size="sm" onClick={onCustomize}>Customize</PillButton> : null}
                </>
              ) : (
                <>
                  {switched.storeSlug ? (
                    <a href={`/s/${switched.storeSlug}/preview`} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-[38px] items-center rounded-full border border-app-line bg-white px-4 text-[13px] font-bold text-app-ink no-underline hover:border-app-line-strong">
                      Preview
                    </a>
                  ) : null}
                  <Link href="/builder/editor" className="inline-flex min-h-[38px] items-center rounded-full bg-app-ink px-4 text-[13px] font-bold text-white no-underline hover:bg-black">
                    Open in builder
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
                <span className="text-[13.5px] font-bold">Already your theme</span>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {onPreview ? <PillButton tone="white" size="sm" onClick={() => onPreview(picked.id)}>Preview</PillButton> : null}
                  <PillButton tone="ink" size="sm" busy={busyId === picked.id} onClick={() => void applyTheme(picked.id)}>Use {picked.name}</PillButton>
                </div>
              )
            }
          >
            <strong>{picked.name}.</strong> {pick.reason}
            {pick.note ? <span className="block text-[13px] text-app-ink-soft">{pick.note}</span> : null}
          </AssistantNote>
        ) : null}
      </div>

      <ul className="m-0 grid list-none gap-x-5 gap-y-7 p-0 sm:grid-cols-2 lg:grid-cols-3 min-[1360px]:grid-cols-4">
        {themes.map((theme) => {
          const isCurrent = theme.id === current;
          const isPicked = pick?.themeId === theme.id && !isCurrent;
          return (
            <li key={theme.id} className="min-w-0">
              <article aria-labelledby={`theme-${theme.id}`} className={cx("rounded-[24px]", isPicked && "outline outline-2 outline-offset-4 outline-app-ink")}>
                {mode === "builder" && onPreview && !isCurrent ? (
                  <button type="button" onClick={() => onPreview(theme.id)} className="block w-full cursor-pointer border-0 bg-transparent p-0 text-left" aria-label={`Preview ${theme.name}`}>
                    <ThemeSketch theme={theme} current={isCurrent} />
                  </button>
                ) : (
                  <ThemeSketch theme={theme} current={isCurrent} />
                )}
                <div className="mt-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 id={`theme-${theme.id}`} className="m-0 text-[15px] font-extrabold">
                      {theme.name}
                      {isCurrent ? <span className="sr-only"> (current theme)</span> : null}
                    </h3>
                    <p className="m-0 mt-0.5 text-[13px] leading-[1.45] text-app-ink-soft">{theme.blurb}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {mode === "page" ? (
                      isCurrent ? (
                        <span className="px-2 text-[14px] font-extrabold">Current</span>
                      ) : (
                        <PillButton tone="ink" size="sm" busy={busyId === theme.id} disabled={Boolean(busyId)} onClick={() => void applyTheme(theme.id)} aria-label={`Use ${theme.name}`}>
                          Use this
                        </PillButton>
                      )
                    ) : isCurrent ? (
                      onCustomize ? <PillButton tone="ink" size="sm" onClick={onCustomize}>Customize</PillButton> : <span className="px-2 text-[14px] font-extrabold">Current</span>
                    ) : (
                      <>
                        {onPreview ? <PillButton tone="white" size="sm" onClick={() => onPreview(theme.id)} aria-label={`Preview ${theme.name}`}>Preview</PillButton> : null}
                        <PillButton tone="ink" size="sm" busy={busyId === theme.id} disabled={Boolean(busyId)} onClick={() => void applyTheme(theme.id)} aria-label={`Use ${theme.name}`}>
                          Use
                        </PillButton>
                      </>
                    )}
                  </div>
                </div>
              </article>
            </li>
          );
        })}
      </ul>

      {current && !themeLibraryEntry(current) ? (
        <p className="mt-6 text-[13.5px] text-app-ink-soft">
          Your store uses an older template. It keeps working; pick one of these whenever you want the new look.
        </p>
      ) : null}
    </div>
  );
}

export default ThemeLibrary;
