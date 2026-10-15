"use client";

import { confirmDialog } from "@/components/ui/dialogs";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, EmptyState, ListCard, ListRow, Pill } from "@/components/app-kit";
import { Notice, PillButton, Segmented, Toggle } from "@/components/app-ui";
import { Icon } from "@/components/ui/Icon";
import { Modal } from "@/components/growth/Modal";
import { MediaPicker } from "@/components/media/MediaPicker";
import { Field, buttonClass, checkClass, inputClass, selectClass, textareaClass } from "@/components/growth/kit";
import { DEFAULT_POPUP_STYLE, templatesForKind, type FormDesign, type FormField, type PopupConfig, type PopupKind, type PopupStyle, type PopupTemplate } from "@/lib/marketing/forms";
import { collectsSignup, hasCta } from "@/lib/marketing/popup-kinds";
import type { RenderablePopup } from "@/components/storefront/marketing/PopupView";
import {
  CtaControls,
  GameControls,
  KindPicker,
  LeadMagnetControls,
  LivePreview,
  NEW_REWARD,
  PictureControls,
  RewardEditor,
  StyleControls,
  TemplateGallery,
  rewardSummaryFor,
  templateDesign,
  templateReward,
  type DiscountOption,
  type EditorExtras,
  type EditorTheme,
} from "./PopupDesigner";
import { api, errorText } from "../_kit/client";
import { useLocale, useT } from "@/components/i18n/I18nProvider";
import { formatNumber, type TFunction } from "@shared/i18n";
import type { MessageKey } from "@shared/i18n/catalog";

type MarketingT = TFunction<MessageKey<"marketing">>;

export interface ManagedForm {
  id: string;
  name: string;
  type: string;
  isPopup: boolean;
  active: boolean;
  createdAt: string;
  fields: FormField[];
  design: FormDesign;
  config: PopupConfig;
  views: number;
  signups: number;
  /** Times this form's codes were used at checkout (null: it doesn't hand out its own codes). */
  codesUsed: number | null;
  /** "10% off", for the list card. */
  rewardText: string | null;
}

const TRIGGER_TEXT: Record<PopupConfig["trigger"], (c: PopupConfig, t: MarketingT) => string> = {
  immediate: (_, t) => t("forms.trigger.immediate"),
  delay: (c, t) => t("forms.trigger.delay", { seconds: c.delaySeconds }),
  exit_intent: (_, t) => t("forms.trigger.exit"),
  scroll: (c, t) => t("forms.trigger.scroll", { percent: c.scrollPercent }),
};
const LAYOUT_TEXT: Record<PopupConfig["layout"], MessageKey<"marketing">> = { modal: "forms.layout.modal", flyout: "forms.layout.flyout", bar: "forms.layout.bar", fullscreen: "forms.layout.fullscreen" };
const KIND_ICON: Record<PopupKind, "sparkle" | "star" | "download" | "megaphone" | "clock" | "truck"> = { signup: "sparkle", game: "star", lead_magnet: "download", announcement: "megaphone", countdown: "clock", free_delivery: "truck" };

const DEFAULT_CONFIG: PopupConfig = {
  layout: "modal",
  trigger: "delay",
  delaySeconds: 8,
  scrollPercent: 50,
  pages: "all",
  frequency: "once",
  frequencyDays: 7,
  devices: ["mobile", "desktop"],
  reward: null,
  afterSubmit: "message",
  redirectUrl: "",
  kind: "signup",
  game: "wheel",
  collect: "either",
  playEveryDays: 7,
  onlyWithCart: false,
  leadMagnet: null,
  endsAt: null,
  freeDeliveryOver: 0,
};
const DEFAULT_DESIGN: FormDesign = {
  headline: "Get 10% off your first order",
  body: "Join our list for new arrivals and offers.",
  buttonText: "Sign me up",
  successMessage: "You're in! Here's your code.",
  imageUrl: "",
  consentText: "I agree to get emails about offers and new arrivals. I can unsubscribe at any time.",
  askSmsConsent: false,
  style: DEFAULT_POPUP_STYLE,
  eyebrow: "",
  imageAlt: "",
  ctaLabel: "Shop now",
  ctaTarget: "shop",
  ctaUrl: "",
};

