"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type React from "react";
import { AssistantNote } from "@/components/app-kit";
import { Notice, PillButton, Toggle, cx } from "@/components/app-ui";
import { Icon } from "@/components/ui/Icon";
import { BOUTIQUE_FONT_CLASS, BQ_GROTESK, BQ_SANS, BQ_SERIF } from "@/components/storefront/boutique/fonts";
import { ownPreviewProducts } from "@/lib/store-templates/demo-catalogue";
import {
  THEME_LIBRARY,
  THEME_TIERS,
  chipForStoreCategory,
  filterThemes,
  filterThemesByTier,
  searchThemes,
  themeCategoryChips,
  themeLibraryEntry,
  themeMeaningLine,
  tierIncludes,
  type ThemeChipId,
  type ThemeLibraryEntry,
  type ThemeTier,
} from "@/lib/store-templates/theme-library";
import { TIER_PLAN_LABEL } from "@/lib/theme-access";
import { ALL_THEMES_FREE } from "@shared/plans";
import { formatThemePrice } from "@shared/theme-purchase";
import { TIER_BADGE, ThemePreviewDialog, ThemeThumbnail, UPGRADE_HREF } from "./theme-preview/ThemePreview";
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
  /**
   * What the seller may use (plan tier, bought themes, the price of one theme per tier); loaded from
   * /api/store/templates/access when not given.
   */
  sellerAccess?: ThemeAccessInfo;
};

export const THEME_SWITCHED_EVENT = "shopinbos:theme-switched";

export interface ThemeAccessInfo {
  tier: ThemeTier;
  owned: string[];
  prices: { premium: number; platinum: number };
}

/** Where the gallery lives; Paystack sends the seller back here after buying a theme. */
const GALLERY_PATH = "/builder/templates";

type RexPick = { themeId: string; reason: string; source: "rex" | "rules"; note?: string };

function nameFont(theme: ThemeLibraryEntry): React.CSSProperties {
  const family = theme.preview.nameFont === "serif" ? BQ_SERIF : theme.preview.nameFont === "grotesk" ? BQ_GROTESK : BQ_SANS;
  return { fontFamily: family, fontWeight: Math.max(500, theme.preview.nameWeight), fontStyle: theme.preview.nameItalic ? "italic" : undefined, letterSpacing: theme.preview.nameFont === "sans" ? "-0.02em" : "-0.01em" };
}

