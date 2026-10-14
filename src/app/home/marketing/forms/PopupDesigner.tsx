"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Segmented } from "@/components/app-ui";
import { Field, checkClass, inputClass, selectClass } from "@/components/growth/kit";
import { PopupView, type RenderablePopup } from "@/components/storefront/marketing/PopupView";
import type { SignupColors } from "@/components/storefront/marketing/SignupForm";
import { useT } from "@/components/i18n/I18nProvider";
import {
  POPUP_TEMPLATES,
  rewardLabel,
  type FormReward,
  type PopupLayout,
  type PopupRewardSummary,
  type PopupStyle,
  type PopupTemplateId,
} from "@/lib/marketing/forms";
import type { MessageKey } from "@shared/i18n/catalog";

// The pop-up look editor: a gallery of templates (drawn by the real storefront renderer, scaled down), a few
// simple style controls, a live preview at computer and phone width, and the sign-up reward settings.

type Key = MessageKey<"marketing">;

/** The store's own colours and heading font, for presets and previews. */
export interface EditorTheme extends SignupColors {
  swatches: string[];
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
    return option ? { label: option.label, type: option.type, value: option.value, minOrder: option.minOrder } : null;
  }
  if (!(reward.value > 0)) return null;
  return { label: rewardLabel(reward), type: reward.type, value: reward.value, minOrder: reward.minOrder };
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

function PreviewPopup({ popup, theme, state }: { popup: RenderablePopup; theme: EditorTheme; state: "form" | "success" }) {
  return <PopupView popup={popup} storeSlug="preview" colors={theme} result={null} onResult={() => undefined} onClose={() => undefined} preview={state} />;
}

// ─── Template gallery ─────────────────────────────────────────────────────────

export function TemplateGallery({ popup, theme, value, onPick }: { popup: RenderablePopup; theme: EditorTheme; value: PopupTemplateId; onPick: (id: PopupTemplateId) => void }) {
  const t = useT("marketing");
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4" role="group" aria-label={t("forms.pickLook")}>
      {POPUP_TEMPLATES.map((template) => {
        const on = template.id === value;
        const sample: RenderablePopup = { ...popup, layout: template.layout, design: { ...popup.design, style: { ...template.style, badgeText: popup.design.style.badgeText } } };
        return (
          <button
            key={template.id}
            type="button"
            aria-pressed={on}
            onClick={() => onPick(template.id)}
            className={`grid gap-1.5 rounded-[16px] border-2 bg-white p-1.5 text-left transition focus-visible:outline focus-visible:outline-2 ${on ? "border-app-ink" : "border-transparent hover:border-app-line-strong"}`}
          >
            <div inert aria-hidden className="pointer-events-none">
              <Stage width={640} height={460} theme={theme} fixedScale={0.22}>
                <PreviewPopup popup={sample} theme={theme} state="form" />
              </Stage>
            </div>
            <span className="px-1 pb-0.5 text-[13px] font-bold">{t(`forms.tpl.${template.id}` as Key)}</span>
          </button>
        );
      })}
    </div>
  );
}

// ─── Live preview ─────────────────────────────────────────────────────────────

export function LivePreview({ popup, theme }: { popup: RenderablePopup; theme: EditorTheme }) {
  const t = useT("marketing");
  const [device, setDevice] = useState<"computer" | "phone">("computer");
  const [state, setState] = useState<"form" | "success">("form");
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
        <Segmented
          className="min-w-[220px] flex-1"
          options={[
            { value: "form", label: t("forms.preview.before") },
            { value: "success", label: t("forms.preview.after") },
          ]}
          value={state}
          onChange={setState}
        />
      </div>
      {device === "computer" ? (
        <Stage width={1024} height={680} theme={theme}>
          <PreviewPopup popup={popup} theme={theme} state={state} />
        </Stage>
      ) : (
        <div className="mx-auto w-full max-w-[300px]">
          <Stage width={375} height={720} theme={theme}>
            <PreviewPopup popup={popup} theme={theme} state={state} />
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

export function StyleControls({ style, layout, theme, onStyle, onLayout }: { style: PopupStyle; layout: PopupLayout; theme: EditorTheme; onStyle: (patch: Partial<PopupStyle>) => void; onLayout: (layout: PopupLayout) => void }) {
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
      <div className="grid gap-4 sm:grid-cols-2">
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
        <Field label={t("forms.picturePlace")} htmlFor="f-imgpos">
          <select id="f-imgpos" className={selectClass} value={style.imagePosition} onChange={(e) => onStyle({ imagePosition: e.target.value as PopupStyle["imagePosition"] })} disabled={layout === "bar"}>
            {(["left", "top", "background", "none"] as const).map((position) => (
              <option key={position} value={position}>{t(`forms.picture.${position}` as Key)}</option>
            ))}
          </select>
        </Field>
        <Field label={t("forms.closeStyle")} htmlFor="f-close">
          <select id="f-close" className={selectClass} value={style.closeStyle} onChange={(e) => onStyle({ closeStyle: e.target.value as PopupStyle["closeStyle"] })}>
            {(["icon", "circle", "text"] as const).map((close) => (
              <option key={close} value={close}>{t(`forms.close.${close}` as Key)}</option>
            ))}
          </select>
        </Field>
        {modal ? (
          <Field label={t("forms.overlay", { percent: style.overlay })} htmlFor="f-overlay">
            <input id="f-overlay" type="range" min={0} max={90} step={5} value={style.overlay} onChange={(e) => onStyle({ overlay: Number(e.target.value) })} className="h-[48px] w-full accent-[#16141F]" />
          </Field>
        ) : null}
        <Field label={t("forms.badgeText")} htmlFor="f-badge" hint={t("forms.badgeHint")}>
          <input id="f-badge" value={style.badgeText} onChange={(e) => onStyle({ badgeText: e.target.value })} className={inputClass} maxLength={24} placeholder="10% OFF" />
        </Field>
      </div>
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
              <select id="f-rtype" className={selectClass} value={reward.type} onChange={(e) => set({ type: e.target.value as "percentage" | "fixed_amount" })}>
                <option value="percentage">{t("forms.percentOff")}</option>
                <option value="fixed_amount">{t("forms.nairaOff")}</option>
              </select>
            </Field>
            <Field label={reward.type === "percentage" ? t("forms.percent") : t("forms.naira")} htmlFor="f-rvalue">
              <input id="f-rvalue" type="number" inputMode="numeric" min={1} max={reward.type === "percentage" ? 100 : undefined} value={reward.value || ""} onChange={(e) => set({ value: Number(e.target.value) })} className={inputClass} />
            </Field>
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

      {reward ? <p className="m-0 text-[12.5px] text-app-ink-soft">{t("forms.reward.emailNote", { token: "{{discount_code}}" })}</p> : null}
    </div>
  );
}