interface Draft {
  name: string;
  isPopup: boolean;
  active: boolean;
  design: FormDesign;
  config: PopupConfig;
  askName: boolean;
  askPhone: boolean;
  askBirthday: boolean;
  extra: FormField[];
}

function toDraft(form: ManagedForm | null): Draft {
  if (!form) {
    return { name: "Welcome pop-up", isPopup: true, active: true, design: DEFAULT_DESIGN, config: { ...DEFAULT_CONFIG, reward: { ...NEW_REWARD } }, askName: true, askPhone: false, askBirthday: false, extra: [] };
  }
  const has = (type: string, key?: string) => form.fields.some((f) => f.type === type && (!key || f.key === key));
  return {
    name: form.name,
    isPopup: form.isPopup,
    active: form.active,
    design: form.design,
    config: form.config,
    askName: has("text", "name"),
    askPhone: has("phone"),
    askBirthday: has("birthday"),
    extra: form.fields.filter((f) => f.type !== "email" && !(f.type === "text" && f.key === "name") && f.type !== "phone" && f.type !== "birthday"),
  };
}

function fieldsFor(draft: Draft): FormField[] {
  return [
    { key: "email", type: "email", label: "Email", required: true },
    ...(draft.askName ? [{ key: "name", type: "text" as const, label: "First name", required: false }] : []),
    ...(draft.askPhone ? [{ key: "phone", type: "phone" as const, label: "WhatsApp number", required: false }] : []),
    ...(draft.askBirthday ? [{ key: "birthday", type: "birthday" as const, label: "Birthday", required: false }] : []),
    ...draft.extra.filter((f) => f.label.trim()),
  ];
}

/** A template on the draft: its look and layout always; its words, reward and timing only while the seller hasn't written their own. */
function applyTemplate(draft: Draft, template: PopupTemplate, withWords: boolean): Draft {
  const reward = templateReward(template, draft.config.reward);
  const { game, ...settings } = template.config ?? {};
  return {
    ...draft,
    config: {
      ...draft.config,
      kind: template.kind,
      layout: template.layout,
      ...(game ? { game } : {}),
      ...(withWords ? { onlyWithCart: false, ...settings } : {}),
      ...(withWords && reward !== undefined ? { reward } : {}),
      ...(withWords && template.kind === "signup" && reward === undefined && !draft.config.reward ? { reward: { ...NEW_REWARD } } : {}),
    },
    design: { ...draft.design, ...(withWords ? templateDesign(template) : {}), style: { ...template.style, badgeText: withWords ? (template.words.badgeText ?? "") : draft.design.style.badgeText } },
  };
}

function previewPopup(draft: Draft, discounts: DiscountOption[], extras: EditorExtras): RenderablePopup {
  const kind = draft.isPopup ? draft.config.kind : "signup";
  return {
    id: "preview",
    fields: fieldsFor(draft),
    // Sign-up pages don't use the pop-up look: preview them plainly.
    design: draft.isPopup ? draft.design : { ...draft.design, style: { ...DEFAULT_POPUP_STYLE, overlay: 0 } },
    layout: draft.isPopup ? draft.config.layout : "modal",
    reward: collectsSignup(kind) && kind === "signup" ? rewardSummaryFor(draft.config.reward, discounts) : null,
    afterSubmit: "message",
    redirectUrl: "",
    kind,
    game: { game: draft.config.game, collect: draft.config.collect, playEveryDays: draft.config.playEveryDays, prizes: extras.prizes },
    leadMagnetName: draft.config.leadMagnet?.name || null,
    endsAt: draft.config.endsAt,
    freeDeliveryOver: draft.config.freeDeliveryOver || extras.storeFreeDeliveryOver || 20000,
  };
}