export function ThemeLibrary({ mode, currentThemeId, onPreview, onCustomize, initialCategory, nextPath, onSwitched, ownStore, initialPreviewId, sellerAccess }: ThemeLibraryProps) {
  const router = useRouter();
  const t = useT("builder");
  const meaningLine = (theme: ThemeLibraryEntry) => themeMeaningLine({ name: theme.name, meaning: t.dynamic(`theme.${theme.id}.meaning`, theme.meaning) });
  const chips = useMemo(() => themeCategoryChips(THEME_LIBRARY), []);
  const [category, setCategory] = useState<ThemeChipId>(() => {
    const wanted = chipForStoreCategory(initialCategory);
    return chips.some((chip) => chip.id === wanted) ? wanted : "all";
  });
  const [query, setQuery] = useState("");
  const [tierFilter, setTierFilter] = useState<"all" | ThemeTier>("all");
  const [loadedAccess, setLoadedAccess] = useState<ThemeAccessInfo | null>(null);
  useEffect(() => {
    if (sellerAccess) return;
    let cancelled = false;
    fetch("/api/store/templates/access")
      .then((response) => (response.ok ? response.json() : null))
      .then((json: { data?: Partial<ThemeAccessInfo> } | null) => {
        const data = json?.data;
        if (cancelled || !data?.tier || !(THEME_TIERS as readonly string[]).includes(data.tier) || !data.prices) return;
        setLoadedAccess({ tier: data.tier, owned: Array.isArray(data.owned) ? data.owned : [], prices: data.prices });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [sellerAccess]);
  const access = sellerAccess ?? loadedAccess;
  // Until the plan is known everything shows as usable; the server checks again on switch.
  const allowedTier: ThemeTier = access?.tier ?? "platinum";
  const owned = access?.owned ?? [];
  const lockedPlan = (theme: ThemeLibraryEntry | null) => (theme && theme.id !== current && !tierIncludes(allowedTier, theme.tier) && !owned.includes(theme.id) ? TIER_PLAN_LABEL[theme.tier] : null);
  /** "₦2,000" for a theme that's locked and can be bought, else null. */
  const buyPrice = (theme: ThemeLibraryEntry | null) => (theme && lockedPlan(theme) && access && theme.tier !== "basic" ? formatThemePrice(access.prices[theme.tier]) : null);
  const [buyingId, setBuyingId] = useState<string | null>(null);
  // Back from Paystack: ?theme=paid|pending|failed&themeId=…
  const [bought, setBought] = useState<{ status: "paid" | "pending" | "failed"; themeId: string | null } | null>(null);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get("theme");
    if (status !== "paid" && status !== "pending" && status !== "failed") return;
    setBought({ status, themeId: params.get("themeId") });
    params.delete("theme");
    params.delete("themeId");
    const query = params.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}`);
  }, []);

  async function buyTheme(id: string) {
    setBuyingId(id);
    setError(null);
    try {
      const returnTo = nextPath ? `${GALLERY_PATH}?next=${encodeURIComponent(nextPath)}` : GALLERY_PATH;
      const response = await fetch("/api/store/templates/purchase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ themeId: id, returnTo }),
      });
      const json = (await response.json().catch(() => null)) as { data?: { authorizationUrl?: string }; error?: { message?: string } } | null;
      if (!response.ok || !json?.data?.authorizationUrl) {
        setError({ message: json?.error?.message ?? t("tl.err.buy"), upgrade: false });
        setBuyingId(null);
        return;
      }
      window.location.assign(json.data.authorizationUrl);
    } catch {
      setError({ message: t("tl.err.buy"), upgrade: false });
      setBuyingId(null);
    }
  }
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
  const [error, setError] = useState<{ message: string; upgrade: boolean } | null>(null);
  const [switched, setSwitched] = useState<ThemeSwitchedResult | null>(null);
  const [pick, setPick] = useState<RexPick | null>(null);
  const [picking, setPicking] = useState(false);
  const themes = searchThemes(query, filterThemesByTier(tierFilter, filterThemes(category)));

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
        error?: { code?: string; message?: string };
      } | null;
      if (!response.ok || !json?.data) {
        setError({ message: json?.error?.message ?? t("tl.err.switch"), upgrade: json?.error?.code === "UPGRADE_REQUIRED" });
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
      setError({ message: t("tl.err.switchNet"), upgrade: false });
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
        setError({ message: json?.error?.message ?? t("tl.err.pick"), upgrade: false });
        return;
      }
      setPick(json.data);
      setCategory("all");
    } catch {
      setError({ message: t("tl.err.pickNet"), upgrade: false });
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

      {/* Plan tiers: hidden while every theme is free for launch (shared/plans.ts ALL_THEMES_FREE). */}
      {ALL_THEMES_FREE ? null : (
      <div className="-mt-2 mb-5 flex flex-wrap items-center gap-2" role="group" aria-label={t("tl.tierFilter")}>
        {(["all", ...THEME_TIERS] as const).map((tier) => {
          const active = tierFilter === tier;
          return (
            <button
              key={tier}
              type="button"
              aria-pressed={active}
              onClick={() => setTierFilter(tier)}
              className={cx(
                "inline-flex min-h-[34px] items-center gap-1.5 rounded-full px-3.5 text-[13px] font-bold",
                active ? "bg-app-ink text-white" : "bg-transparent text-app-ink-soft hover:text-app-ink",
              )}
            >
              {tier === "all" ? t("tl.tierAll") : t(`tl.tier.${tier}`)}
              {tier !== "all" && !tierIncludes(allowedTier, tier) ? <Icon name="lock" size={12} /> : null}
            </button>
          );
        })}
      </div>
      )}

      <div className="mb-5 grid gap-3 empty:hidden">
        {bought ? (
          <Notice tone={bought.status === "paid" ? "success" : bought.status === "pending" ? "info" : "error"}>
            {bought.status === "paid"
              ? t("tl.bought", { name: themeLibraryEntry(bought.themeId)?.name ?? t("tl.theTheme") })
              : bought.status === "pending"
                ? t("tl.buyPending", { name: themeLibraryEntry(bought.themeId)?.name ?? t("tl.theTheme") })
                : t("tl.buyFailed")}
            {bought.status === "paid" && bought.themeId && themeLibraryEntry(bought.themeId) && bought.themeId !== current ? (
              <>
                {" "}
                <PillButton tone="ink" size="sm" busy={busyId === bought.themeId} disabled={Boolean(busyId)} onClick={() => void applyTheme(bought.themeId!)}>
                  {t("tl.useName", { name: themeLibraryEntry(bought.themeId)!.name })}
                </PillButton>
              </>
            ) : null}
          </Notice>
        ) : null}
        {error ? (
          <Notice tone="error">
            {error.message}
            {error.upgrade ? <> <a href={UPGRADE_HREF} className="font-bold underline underline-offset-4">{t("tl.upgrade")}</a></> : null}
          </Notice>
        ) : null}
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
              ) : lockedPlan(picked) ? (
                <div className="flex flex-wrap gap-2">
                  <PillButton tone="white" size="sm" onClick={() => setPreviewId(picked.id)}>{t("tl.preview")}</PillButton>
                  {buyPrice(picked) ? (
                    <PillButton tone="ink" size="sm" busy={buyingId === picked.id} disabled={Boolean(buyingId)} onClick={() => void buyTheme(picked.id)}>{t("tl.buy", { price: buyPrice(picked)! })}</PillButton>
                  ) : (
                    <a href={UPGRADE_HREF} className="inline-flex min-h-[38px] items-center gap-1.5 rounded-full bg-app-ink px-4 text-[13px] font-bold text-white no-underline hover:bg-black">
                      <Icon name="lock" size={14} /> {t("tp.upgradeTo", { plan: lockedPlan(picked)! })}
                    </a>
                  )}
                </div>
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
          const needs = lockedPlan(theme);
          const price = buyPrice(theme);
          const isOwned = owned.includes(theme.id) && !tierIncludes(allowedTier, theme.tier);
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
                    {ALL_THEMES_FREE ? null : (
                      <span className={cx("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold shadow-sm", TIER_BADGE[theme.tier])}>
                        {needs ? <Icon name="lock" size={11} /> : null}
                        {t(`tl.tier.${theme.tier}`)}
                      </span>
                    )}
                    {theme.isNew ? <span className="rounded-full bg-app-accent px-2.5 py-1 text-[11px] font-bold text-white shadow-sm">{t("tl.new")}</span> : null}
                    {isCurrent ? <span className="rounded-full bg-app-ink px-2.5 py-1 text-[11px] font-bold text-white shadow-sm">{t("tl.current")}</span> : null}
                    {isOwned ? <span className="inline-flex items-center gap-1 rounded-full bg-app-success-tint px-2.5 py-1 text-[11px] font-bold text-app-ink shadow-sm"><Icon name="check" size={11} />{t("tl.owned")}</span> : null}
                  </span>
                  {needs ? (
                    <span aria-hidden className="pointer-events-none absolute right-3 top-3 z-[2] grid h-8 w-8 place-items-center rounded-full bg-app-ink/85 text-white shadow-sm transition group-hover:opacity-0">
                      <Icon name="lock" size={15} />
                    </span>
                  ) : null}
                  {needs && price ? (
                    // Hover (or keyboard focus): the price to unlock it, and a click buys it. Phones use the Buy button below.
                    <div className="pointer-events-none absolute inset-0 z-[2] flex flex-col items-center justify-center gap-2.5 bg-[rgba(14,42,56,.62)] p-4 text-center opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100">
                      <span className="grid h-11 w-11 place-items-center rounded-full bg-white text-app-ink shadow-sm"><Icon name="lock" size={19} /></span>
                      <button
                        type="button"
                        tabIndex={-1}
                        disabled={Boolean(buyingId)}
                        onClick={() => void buyTheme(theme.id)}
                        className="pointer-events-none inline-flex min-h-[40px] items-center rounded-full border-0 bg-white px-4 text-[13.5px] font-bold text-app-ink shadow-sm hover:bg-app-canvas group-hover:pointer-events-auto disabled:opacity-60"
                      >
                        {buyingId === theme.id ? t("tl.unlocking") : t("tl.unlockFor", { price })}
                      </button>
                      <span className="text-[12px] font-semibold text-white/90">{t("tl.unlockHint", { plan: needs })}</span>
                    </div>
                  ) : (
                    <span aria-hidden className="pointer-events-none absolute bottom-3 right-3 z-[2] inline-flex items-center gap-1.5 rounded-full bg-white/95 px-3 py-1.5 text-[12.5px] font-bold text-app-ink opacity-0 shadow-sm transition group-hover:opacity-100 group-focus-within:opacity-100">
                      <Icon name="eye" size={14} /> {t("tl.preview")}
                    </span>
                  )}
                </div>
                <div className="mt-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 id={`theme-${theme.id}`} className="m-0 text-[18px] leading-tight" style={nameFont(theme)}>
                      {theme.name}
                      {isCurrent ? <span className="sr-only">{t("tl.currentSr")}</span> : null}
                    </h3>
                    <p className="m-0 mt-0.5 text-[12.5px] font-semibold text-app-ink-soft">{meaningLine(theme)}</p>
                    <p className="m-0 mt-1 text-[13px] leading-[1.45] text-app-ink-soft">{t.dynamic(`theme.${theme.id}.blurb`, theme.blurb)}</p>
                    {needs ? (
                      <p className="m-0 mt-1 text-[12.5px] font-bold text-app-ink">
                        {price ? t("tl.buyOrPlan", { price, plan: needs }) : t("tl.needsPlan", { plan: needs })}{" "}
                        <a href={UPGRADE_HREF} className="font-semibold text-app-ink-soft underline underline-offset-2">{t("tl.seePlans")}</a>
                      </p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-2 min-[420px]:flex-row min-[420px]:items-center">
                    <PillButton tone="white" size="sm" onClick={() => setPreviewId(theme.id)} aria-label={t("tl.previewName", { name: theme.name })}>{t("tl.preview")}</PillButton>
                    {isCurrent ? (
                      mode === "builder" && onCustomize ? <PillButton tone="ink" size="sm" onClick={onCustomize}>{t("tl.customize")}</PillButton> : null
                    ) : needs && price ? (
                      <PillButton tone="ink" size="sm" busy={buyingId === theme.id} disabled={Boolean(buyingId)} onClick={() => void buyTheme(theme.id)} aria-label={t("tl.buyName", { name: theme.name, price })}>
                        {t("tl.buy", { price })}
                      </PillButton>
                    ) : needs ? (
                      <a href={UPGRADE_HREF} title={t("tl.needsPlan", { plan: needs })} aria-label={t("tl.lockedNote", { name: theme.name, plan: needs })} className="inline-flex min-h-[36px] items-center gap-1.5 rounded-full bg-app-ink px-3.5 text-[13px] font-bold text-white no-underline hover:bg-black">
                        <Icon name="lock" size={13} /> {t("tl.upgrade")}
                      </a>
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
          lockedPlan={lockedPlan(themeLibraryEntry(previewId))}
          buyPrice={buyPrice(themeLibraryEntry(previewId))}
          buying={buyingId === previewId}
          onBuy={() => void buyTheme(previewId)}
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
