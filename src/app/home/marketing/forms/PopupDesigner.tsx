"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Segmented } from "@/components/app-ui";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Field, checkClass, inputClass, selectClass } from "@/components/growth/kit";
import { MediaPicker } from "@/components/media/MediaPicker";
import { PopupView, type RenderablePopup } from "@/components/storefront/marketing/PopupView";
import type { PopupPrizes } from "@/components/storefront/marketing/PopupGame";
import type { SignupColors } from "@/components/storefront/marketing/SignupForm";
import { useT } from "@/components/i18n/I18nProvider";
import {
  POPUP_ARTS,
  POPUP_DECORS,
  POPUP_ANIMATIONS,
  mysterySummary,
  rewardLabel,
  templatesForKind,
  type FormReward,
  type LeadMagnet,
  type PopupConfig,
  type FormDesign,
  type PopupKind,
  type PopupLayout,
  type PopupRewardSummary,
  type PopupStyle,
  type PopupTemplate,
  type PopupTemplateId,
} from "@/lib/marketing/forms";
import { CTA_TARGETS, POPUP_KINDS, downloadNameFromFile, safeDownloadUrl, toLocalInput, type CtaTarget } from "@/lib/marketing/popup-kinds";
import type { MessageKey } from "@shared/i18n/catalog";

// The pop-up editor's pieces: "what is it for" cards, a gallery of templates for that kind (drawn by the real
// storefront renderer, scaled down), simple style and picture controls, each kind's own settings, and a live
// preview at computer and phone width.

type Key = MessageKey<"marketing">;

/** The store's own colours and heading font, for presets and previews. */
export interface EditorTheme extends SignupColors {
  swatches: string[];
}

/** What the previews need from the store: its prizes (games) and its free-delivery amount. */
export interface EditorExtras {
  prizes: PopupPrizes;
  /** From the delivery settings, when every delivery zone has one. */
  storeFreeDeliveryOver: number | null;
}

/** One of the store's active discount codes the seller can hand out. */
export interface DiscountOption {
  id: string;
  code: string;
  label: string;
  type: FormReward["type"];
  value: number;
  minOrder: number;
}

export const NEW_REWARD: FormReward = { source: "new", type: "percentage", value: 10, days: 14, minOrder: 0, unique: true, discountId: null, code: "", prefix: "WELCOME" };

/** What the shopper is told about the reward, worked out from the editor's draft. */
export function rewardSummaryFor(reward: FormReward | null, discounts: DiscountOption[]): PopupRewardSummary | null {
  if (!reward) return null;
  if (reward.source === "existing") {
    const option = discounts.find((d) => d.id === reward.discountId);
    if (!option) return null;
    return reward.mystery ? mysterySummary(option.minOrder) : { label: option.label, type: option.type, value: option.value, minOrder: option.minOrder };
  }
  if (reward.type !== "free_shipping" && !(reward.value > 0)) return null;
  return reward.mystery ? mysterySummary(reward.minOrder) : { label: rewardLabel(reward), type: reward.type, value: reward.value, minOrder: reward.minOrder };
}

/**
 * Uploads a free-download file (PDF or picture) through the store's file upload (/api/app/cms/upload, the one
 * the content pages use for downloadable PDFs): checked by type and content on the server, kept in the store's folder.
 */
async function uploadDownload(file: File): Promise<{ url: string; name: string }> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch("/api/app/cms/upload", { method: "POST", body: form, credentials: "same-origin" });
  const json = (await res.json().catch(() => null)) as { data?: { url: string; name: string }; error?: { message?: string } } | null;
  if (!res.ok || !json?.data) throw new Error(json?.error?.message ?? "");
  return json.data;
}

const KIND_ICON: Record<PopupKind, IconName> = {
  signup: "percent",
  game: "star",
  lead_magnet: "download",
  announcement: "megaphone",
  countdown: "clock",
  free_delivery: "truck",
};

// ─── Step 1: what is it for ───────────────────────────────────────────────────

export function KindPicker({ value, onPick }: { value: PopupKind | null; onPick: (kind: PopupKind) => void }) {
  const t = useT("marketing");
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" role="group" aria-label={t("forms.kind.question")}>
      {POPUP_KINDS.map((kind) => (
        <button
          key={kind}
          type="button"
          aria-pressed={value === kind}
          onClick={() => onPick(kind)}
          className="grid min-h-[112px] content-start gap-1.5 rounded-[18px] border-2 border-app-line bg-white p-4 text-left transition hover:border-app-line-strong focus-visible:outline focus-visible:outline-2 aria-pressed:border-app-ink"
        >
          <span className="grid h-10 w-10 place-items-center rounded-[12px] bg-app-canvas"><Icon name={KIND_ICON[kind]} size={18} /></span>
          <span className="text-[15px] font-extrabold">{t(`forms.kind.${kind}` as Key)}</span>
          <span className="text-[13px] leading-[1.45] text-app-ink-soft">{t(`forms.kind.${kind}.sub` as Key)}</span>
        </button>
      ))}
    </div>
  );
}