type Step = "goal" | "template" | "edit";

function FormEditor({ editing, startAsPopup, theme, discounts, extras, onClose, onSaved }: { editing: ManagedForm | null; startAsPopup: boolean; theme: EditorTheme; discounts: DiscountOption[]; extras: EditorExtras; onClose: () => void; onSaved: () => void }) {
  const t = useT("marketing", "common");
  const [draft, setDraft] = useState<Draft>(() => ({ ...toDraft(editing), ...(editing ? {} : { isPopup: startAsPopup, name: startAsPopup ? t("forms.defaultPopupName") : t("forms.defaultPageName") }) }));
  const [step, setStep] = useState<Step>(editing || !startAsPopup ? "edit" : "goal");
  // Their own words are never replaced by a template's (an existing pop-up's words count as their own).
  const [wordsTouched, setWordsTouched] = useState(Boolean(editing));
  const [showGallery, setShowGallery] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const design = (patch: Partial<FormDesign>) => setDraft((d) => ({ ...d, design: { ...d.design, ...patch } }));
  const words = (patch: Partial<FormDesign>) => {
    setWordsTouched(true);
    design(patch);
  };
  const config = (patch: Partial<PopupConfig>) => setDraft((d) => ({ ...d, config: { ...d.config, ...patch } }));
  const look = (patch: Partial<PopupStyle>) => setDraft((d) => ({ ...d, design: { ...d.design, style: { ...d.design.style, ...patch } } }));
  const pickTemplate = (template: PopupTemplate) => {
    setDraft((d) => applyTemplate(d, template, !wordsTouched));
    if (step !== "edit") setStep("edit");
    setShowGallery(false);
  };
  const kind: PopupKind = draft.isPopup ? draft.config.kind : "signup";
  const popup = previewPopup(draft, discounts, extras);
  const asksDetails = collectsSignup(kind);
  const title = editing ? t("seg.editName", { name: editing.name }) : draft.isPopup ? t("forms.newPopup") : t("forms.newPage");

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (draft.isPopup && kind === "lead_magnet" && !draft.config.leadMagnet?.url) return setError(t("forms.lead.missing"));
    if (draft.isPopup && kind === "countdown" && !draft.config.endsAt) return setError(t("forms.countdown.missing"));
    if (draft.isPopup && kind === "free_delivery" && !(draft.config.freeDeliveryOver > 0)) return setError(t("forms.freeDelivery.missing"));
    setSaving(true);
    try {
      const body = {
        name: draft.name,
        type: editing && ["newsletter", "lead", "waitlist", "popup"].includes(editing.type) ? editing.type : kind === "lead_magnet" ? "lead" : "newsletter",
        isPopup: draft.isPopup,
        active: draft.active,
        fields: fieldsFor(draft),
        design: { ...draft.design, ctaUrl: draft.design.ctaTarget === "link" ? draft.design.ctaUrl : "" },
        popupConfig: {
          ...draft.config,
          kind,
          redirectUrl: draft.config.redirectUrl || undefined,
          reward: kind === "signup" ? draft.config.reward : null,
          leadMagnet: kind === "lead_magnet" && draft.config.leadMagnet ? { ...draft.config.leadMagnet, name: draft.config.leadMagnet.name.trim() } : null,
          endsAt: kind === "countdown" ? draft.config.endsAt : null,
          onlyWithCart: draft.config.onlyWithCart,
        },
      };
      if (editing) await api(`/api/app/marketing/forms/${editing.id}`, "PATCH", body);
      else await api("/api/app/marketing/forms", "POST", body);
      onSaved();
    } catch (saveError) {
      setError(errorText(saveError));
    } finally {
      setSaving(false);
    }
  }

  if (step === "goal") {
    return (
      <Modal title={title} onClose={onClose} wide="xl">
        <div className="grid gap-4">
          <div>
            <p className="m-0 text-[17px] font-extrabold">{t("forms.kind.question")}</p>
            <p className="m-0 mt-1 text-[13.5px] text-app-ink-soft">{t("forms.kind.questionSub")}</p>
          </div>
          <KindPicker
            value={null}
            onPick={(next) => {
              config({ kind: next, reward: next === "signup" ? draft.config.reward ?? { ...NEW_REWARD } : null });
              setStep("template");
            }}
          />
        </div>
      </Modal>
    );
  }

  if (step === "template") {
    return (
      <Modal title={title} onClose={onClose} wide="xl">
        <div className="grid gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={() => setStep("goal")} className="inline-flex min-h-[40px] items-center gap-1.5 rounded-full border border-app-line px-3.5 text-[13.5px] font-bold hover:border-app-line-strong">
              <Icon name="chevron" size={14} className="rotate-90" /> {t("forms.back")}
            </button>
            <div className="min-w-0 flex-1">
              <p className="m-0 text-[17px] font-extrabold">{t("forms.pickTemplate", { kind: t(`forms.kind.${kind}` as MessageKey<"marketing">) })}</p>
              <p className="m-0 mt-0.5 text-[13.5px] text-app-ink-soft">{t("forms.pickLook")}</p>
            </div>
          </div>
          <TemplateGallery kind={kind} base={popup} theme={theme} discounts={discounts} value={null} onPick={pickTemplate} />
        </div>
      </Modal>
    );
  }

  return (
    <Modal title={title} onClose={onClose} wide="xl">
      <form onSubmit={(event) => void save(event)} className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,440px)] lg:items-start">
        <div className="grid min-w-0 gap-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("forms.nameOnlyYou")} htmlFor="f-name"><input id="f-name" required value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className={inputClass} maxLength={120} /></Field>
            {!editing || !draft.isPopup ? (
              <Field label={t("forms.showsAs")}>
                <Segmented options={[{ value: "popup", label: t("forms.popupOnStore") }, { value: "page", label: t("forms.signupPage") }]} value={draft.isPopup ? "popup" : "page"} onChange={(v) => setDraft({ ...draft, isPopup: v === "popup" })} />
              </Field>
            ) : (
              <Field label={t("forms.kind.label")} htmlFor="f-kind">
                <select
                  id="f-kind"
                  className={selectClass}
                  value={kind}
                  onChange={(e) => {
                    const next = e.target.value as PopupKind;
                    const first = templatesForKind(next)[0];
                    setDraft((d) => (first ? applyTemplate({ ...d, config: { ...d.config, kind: next } }, first, !wordsTouched) : { ...d, config: { ...d.config, kind: next } }));
                    setShowGallery(true);
                  }}
                >
                  {(["signup", "game", "lead_magnet", "announcement", "countdown", "free_delivery"] as const).map((option) => (
                    <option key={option} value={option}>{t(`forms.kind.${option}` as MessageKey<"marketing">)}</option>
                  ))}
                </select>
              </Field>
            )}
          </div>

          {draft.isPopup ? (
            <fieldset className="m-0 grid min-w-0 gap-4 border-0 p-0">
              <legend className="mb-1 flex w-full flex-wrap items-center gap-2 p-0 text-[16px] font-extrabold">
                <span className="flex-1">{t("forms.look")}</span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-app-canvas px-3 py-1 text-[12.5px] font-bold"><Icon name={KIND_ICON[kind]} size={13} /> {t(`forms.tpl.${draft.design.style.template}` as MessageKey<"marketing">)}</span>
              </legend>
              <button type="button" aria-expanded={showGallery} onClick={() => setShowGallery((open) => !open)} className="inline-flex min-h-[42px] w-fit items-center gap-2 rounded-full border border-app-line px-4 text-[13.5px] font-bold hover:border-app-line-strong">
                <Icon name="grid" size={14} /> {showGallery ? t("forms.hideTemplates") : t("forms.changeTemplate")}
              </button>
              {showGallery ? <TemplateGallery kind={kind} base={popup} theme={theme} discounts={discounts} value={draft.design.style.template} onPick={pickTemplate} /> : null}
              {wordsTouched && showGallery ? <p className="m-0 text-[12.5px] text-app-ink-soft">{t("forms.keepsWords")}</p> : null}
              <StyleControls style={draft.design.style} layout={draft.config.layout} theme={theme} kind={kind} onStyle={look} onLayout={(layout) => config({ layout })} />
            </fieldset>
          ) : null}

          {draft.isPopup ? (
            <fieldset className="m-0 grid min-w-0 gap-4 border-0 p-0">
              <legend className="mb-2 p-0 text-[16px] font-extrabold">{t("forms.pictureTitle")}</legend>
              <PictureControls design={draft.design} style={draft.design.style} layout={draft.config.layout} onDesign={design} onStyle={look} />
            </fieldset>
          ) : null}

          <fieldset className="m-0 grid min-w-0 gap-4 border-0 p-0">
            <legend className="mb-2 p-0 text-[16px] font-extrabold">{t("forms.whatItSays")}</legend>
            {draft.isPopup ? (
              <Field label={t("forms.eyebrow")} htmlFor="f-eyebrow" hint={t("forms.eyebrowHint")}><input id="f-eyebrow" value={draft.design.eyebrow} onChange={(e) => words({ eyebrow: e.target.value })} className={inputClass} maxLength={40} /></Field>
            ) : null}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t("forms.headline")} htmlFor="f-head"><input id="f-head" value={draft.design.headline} onChange={(e) => words({ headline: e.target.value })} className={inputClass} maxLength={120} /></Field>
              {!hasCta(kind) ? <Field label={t("forms.button")} htmlFor="f-btn"><input id="f-btn" value={draft.design.buttonText} onChange={(e) => words({ buttonText: e.target.value })} className={inputClass} maxLength={40} /></Field> : null}
            </div>
            <Field label={t("forms.message")} htmlFor="f-body"><textarea id="f-body" rows={2} value={draft.design.body} onChange={(e) => words({ body: e.target.value })} className={textareaClass} maxLength={400} /></Field>
            {asksDetails ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={t("forms.afterSignup")} htmlFor="f-done"><input id="f-done" value={draft.design.successMessage} onChange={(e) => words({ successMessage: e.target.value })} className={inputClass} maxLength={300} /></Field>
              </div>
            ) : null}
            {!draft.isPopup ? <Field label={t("forms.picture")} htmlFor="f-img-choose"><MediaPicker id="f-img" value={draft.design.imageUrl} onChange={(url) => design({ imageUrl: url })} /></Field> : null}
            {asksDetails ? <Field label={t("forms.consent")} htmlFor="f-consent"><textarea id="f-consent" rows={2} value={draft.design.consentText} onChange={(e) => words({ consentText: e.target.value })} className={textareaClass} maxLength={400} /></Field> : null}
          </fieldset>

          {draft.isPopup && kind === "game" ? <GameControls config={draft.config} prizes={extras.prizes} onConfig={config} /> : null}
          {draft.isPopup && kind === "lead_magnet" ? <LeadMagnetControls value={draft.config.leadMagnet} onChange={(leadMagnet) => config({ leadMagnet })} /> : null}
          {draft.isPopup && hasCta(kind) ? <CtaControls design={draft.design} kind={kind} config={draft.config} storeFreeDeliveryOver={extras.storeFreeDeliveryOver} onDesign={words} onConfig={config} /> : null}

          {asksDetails ? (
            <fieldset className="m-0 grid min-w-0 gap-2 border-0 p-0">
              <legend className="mb-2 p-0 text-[16px] font-extrabold">{t("forms.whatItAsks")}</legend>
              <p className="m-0 text-[13.5px] text-app-ink-soft">{t("forms.emailAlways")}</p>
              <label className="flex min-h-[40px] items-center gap-2.5 text-[14px]"><input type="checkbox" className={checkClass} checked={draft.askName} onChange={(e) => setDraft({ ...draft, askName: e.target.checked })} /> {t("forms.firstName")}</label>
              <label className="flex min-h-[40px] items-center gap-2.5 text-[14px]"><input type="checkbox" className={checkClass} checked={draft.askPhone} onChange={(e) => setDraft({ ...draft, askPhone: e.target.checked })} /> {t("forms.whatsappNumber")}</label>
              {draft.askPhone ? (
                <label className="ml-7 flex min-h-[40px] items-center gap-2.5 text-[14px]"><input type="checkbox" className={checkClass} checked={draft.design.askSmsConsent} onChange={(e) => design({ askSmsConsent: e.target.checked })} /> {t("forms.askSmsConsent")}</label>
              ) : null}
              <label className="flex min-h-[40px] items-center gap-2.5 text-[14px]"><input type="checkbox" className={checkClass} checked={draft.askBirthday} onChange={(e) => setDraft({ ...draft, askBirthday: e.target.checked })} /> {t("forms.birthday")}</label>
            </fieldset>
          ) : null}

          {draft.isPopup ? (
            <fieldset className="m-0 grid min-w-0 gap-4 border-0 p-0">
              <legend className="mb-2 p-0 text-[16px] font-extrabold">{t("forms.whenWhere")}</legend>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={t("forms.showIt")} htmlFor="f-trigger">
                  <select id="f-trigger" className={selectClass} value={draft.config.trigger} onChange={(e) => config({ trigger: e.target.value as PopupConfig["trigger"] })}>
                    <option value="delay">{t("forms.afterSeconds")}</option>
                    <option value="scroll">{t("forms.afterScrolling")}</option>
                    <option value="exit_intent">{t("forms.exitIntent")}</option>
                    <option value="immediate">{t("forms.straightAway")}</option>
                  </select>
                </Field>
                {draft.config.trigger === "delay" ? (
                  <Field label={t("forms.secondsToWait")} htmlFor="f-delay"><input id="f-delay" type="number" min={0} max={600} value={draft.config.delaySeconds} onChange={(e) => config({ delaySeconds: Number(e.target.value) })} className={inputClass} /></Field>
                ) : null}
                {draft.config.trigger === "scroll" ? (
                  <Field label={t("forms.howFar")} htmlFor="f-scroll"><input id="f-scroll" type="number" min={5} max={100} value={draft.config.scrollPercent} onChange={(e) => config({ scrollPercent: Number(e.target.value) })} className={inputClass} /></Field>
                ) : null}
                {draft.config.trigger === "exit_intent" ? <p className="m-0 self-end text-[13px] text-app-ink-soft">{t("forms.phonesNoMouse")}</p> : null}
                <Field label={t("forms.on")} htmlFor="f-pages">
                  <select id="f-pages" className={selectClass} value={draft.config.pages} onChange={(e) => config({ pages: e.target.value as PopupConfig["pages"] })}>
                    <option value="all">{t("forms.everyPage")}</option>
                    <option value="home">{t("forms.homeOnly")}</option>
                    <option value="product">{t("forms.productOnly")}</option>
                  </select>
                </Field>
                <Field label={t("forms.howOften")} htmlFor="f-freq">
                  <select id="f-freq" className={selectClass} value={draft.config.frequency} onChange={(e) => config({ frequency: e.target.value as PopupConfig["frequency"] })}>
                    <option value="once">{t("forms.oncePerVisitor")}</option>
                    <option value="days">{t("forms.againAfterDays")}</option>
                    <option value="session">{t("forms.oncePerVisit")}</option>
                    <option value="always">{t("forms.everyLoad")}</option>
                  </select>
                </Field>
                {draft.config.frequency === "days" ? (
                  <Field label={t("forms.daysBetween")} htmlFor="f-days"><input id="f-days" type="number" min={1} max={365} value={draft.config.frequencyDays} onChange={(e) => config({ frequencyDays: Number(e.target.value) })} className={inputClass} /></Field>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-4 text-[14px]">
                {(["mobile", "desktop"] as const).map((device) => (
                  <label key={device} className="flex min-h-[40px] items-center gap-2.5">
                    <input
                      type="checkbox"
                      className={checkClass}
                      checked={draft.config.devices.includes(device)}
                      onChange={(e) => config({ devices: e.target.checked ? [...new Set([...draft.config.devices, device])] : draft.config.devices.filter((d) => d !== device).length ? draft.config.devices.filter((d) => d !== device) : draft.config.devices })}
                    />
                    {device === "mobile" ? t("forms.phones") : t("forms.computers")}
                  </label>
                ))}
              </div>
              <label className="flex min-h-[40px] items-start gap-2.5 text-[14px]">
                <input type="checkbox" className={`${checkClass} mt-0.5`} checked={draft.config.onlyWithCart} onChange={(e) => config({ onlyWithCart: e.target.checked })} />
                <span>
                  <strong className="block">{t("forms.onlyWithCart")}</strong>
                  <span className="text-[12.5px] text-app-ink-soft">{t("forms.onlyWithCartHint")}</span>
                </span>
              </label>
            </fieldset>
          ) : null}

          {kind === "signup" ? <RewardEditor reward={draft.config.reward} discounts={discounts} onChange={(reward) => config({ reward })} /> : null}

          <label className="flex min-h-[40px] items-center gap-2.5 text-[14px] font-bold"><input type="checkbox" className={checkClass} checked={draft.active} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} /> {t("forms.live")}</label>
          {error ? <Notice>{error}</Notice> : null}
          <div className="flex flex-wrap justify-end gap-2">
            <PillButton size="md" tone="white" onClick={onClose}>{t("cancel")}</PillButton>
            <PillButton size="md" type="submit" busy={saving}>{editing ? t("save") : t("forms.create")}</PillButton>
          </div>
        </div>

        <div className="min-w-0 lg:sticky lg:top-0">
          <LivePreview popup={popup} theme={theme} />
        </div>
      </form>
    </Modal>
  );
}

export function FormsManager({ forms, storeSlug, theme, discounts, extras }: { forms: ManagedForm[]; storeSlug: string; theme: EditorTheme; discounts: DiscountOption[]; extras: EditorExtras }) {
  const router = useRouter();
  const t = useT("marketing", "common");
  const locale = useLocale();
  const [editor, setEditor] = useState<{ editing: ManagedForm | null; popup: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  async function toggle(form: ManagedForm, active: boolean) {
    setError(null);
    try {
      await api(`/api/app/marketing/forms/${form.id}`, "PATCH", { active });
      router.refresh();
    } catch (toggleError) {
      setError(errorText(toggleError));
    }
  }

  async function remove(form: ManagedForm) {
    if (!(await confirmDialog(t("forms.confirmDelete", { name: form.name })))) return;
    try {
      await api(`/api/app/marketing/forms/${form.id}`, "DELETE");
      router.refresh();
    } catch (deleteError) {
      setError(errorText(deleteError));
    }
  }

  function copyLink(form: ManagedForm) {
    const link = `${window.location.origin}/s/${storeSlug}/join/${form.id}`;
    void navigator.clipboard?.writeText(link).then(() => {
      setCopied(form.id);
      window.setTimeout(() => setCopied(null), 2000);
    });
  }

  const livePopups = forms.filter((f) => f.isPopup && f.active).length;

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap gap-2">
        <PillButton size="md" tone="accent" onClick={() => setEditor({ editing: null, popup: true })}><Icon name="plus" size={16} /> {t("forms.newPopup")}</PillButton>
        <PillButton size="md" tone="white" onClick={() => setEditor({ editing: null, popup: false })}><Icon name="link" size={16} /> {t("forms.newPage")}</PillButton>
      </div>
      {livePopups > 1 ? <Notice tone="info">{t("forms.manyLive", { count: livePopups })}</Notice> : null}
      {error ? <Notice>{error}</Notice> : null}

      {forms.length ? (
        <ListCard>
          {forms.map((form) => {
            const rate = form.views ? Math.round((form.signups / form.views) * 1000) / 10 : null;
            return (
              <ListRow key={form.id}>
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[14px] bg-app-canvas"><Icon name={form.isPopup ? KIND_ICON[form.config.kind] : "link"} size={18} /></span>
                <div className="min-w-0 flex-1 basis-[200px]">
                  <div className="truncate text-[15px] font-extrabold">{form.name}</div>
                  <div className="truncate text-[13px] text-app-ink-soft">
                    {form.isPopup ? `${t(`forms.kind.${form.config.kind}` as MessageKey<"marketing">)} · ${t(LAYOUT_TEXT[form.config.layout])} ${TRIGGER_TEXT[form.config.trigger](form.config, t)}` : t("forms.signupPage")}
                    {form.rewardText ? ` · ${t("forms.gives", { value: form.rewardText })}` : ""}
                  </div>
                </div>
                <div className="text-[13px] text-app-ink-soft sm:w-[190px]">
                  <strong className="text-app-ink">{form.signups}</strong> {form.isPopup && hasCta(form.config.kind) ? t("forms.clicksWord") : form.isPopup && form.config.kind === "game" ? t("forms.playsWord") : t("forms.signupsWord")}{form.isPopup ? <> · {t("reports.views", { count: form.views })}{rate !== null ? ` · ${rate}%` : ""}</> : null}
                  <div>{t("forms.last30")}</div>
                  {form.codesUsed !== null ? <div><strong className="text-app-ink">{formatNumber(form.codesUsed, locale)}</strong> {t("forms.codesUsedWord")}</div> : null}
                </div>
                <Toggle on={form.active} onChange={(on) => void toggle(form, on)} label={t("forms.liveLabel", { name: form.name })} />
                <div className="flex w-full flex-wrap gap-2 sm:w-auto">
                  {!form.isPopup ? <button type="button" className={buttonClass("white", "sm")} onClick={() => copyLink(form)}>{copied === form.id ? t("copied") : t("forms.copyLink")}</button> : null}
                  <button type="button" className={buttonClass("white", "sm")} onClick={() => setEditor({ editing: form, popup: form.isPopup })}>{t("edit")}</button>
                  <button type="button" className={buttonClass("danger", "sm")} onClick={() => void remove(form)} aria-label={t("forms.deleteName", { name: form.name })}><Icon name="trash" size={14} /></button>
                </div>
              </ListRow>
            );
          })}
        </ListCard>
      ) : (
        <EmptyState icon="mail" title={t("forms.emptyTitle")} action={<PillButton size="md" onClick={() => setEditor({ editing: null, popup: true })}>{t("forms.emptyAction")}</PillButton>}>
          {t("forms.emptyBody")}
        </EmptyState>
      )}

      {forms.some((f) => !f.isPopup && f.active) ? (
        <Card className="p-4 text-[13.5px] text-app-ink-soft">{t("forms.pagesLiveAt")} <code className="text-app-ink">/s/{storeSlug}/join/…</code>. {t("forms.pagesTip")}</Card>
      ) : null}

      {editor ? (
        <FormEditor
          editing={editor.editing}
          startAsPopup={editor.popup}
          theme={theme}
          discounts={discounts}
          extras={extras}
          onClose={() => setEditor(null)}
          onSaved={() => {
            setEditor(null);
            router.refresh();
          }}
        />
      ) : null}
    </div>
  );
}