// ─── Preview stage ────────────────────────────────────────────────────────────

/** A pretend store page the pop-up sits on, drawn at `width`×`height` and scaled to fit. */
function Stage({ width, height, theme, fixedScale, children }: { width: number; height: number; theme: EditorTheme; fixedScale?: number; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState(fixedScale ?? 1);
  useEffect(() => {
    if (fixedScale || !ref.current || typeof ResizeObserver === "undefined") return;
    const el = ref.current;
    const observer = new ResizeObserver(() => setFit(Math.min(1, el.clientWidth / width)));
    observer.observe(el);
    return () => observer.disconnect();
  }, [width, fixedScale]);
  const scale = fixedScale ?? fit;
  const block = `${theme.ink}14`;
  return (
    <div ref={ref} className="w-full min-w-0">
      <div className="relative mx-auto overflow-hidden rounded-[14px] border border-app-line" style={{ width: width * scale, height: height * scale }}>
        <div className="absolute left-0 top-0 origin-top-left" style={{ width, height, transform: `scale(${scale})`, background: theme.paper }}>
          <div aria-hidden className="grid gap-4 p-5">
            <div className="flex items-center justify-between">
              <div className="h-5 w-28 rounded-full" style={{ background: block }} />
              <div className="h-5 w-16 rounded-full" style={{ background: block }} />
            </div>
            <div className="h-40 rounded-2xl" style={{ background: block }} />
            <div className="grid grid-cols-3 gap-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-28 rounded-xl" style={{ background: block }} />
              ))}
            </div>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}

function PreviewPopup({ popup, theme, state, motion = true }: { popup: RenderablePopup; theme: EditorTheme; state: "form" | "success"; motion?: boolean }) {
  return <PopupView popup={popup} storeSlug="preview" colors={theme} result={null} onResult={() => undefined} onClose={() => undefined} preview={state} motion={motion} />;
}

// ─── Templates ────────────────────────────────────────────────────────────────

/** The template's starter words as design fields. */
export function templateDesign(template: PopupTemplate): Partial<FormDesign> {
  const w = template.words;
  return {
    eyebrow: w.eyebrow,
    headline: w.headline,
    body: w.body,
    buttonText: w.buttonText,
    ...(w.successMessage ? { successMessage: w.successMessage } : {}),
    ...(w.ctaLabel ? { ctaLabel: w.ctaLabel, ctaTarget: w.ctaTarget ?? "shop" } : {}),
  };
}

/** The reward a template starts with, as a full reward (undefined: keep the current one). */
export function templateReward(template: PopupTemplate, current: FormReward | null): FormReward | null | undefined {
  if (template.reward === undefined) return undefined;
  if (template.reward === null) return null;
  const base = current && current.source === "new" ? current : NEW_REWARD;
  return { ...base, source: "new", type: template.reward.type, value: template.reward.value, ...(template.reward.mystery ? { mystery: true } : { mystery: undefined }) };
}

/** A template drawn the way the shopper would see it, for the gallery. */
export function templateSample(template: PopupTemplate, base: RenderablePopup, discounts: DiscountOption[]): RenderablePopup {
  const reward = template.kind === "signup" ? rewardSummaryFor(templateReward(template, null) ?? null, discounts) : null;
  return {
    ...base,
    kind: template.kind,
    layout: template.layout,
    reward,
    design: { ...base.design, ...templateDesign(template), style: template.style },
    game: base.game ? { ...base.game, game: template.config?.game ?? base.game.game } : null,
    leadMagnetName: null,
  };
}

export function TemplateGallery({ kind, base, theme, discounts, value, onPick }: { kind: PopupKind; base: RenderablePopup; theme: EditorTheme; discounts: DiscountOption[]; value: PopupTemplateId | null; onPick: (template: PopupTemplate) => void }) {
  const t = useT("marketing");
  const templates = templatesForKind(kind);
  const hasSeasonal = templates.some((template) => template.seasonal) && templates.some((template) => !template.seasonal);
  const [filter, setFilter] = useState<"all" | "seasonal">("all");
  const shown = filter === "seasonal" ? templates.filter((template) => template.seasonal) : templates;
  return (
    <div className="grid gap-3">
      {hasSeasonal ? (
        <div className="flex flex-wrap gap-2" role="group" aria-label={t("forms.gallery.filter")}>
          {(["all", "seasonal"] as const).map((option) => (
            <button key={option} type="button" aria-pressed={filter === option} onClick={() => setFilter(option)} className="min-h-[36px] rounded-full border border-app-line px-3.5 text-[13px] font-bold aria-pressed:border-app-ink aria-pressed:bg-app-ink aria-pressed:text-white">
              {t(`forms.gallery.${option}` as Key)}
            </button>
          ))}
        </div>
      ) : null}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3" role="group" aria-label={t("forms.pickLook")}>
        {shown.map((template) => {
          const on = template.id === value;
          return (
            <button
              key={template.id}
              type="button"
              aria-pressed={on}
              onClick={() => onPick(template)}
              className={`group grid gap-1.5 rounded-[16px] border-2 bg-white p-1.5 text-left transition focus-visible:outline focus-visible:outline-2 ${on ? "border-app-ink" : "border-transparent hover:border-app-line-strong"}`}
            >
              <div inert aria-hidden className="pointer-events-none">
                <Stage width={640} height={460} theme={theme} fixedScale={0.26}>
                  <PreviewPopup popup={templateSample(template, base, discounts)} theme={theme} state="form" motion={false} />
                </Stage>
              </div>
              <span className="flex items-center gap-1.5 px-1 pb-0.5 text-[13px] font-bold">
                <span className="min-w-0 flex-1 truncate">{t(`forms.tpl.${template.id}` as Key)}</span>
                {on ? <Icon name="check" size={14} /> : null}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Live preview ─────────────────────────────────────────────────────────────

export function LivePreview({ popup, theme }: { popup: RenderablePopup; theme: EditorTheme }) {
  const t = useT("marketing");
  const [device, setDevice] = useState<"computer" | "phone">("computer");
  const [state, setState] = useState<"form" | "success">("form");
  const kind = popup.kind ?? "signup";
  const hasAfter = kind === "signup" || kind === "lead_magnet" || kind === "game";
  const shownState = hasAfter ? state : "form";
  // Remount when the state or look changes, so the entrance motion plays again in the preview.
  const replay = `${shownState}-${popup.layout}-${popup.design.style.template}-${popup.design.style.animation}`;
  return (
    <div className="grid gap-3 rounded-[18px] bg-app-canvas p-3 sm:p-4" aria-label={t("editor.preview")}>
      <div className="flex flex-wrap gap-2">
        <Segmented
          className="min-w-[200px] flex-1"
          options={[
            { value: "computer", label: t("forms.preview.computer") },
            { value: "phone", label: t("forms.preview.phone") },
          ]}
          value={device}
          onChange={setDevice}
        />
        {hasAfter ? (
          <Segmented
            className="min-w-[220px] flex-1"
            options={[
              { value: "form", label: kind === "game" ? t("forms.preview.beforePlay") : t("forms.preview.before") },
              { value: "success", label: kind === "game" ? t("forms.preview.afterPlay") : t("forms.preview.after") },
            ]}
            value={state}
            onChange={setState}
          />
        ) : null}
      </div>
      {device === "computer" ? (
        <Stage width={1024} height={680} theme={theme}>
          <PreviewPopup key={replay} popup={popup} theme={theme} state={shownState} />
        </Stage>
      ) : (
        <div className="mx-auto w-full max-w-[300px]">
          <Stage width={375} height={720} theme={theme}>
            <PreviewPopup key={replay} popup={popup} theme={theme} state={shownState} />
          </Stage>
        </div>
      )}
      <p className="m-0 text-[12.5px] text-app-ink-soft">{t("forms.previewNote")}</p>
    </div>
  );
}

// ─── Style controls ───────────────────────────────────────────────────────────

function ColourControl({ id, label, value, fallback, swatches, onChange }: { id: string; label: string; value: string; fallback: string; swatches: string[]; onChange: (value: string) => void }) {
  const t = useT("marketing");
  const current = value || fallback;
  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="text-[13.5px] font-bold">{label}</label>
      <div className="flex flex-wrap items-center gap-1.5">
        <input id={id} type="color" value={/^#[0-9a-f]{6}$/i.test(current) ? current : "#000000"} onChange={(e) => onChange(e.target.value.toUpperCase())} className="h-10 w-12 cursor-pointer rounded-[10px] border border-app-line bg-white p-1" />
        {swatches.map((swatch) => (
          <button
            key={swatch}
            type="button"
            onClick={() => onChange(swatch)}
            aria-label={`${label} ${swatch}`}
            aria-pressed={value.toUpperCase() === swatch.toUpperCase()}
            className="h-8 w-8 rounded-full border border-app-line-strong aria-pressed:ring-2 aria-pressed:ring-app-ink aria-pressed:ring-offset-1"
            style={{ background: swatch }}
          />
        ))}
        <button type="button" onClick={() => onChange("")} aria-pressed={!value} className="min-h-[36px] rounded-full border border-app-line px-3 text-[12.5px] font-bold aria-pressed:bg-app-ink aria-pressed:text-white">
          {t("forms.colour.useStore")}
        </button>
      </div>
    </div>
  );
}

export function StyleControls({ style, layout, theme, kind, onStyle, onLayout }: { style: PopupStyle; layout: PopupLayout; theme: EditorTheme; kind: PopupKind; onStyle: (patch: Partial<PopupStyle>) => void; onLayout: (layout: PopupLayout) => void }) {
  const t = useT("marketing");
  const swatches = [...new Set(theme.swatches.map((s) => s.toUpperCase()))].slice(0, 6);
  const modal = layout === "modal" || layout === "fullscreen";
  return (
    <div className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("forms.style")} htmlFor="f-layout">
          <select id="f-layout" className={selectClass} value={layout} onChange={(e) => onLayout(e.target.value as PopupLayout)}>
            <option value="modal">{t("forms.layout.modal")}</option>
            <option value="fullscreen">{t("forms.layout.fullscreen")}</option>
            <option value="flyout">{t("forms.layout.flyout")}</option>
            <option value="bar">{t("forms.layout.bar")}</option>
          </select>
        </Field>
        <Field label={t("forms.size")} htmlFor="f-size">
          <select id="f-size" className={selectClass} value={style.size} onChange={(e) => onStyle({ size: e.target.value as PopupStyle["size"] })} disabled={layout === "fullscreen" || layout === "bar"}>
            <option value="small">{t("forms.size.small")}</option>
            <option value="medium">{t("forms.size.medium")}</option>
            <option value="large">{t("forms.size.large")}</option>
          </select>
        </Field>
      </div>
      <fieldset className="m-0 grid min-w-0 gap-3 border-0 p-0">
        <legend className="mb-1 p-0 text-[14px] font-extrabold">{t("forms.colours")}</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <ColourControl id="f-c-bg" label={t("forms.colour.background")} value={style.background} fallback={theme.paper} swatches={swatches} onChange={(background) => onStyle({ background })} />
          <ColourControl id="f-c-text" label={t("forms.colour.text")} value={style.text} fallback={theme.ink} swatches={swatches} onChange={(text) => onStyle({ text })} />
          <ColourControl id="f-c-btn" label={t("forms.colour.button")} value={style.button} fallback={theme.accent} swatches={swatches} onChange={(button) => onStyle({ button })} />
          <ColourControl id="f-c-btntext" label={t("forms.colour.buttonText")} value={style.buttonText} fallback={theme.accentText} swatches={swatches} onChange={(buttonText) => onStyle({ buttonText })} />
        </div>
      </fieldset>
      <details className="group rounded-[14px] border border-app-line px-4 py-1">
        <summary className="flex min-h-[44px] cursor-pointer list-none items-center gap-2 text-[14px] font-extrabold">
          <Icon name="settings" size={15} /> {t("forms.moreStyle")}
          <Icon name="chevron" size={14} className="ml-auto transition group-open:rotate-180" />
        </summary>
        <div className="grid gap-4 pb-4 pt-2 sm:grid-cols-2">
          <ColourControl id="f-c-accent" label={t("forms.colour.accent")} value={style.accent} fallback={style.button || theme.accent} swatches={swatches} onChange={(accent) => onStyle({ accent, version: 2 })} />
          <Field label={t("forms.corners")}>
            <Segmented
              options={(["square", "soft", "round"] as const).map((value) => ({ value, label: t(`forms.corner.${value}` as Key) }))}
              value={style.radius}
              onChange={(radius) => onStyle({ radius })}
            />
          </Field>
          <Field label={t("forms.font")} htmlFor="f-font">
            <select id="f-font" className={selectClass} value={style.font} onChange={(e) => onStyle({ font: e.target.value as PopupStyle["font"] })}>
              {(["theme", "modern", "elegant", "clean"] as const).map((font) => (
                <option key={font} value={font}>{t(`forms.font.${font}` as Key)}</option>
              ))}
            </select>
          </Field>
          <Field label={t("forms.align")}>
            <Segmented options={(["left", "center"] as const).map((value) => ({ value, label: t(`forms.align.${value}` as Key) }))} value={style.align} onChange={(align) => onStyle({ align, version: 2 })} />
          </Field>
          <Field label={t("forms.closeStyle")} htmlFor="f-close">
            <select id="f-close" className={selectClass} value={style.closeStyle} onChange={(e) => onStyle({ closeStyle: e.target.value as PopupStyle["closeStyle"] })}>
              {(["icon", "circle", "text"] as const).map((close) => (
                <option key={close} value={close}>{t(`forms.close.${close}` as Key)}</option>
              ))}
            </select>
          </Field>
          <Field label={t("forms.decor")} htmlFor="f-decor">
            <select id="f-decor" className={selectClass} value={style.decor} onChange={(e) => onStyle({ decor: e.target.value as PopupStyle["decor"], version: 2 })}>
              {POPUP_DECORS.map((decor) => (
                <option key={decor} value={decor}>{t(`forms.decor.${decor}` as Key)}</option>
              ))}
            </select>
          </Field>
          <Field label={t("forms.animation")} htmlFor="f-anim" hint={t("forms.animationHint")}>
            <select id="f-anim" className={selectClass} value={style.animation} onChange={(e) => onStyle({ animation: e.target.value as PopupStyle["animation"], version: 2 })}>
              {POPUP_ANIMATIONS.map((animation) => (
                <option key={animation} value={animation}>{t(`forms.animation.${animation}` as Key)}</option>
              ))}
            </select>
          </Field>
          {modal ? (
            <Field label={t("forms.overlay", { percent: style.overlay })} htmlFor="f-overlay">
              <input id="f-overlay" type="range" min={0} max={90} step={5} value={style.overlay} onChange={(e) => onStyle({ overlay: Number(e.target.value) })} className="h-[48px] w-full accent-[#16141F]" />
            </Field>
          ) : null}
          {kind === "signup" || style.bigBadge || style.badgeText ? (
            <div className="grid gap-2 sm:col-span-2">
              <label className="flex min-h-[40px] items-center gap-2.5 text-[14px]">
                <input type="checkbox" className={checkClass} checked={style.bigBadge} onChange={(e) => onStyle({ bigBadge: e.target.checked, version: 2 })} /> {t("forms.bigBadge")}
              </label>
              <Field label={t("forms.badgeText")} htmlFor="f-badge" hint={t("forms.badgeHint")}>
                <input id="f-badge" value={style.badgeText} onChange={(e) => onStyle({ badgeText: e.target.value })} className={inputClass} maxLength={24} placeholder="10% OFF" />
              </Field>
            </div>
          ) : null}
        </div>
      </details>
    </div>
  );
}

// ─── Picture ──────────────────────────────────────────────────────────────────

export function PictureControls({ design, style, layout, onDesign, onStyle }: { design: FormDesign; style: PopupStyle; layout: PopupLayout; onDesign: (patch: Partial<FormDesign>) => void; onStyle: (patch: Partial<PopupStyle>) => void }) {
  const t = useT("marketing");
  const hasImage = Boolean(design.imageUrl);
  const positions = (["left", "right", "top", "background", "none"] as const).filter((position) => layout !== "flyout" || (position !== "left" && position !== "right"));
  const setFocus = (event: React.MouseEvent<HTMLButtonElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    onStyle({ focusX: Math.round(((event.clientX - box.left) / box.width) * 100), focusY: Math.round(((event.clientY - box.top) / box.height) * 100), version: 2 });
  };
  return (
    <div className="grid gap-4">
      <Field label={t("forms.picture")} htmlFor="f-img-choose" hint={hasImage ? undefined : t("forms.pictureHint")}>
        <MediaPicker id="f-img" value={design.imageUrl} onChange={(url) => onDesign({ imageUrl: url })} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("forms.picturePlace")} htmlFor="f-imgpos">
          <select id="f-imgpos" className={selectClass} value={layout === "flyout" && (style.imagePosition === "left" || style.imagePosition === "right") ? "top" : style.imagePosition} onChange={(e) => onStyle({ imagePosition: e.target.value as PopupStyle["imagePosition"], ...(e.target.value === "right" ? { version: 2 } : {}) })} disabled={layout === "bar"}>
            {positions.map((position) => (
              <option key={position} value={position}>{t(`forms.picture.${position}` as Key)}</option>
            ))}
          </select>
        </Field>
        {!hasImage ? (
          <Field label={t("forms.art")} htmlFor="f-art" hint={t("forms.artHint")}>
            <select id="f-art" className={selectClass} value={style.art} onChange={(e) => onStyle({ art: e.target.value as PopupStyle["art"], version: 2 })} disabled={style.imagePosition === "none" || layout === "bar"}>
              {POPUP_ARTS.map((art) => (
                <option key={art || "none"} value={art}>{t(`forms.art.${art || "none"}` as Key)}</option>
              ))}
            </select>
          </Field>
        ) : (
          <Field label={t("forms.imageFit")}>
            <Segmented options={(["cover", "contain"] as const).map((value) => ({ value, label: t(`forms.imageFit.${value}` as Key) }))} value={style.imageFit} onChange={(imageFit) => onStyle({ imageFit, version: 2 })} />
          </Field>
        )}
      </div>
      {hasImage && style.imagePosition !== "none" ? (
        <div className="grid gap-4 sm:grid-cols-[180px_minmax(0,1fr)] sm:items-start">
          <div className="grid gap-1.5">
            <span className="text-[13.5px] font-bold">{t("forms.focus")}</span>
            <button type="button" onClick={setFocus} className="relative aspect-[4/3] w-full overflow-hidden rounded-[12px] border border-app-line bg-app-canvas" aria-label={t("forms.focusTap")}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={design.imageUrl} alt="" className="h-full w-full object-cover" style={{ objectPosition: `${style.focusX}% ${style.focusY}%` }} />
              <span aria-hidden className="absolute h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-white shadow-[0_0_0_2px_rgba(0,0,0,0.5)]" style={{ left: `${style.focusX}%`, top: `${style.focusY}%` }} />
            </button>
            <span className="text-[12px] text-app-ink-soft">{t("forms.focusHint")}</span>
          </div>
          <div className="grid gap-3">
            <Field label={t("forms.focusAcross", { percent: style.focusX })} htmlFor="f-fx">
              <input id="f-fx" type="range" min={0} max={100} value={style.focusX} onChange={(e) => onStyle({ focusX: Number(e.target.value), version: 2 })} className="h-[40px] w-full accent-[#16141F]" />
            </Field>
            <Field label={t("forms.focusDown", { percent: style.focusY })} htmlFor="f-fy">
              <input id="f-fy" type="range" min={0} max={100} value={style.focusY} onChange={(e) => onStyle({ focusY: Number(e.target.value), version: 2 })} className="h-[40px] w-full accent-[#16141F]" />
            </Field>
            <Field label={t("forms.imageAlt")} htmlFor="f-alt" hint={t("forms.imageAltHint")}>
              <input id="f-alt" value={design.imageAlt} onChange={(e) => onDesign({ imageAlt: e.target.value })} className={inputClass} maxLength={160} />
            </Field>
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ─── Reward ───────────────────────────────────────────────────────────────────

export function RewardEditor({ reward, discounts, onChange }: { reward: FormReward | null; discounts: DiscountOption[]; onChange: (reward: FormReward | null) => void }) {
  const t = useT("marketing");
  const mode = !reward ? "none" : reward.source;
  const set = (patch: Partial<FormReward>) => onChange({ ...(reward ?? NEW_REWARD), ...patch });
  return (
    <div className="grid gap-3 rounded-[16px] border border-app-line p-4">
      <p className="m-0 text-[15px] font-extrabold">{t("forms.rewardTitle")}</p>
      <div className="grid gap-1" role="radiogroup" aria-label={t("forms.rewardTitle")}>
        {(["none", "existing", "new"] as const).map((option) => (
          <label key={option} className="flex min-h-[40px] items-center gap-2.5 text-[14px]">
            <input
              type="radio"
              name="f-reward-mode"
              className={checkClass}
              checked={mode === option}
              onChange={() =>
                onChange(
                  option === "none"
                    ? null
                    : option === "existing"
                      ? { ...NEW_REWARD, source: "existing", unique: false, discountId: discounts[0]?.id ?? null, code: discounts[0]?.code ?? "" }
                      : { ...NEW_REWARD },
                )
              }
            />
            {t(`forms.reward.${option}` as Key)}
          </label>
        ))}
      </div>

      {reward?.source === "existing" ? (
        discounts.length ? (
          <Field label={t("forms.reward.pickCode")} htmlFor="f-rcode">
            <select id="f-rcode" className={selectClass} value={reward.discountId ?? ""} onChange={(e) => set({ discountId: e.target.value, code: discounts.find((d) => d.id === e.target.value)?.code ?? "" })}>
              {discounts.map((d) => (
                <option key={d.id} value={d.id}>{`${d.code} · ${d.label}`}</option>
              ))}
            </select>
          </Field>
        ) : (
          <p className="m-0 text-[13.5px] text-app-ink-soft">{t("forms.reward.noCodes")}</p>
        )
      ) : null}

      {reward?.source === "new" ? (
        <div className="grid gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t("forms.kind")} htmlFor="f-rtype">
              <select id="f-rtype" className={selectClass} value={reward.type} onChange={(e) => set({ type: e.target.value as FormReward["type"], ...(e.target.value === "free_shipping" ? { value: 0 } : reward.value > 0 ? {} : { value: 10 }) })}>
                <option value="percentage">{t("forms.percentOff")}</option>
                <option value="fixed_amount">{t("forms.nairaOff")}</option>
                <option value="free_shipping">{t("forms.freeDeliveryReward")}</option>
              </select>
            </Field>
            {reward.type !== "free_shipping" ? (
              <Field label={reward.type === "percentage" ? t("forms.percent") : t("forms.naira")} htmlFor="f-rvalue">
                <input id="f-rvalue" type="number" inputMode="numeric" min={1} max={reward.type === "percentage" ? 100 : undefined} value={reward.value || ""} onChange={(e) => set({ value: Number(e.target.value) })} className={inputClass} />
              </Field>
            ) : null}
            <Field label={t("forms.reward.minOrder")} htmlFor="f-rmin">
              <input id="f-rmin" type="number" inputMode="numeric" min={0} value={reward.minOrder || ""} onChange={(e) => set({ minOrder: Math.max(0, Number(e.target.value) || 0) })} className={inputClass} />
            </Field>
            <Field label={t("forms.reward.endsAfter")} htmlFor="f-rdays">
              <input id="f-rdays" type="number" inputMode="numeric" min={0} max={365} value={reward.days || ""} onChange={(e) => set({ days: Math.min(365, Math.max(0, Math.round(Number(e.target.value) || 0))) })} className={inputClass} />
            </Field>
          </div>
          <label className="flex min-h-[40px] items-start gap-2.5 text-[14px]">
            <input type="checkbox" className={`${checkClass} mt-0.5`} checked={reward.unique} onChange={(e) => set({ unique: e.target.checked })} />
            <span>
              <strong className="block">{t("forms.reward.uniqueEach")}</strong>
              <span className="text-[12.5px] text-app-ink-soft">{reward.unique ? t("forms.reward.uniqueHint") : t("forms.reward.sharedHint")}</span>
            </span>
          </label>
          {reward.unique ? (
            <Field label={t("forms.reward.prefix")} htmlFor="f-rprefix">
              <input id="f-rprefix" value={reward.prefix} onChange={(e) => set({ prefix: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12) })} className={inputClass} placeholder="WELCOME" />
            </Field>
          ) : (
            <Field label={t("forms.reward.sharedCode")} htmlFor="f-rshared">
              <input id="f-rshared" value={reward.code} onChange={(e) => set({ code: e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 40) })} className={inputClass} placeholder="WELCOME10" />
            </Field>
          )}
        </div>
      ) : null}

      {reward ? (
        <label className="flex min-h-[40px] items-start gap-2.5 text-[14px]">
          <input type="checkbox" className={`${checkClass} mt-0.5`} checked={reward.mystery === true} onChange={(e) => set({ mystery: e.target.checked ? true : undefined })} />
          <span>
            <strong className="block">{t("forms.reward.mystery")}</strong>
            <span className="text-[12.5px] text-app-ink-soft">{t("forms.reward.mysteryHint")}</span>
          </span>
        </label>
      ) : null}

      {reward ? <p className="m-0 text-[12.5px] text-app-ink-soft">{t("forms.reward.emailNote", { token: "{{discount_code}}" })}</p> : null}
    </div>
  );
}

// ─── Game ─────────────────────────────────────────────────────────────────────

export function GameControls({ config, prizes, onConfig }: { config: PopupConfig; prizes: PopupPrizes; onConfig: (patch: Partial<PopupConfig>) => void }) {
  const t = useT("marketing");
  return (
    <div className="grid gap-4 rounded-[16px] border border-app-line p-4">
      <p className="m-0 text-[15px] font-extrabold">{t("forms.game.title")}</p>
      <Field label={t("forms.game.which")}>
        <Segmented options={(["wheel", "scratch", "box"] as const).map((value) => ({ value, label: t(`forms.game.${value}` as Key) }))} value={config.game} onChange={(game) => onConfig({ game })} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("forms.game.collect")} htmlFor="f-gcollect">
          <select id="f-gcollect" className={selectClass} value={config.collect} onChange={(e) => onConfig({ collect: e.target.value as PopupConfig["collect"] })}>
            {(["either", "email", "whatsapp"] as const).map((collect) => (
              <option key={collect} value={collect}>{t(`forms.game.collect.${collect}` as Key)}</option>
            ))}
          </select>
        </Field>
        <Field label={t("forms.game.every")} htmlFor="f-gdays" hint={t("forms.game.everyHint")}>
          <input id="f-gdays" type="number" inputMode="numeric" min={1} max={365} value={config.playEveryDays} onChange={(e) => onConfig({ playEveryDays: Math.min(365, Math.max(1, Math.round(Number(e.target.value) || 1))) })} className={inputClass} />
        </Field>
      </div>
      <div className="grid gap-2 rounded-[14px] bg-app-canvas p-3">
        <p className="m-0 text-[13.5px] font-bold">{t("forms.game.prizes")}</p>
        <ul className="m-0 grid list-none gap-1 p-0 text-[13.5px]">
          {prizes.slices.map((slice, index) => (
            <li key={slice.id} className="flex justify-between gap-3">
              <span>{slice.label}</span>
              <span className="tabular-nums text-app-ink-soft">{prizes.odds[index] ?? 0}%</span>
            </li>
          ))}
        </ul>
        <p className="m-0 text-[12.5px] text-app-ink-soft">{t("forms.game.prizesHint", { days: prizes.codeDays })}</p>
        <a href="/home/marketing/rewards" className="inline-flex min-h-[40px] w-fit items-center gap-1.5 text-[13.5px] font-bold underline underline-offset-4">
          {t("forms.game.editPrizes")} <Icon name="arrow" size={14} />
        </a>
      </div>
    </div>
  );
}

// ─── Free download ────────────────────────────────────────────────────────────

export function LeadMagnetControls({ value, onChange }: { value: LeadMagnet | null; onChange: (value: LeadMagnet | null) => void }) {
  const t = useT("marketing");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [link, setLink] = useState("");
  const current: LeadMagnet = value ?? { url: "", name: "", emailIt: true };
  const set = (patch: Partial<LeadMagnet>) => onChange({ ...current, ...patch });

  const upload = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/pdf,image/jpeg,image/png,image/webp";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      setBusy(true);
      setError("");
      try {
        const uploaded = await uploadDownload(file);
        set({ url: uploaded.url, name: current.name || downloadNameFromFile(uploaded.name) });
      } catch (err) {
        setError(err instanceof Error && err.message ? err.message : t("forms.lead.uploadFailed"));
      } finally {
        setBusy(false);
      }
    };
    input.click();
  };

  const useLink = () => {
    const safe = safeDownloadUrl(link);
    if (!safe) {
      setError(t("forms.lead.badLink"));
      return;
    }
    setError("");
    set({ url: safe });
    setLink("");
  };

  return (
    <div className="grid gap-4 rounded-[16px] border border-app-line p-4">
      <p className="m-0 text-[15px] font-extrabold">{t("forms.lead.title")}</p>
      <p className="m-0 text-[13px] text-app-ink-soft">{t("forms.lead.sub")}</p>
      {current.url ? (
        <div className="flex flex-wrap items-center gap-2 rounded-[14px] bg-app-canvas px-3 py-2.5">
          <Icon name="file" size={16} />
          <a href={current.url} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 truncate text-[13.5px] font-bold underline underline-offset-2">{current.url.split("/").pop()}</a>
          <button type="button" className="min-h-[36px] px-2 text-[13px] font-semibold text-app-ink-soft hover:text-app-danger" onClick={() => onChange(null)}>{t("forms.lead.remove")}</button>
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={upload} disabled={busy} className="inline-flex min-h-[42px] items-center gap-1.5 rounded-full border border-app-line bg-white px-4 text-[13.5px] font-bold hover:border-app-line-strong disabled:opacity-60">
          <Icon name="upload" size={14} /> {busy ? t("forms.lead.uploading") : current.url ? t("forms.lead.replace") : t("forms.lead.upload")}
        </button>
        <span className="text-[12.5px] text-app-ink-soft">{t("forms.lead.fileTypes")}</span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input type="url" inputMode="url" aria-label={t("forms.lead.linkLabel")} placeholder={t("forms.lead.linkPh")} value={link} onChange={(e) => setLink(e.target.value)} className={`${inputClass} min-w-0 flex-1 basis-[220px]`} />
        <button type="button" onClick={useLink} disabled={!link.trim()} className="inline-flex min-h-[42px] items-center rounded-full border border-app-line bg-white px-4 text-[13.5px] font-bold disabled:opacity-50">{t("forms.lead.useLink")}</button>
      </div>
      {error ? <p className="m-0 text-[13px] font-semibold text-app-danger" role="alert">{error}</p> : null}
      <Field label={t("forms.lead.name")} htmlFor="f-lname" hint={t("forms.lead.nameHint")}>
        <input id="f-lname" value={current.name} onChange={(e) => set({ name: e.target.value })} className={inputClass} maxLength={80} placeholder={t("forms.lead.namePh")} />
      </Field>
      <label className="flex min-h-[40px] items-center gap-2.5 text-[14px]">
        <input type="checkbox" className={checkClass} checked={current.emailIt} onChange={(e) => set({ emailIt: e.target.checked })} /> {t("forms.lead.emailIt")}
      </label>
    </div>
  );
}

// ─── Button, countdown, free delivery ─────────────────────────────────────────

export function CtaControls({ design, kind, config, storeFreeDeliveryOver, onDesign, onConfig }: { design: FormDesign; kind: PopupKind; config: PopupConfig; storeFreeDeliveryOver: number | null; onDesign: (patch: Partial<FormDesign>) => void; onConfig: (patch: Partial<PopupConfig>) => void }) {
  const t = useT("marketing");
  return (
    <div className="grid gap-4 rounded-[16px] border border-app-line p-4">
      <p className="m-0 text-[15px] font-extrabold">{t("forms.cta.title")}</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("forms.cta.label")} htmlFor="f-ctalabel">
          <input id="f-ctalabel" value={design.ctaLabel} onChange={(e) => onDesign({ ctaLabel: e.target.value })} className={inputClass} maxLength={40} />
        </Field>
        <Field label={t("forms.cta.target")} htmlFor="f-ctatarget">
          <select id="f-ctatarget" className={selectClass} value={design.ctaTarget} onChange={(e) => onDesign({ ctaTarget: e.target.value as CtaTarget })}>
            {CTA_TARGETS.map((target) => (
              <option key={target} value={target}>{t(`forms.cta.target.${target}` as Key)}</option>
            ))}
          </select>
        </Field>
      </div>
      {design.ctaTarget === "link" ? (
        <Field label={t("forms.cta.url")} htmlFor="f-ctaurl" hint={t("forms.cta.urlHint")}>
          <input id="f-ctaurl" value={design.ctaUrl} onChange={(e) => onDesign({ ctaUrl: e.target.value })} className={inputClass} maxLength={1000} placeholder="/collections/new" />
        </Field>
      ) : null}
      {kind === "countdown" ? (
        <Field label={t("forms.countdown.ends")} htmlFor="f-ends" hint={t("forms.countdown.endsHint")}>
          <input
            id="f-ends"
            type="datetime-local"
            value={toLocalInput(config.endsAt)}
            onChange={(e) => {
              const time = e.target.value ? new Date(e.target.value) : null;
              onConfig({ endsAt: time && !Number.isNaN(time.getTime()) ? time.toISOString() : null });
            }}
            className={inputClass}
          />
        </Field>
      ) : null}
      {kind === "free_delivery" ? (
        <Field
          label={t("forms.freeDelivery.amount")}
          htmlFor="f-fdo"
          hint={storeFreeDeliveryOver ? t("forms.freeDelivery.fromStore", { amount: `₦${storeFreeDeliveryOver.toLocaleString("en-NG")}` }) : t("forms.freeDelivery.noStore")}
        >
          <input id="f-fdo" type="number" inputMode="numeric" min={1} value={config.freeDeliveryOver || ""} onChange={(e) => onConfig({ freeDeliveryOver: Math.max(0, Math.round(Number(e.target.value) || 0)) })} className={inputClass} />
        </Field>
      ) : null}
      {kind === "free_delivery" ? <p className="m-0 text-[12.5px] text-app-ink-soft">{t("forms.freeDelivery.wordsHint", { token: "{amount}" })}</p> : null}
    </div>
  );
}
