"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, EmptyState, ListCard, ListRow, Pill } from "@/components/app-kit";
import { Notice, PillButton, Segmented, Toggle } from "@/components/app-ui";
import { Icon } from "@/components/ui/Icon";
import { Modal } from "@/components/growth/Modal";
import { MediaPicker } from "@/components/media/MediaPicker";
import { Field, buttonClass, checkClass, inputClass, selectClass, textareaClass } from "@/components/growth/kit";
import { DEFAULT_POPUP_STYLE, popupTemplate, type FormDesign, type FormField, type PopupConfig, type PopupStyle, type PopupTemplateId } from "@/lib/marketing/forms";
import type { RenderablePopup } from "@/components/storefront/marketing/PopupView";
import { LivePreview, NEW_REWARD, RewardEditor, StyleControls, TemplateGallery, rewardSummaryFor, type DiscountOption, type EditorTheme } from "./PopupDesigner";
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

const DEFAULT_CONFIG: PopupConfig = { layout: "modal", trigger: "delay", delaySeconds: 8, scrollPercent: 50, pages: "all", frequency: "once", frequencyDays: 7, devices: ["mobile", "desktop"], reward: null, afterSubmit: "message", redirectUrl: "" };
const DEFAULT_DESIGN: FormDesign = {
  headline: "Get 10% off your first order",
  body: "Join our list for new arrivals and offers.",
  buttonText: "Sign me up",
  successMessage: "You're in! Here's your code.",
  imageUrl: "",
  consentText: "I agree to get emails about offers and new arrivals. I can unsubscribe at any time.",
  askSmsConsent: false,
  style: DEFAULT_POPUP_STYLE,
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

function previewPopup(draft: Draft, discounts: DiscountOption[]): RenderablePopup {
  return {
    id: "preview",
    fields: fieldsFor(draft),
    // Sign-up pages don't use the pop-up look: preview them plainly.
    design: draft.isPopup ? draft.design : { ...draft.design, style: { ...DEFAULT_POPUP_STYLE, overlay: 0 } },
    layout: draft.isPopup ? draft.config.layout : "modal",
    reward: rewardSummaryFor(draft.config.reward, discounts),
    afterSubmit: "message",
    redirectUrl: "",
  };
}

function FormEditor({ editing, startAsPopup, theme, discounts, onClose, onSaved }: { editing: ManagedForm | null; startAsPopup: boolean; theme: EditorTheme; discounts: DiscountOption[]; onClose: () => void; onSaved: () => void }) {
  const t = useT("marketing", "common");
  const [draft, setDraft] = useState<Draft>(() => ({ ...toDraft(editing), ...(editing ? {} : { isPopup: startAsPopup, name: startAsPopup ? t("forms.defaultPopupName") : t("forms.defaultPageName") }) }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const design = (patch: Partial<FormDesign>) => setDraft((d) => ({ ...d, design: { ...d.design, ...patch } }));
  const config = (patch: Partial<PopupConfig>) => setDraft((d) => ({ ...d, config: { ...d.config, ...patch } }));
  const look = (patch: Partial<PopupStyle>) => setDraft((d) => ({ ...d, design: { ...d.design, style: { ...d.design.style, ...patch } } }));
  const pickTemplate = (id: PopupTemplateId) => {
    const template = popupTemplate(id);
    setDraft((d) => ({ ...d, config: { ...d.config, layout: template.layout }, design: { ...d.design, style: { ...template.style, badgeText: d.design.style.badgeText } } }));
  };
  const popup = previewPopup(draft, discounts);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const body = {
        name: draft.name,
        type: editing && ["newsletter", "lead", "waitlist", "popup"].includes(editing.type) ? editing.type : "newsletter",
        isPopup: draft.isPopup,
        active: draft.active,
        fields: fieldsFor(draft),
        design: draft.design,
        popupConfig: { ...draft.config, redirectUrl: draft.config.redirectUrl || undefined, reward: draft.config.reward },
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

  return (
    <Modal title={editing ? t("seg.editName", { name: editing.name }) : draft.isPopup ? t("forms.newPopup") : t("forms.newPage")} onClose={onClose} wide>
      <form onSubmit={(event) => void save(event)} className="grid gap-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("forms.nameOnlyYou")} htmlFor="f-name"><input id="f-name" required value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className={inputClass} maxLength={120} /></Field>
          <Field label={t("forms.showsAs")}>
            <Segmented options={[{ value: "popup", label: t("forms.popupOnStore") }, { value: "page", label: t("forms.signupPage") }]} value={draft.isPopup ? "popup" : "page"} onChange={(v) => setDraft({ ...draft, isPopup: v === "popup" })} />
          </Field>
        </div>

        {draft.isPopup ? (
          <fieldset className="m-0 grid min-w-0 gap-4 border-0 p-0">
            <legend className="mb-1 p-0 text-[16px] font-extrabold">{t("forms.look")}</legend>
            <p className="m-0 text-[13.5px] text-app-ink-soft">{t("forms.pickLook")}</p>
            <TemplateGallery popup={popup} theme={theme} value={draft.design.style.template} onPick={pickTemplate} />
            <StyleControls style={draft.design.style} layout={draft.config.layout} theme={theme} onStyle={look} onLayout={(layout) => config({ layout })} />
          </fieldset>
        ) : null}

        <fieldset className="m-0 grid min-w-0 gap-4 border-0 p-0">
          <legend className="mb-2 p-0 text-[16px] font-extrabold">{t("forms.whatItSays")}</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("forms.headline")} htmlFor="f-head"><input id="f-head" value={draft.design.headline} onChange={(e) => design({ headline: e.target.value })} className={inputClass} maxLength={120} /></Field>
            <Field label={t("forms.button")} htmlFor="f-btn"><input id="f-btn" value={draft.design.buttonText} onChange={(e) => design({ buttonText: e.target.value })} className={inputClass} maxLength={40} /></Field>
          </div>
          <Field label={t("forms.message")} htmlFor="f-body"><textarea id="f-body" rows={2} value={draft.design.body} onChange={(e) => design({ body: e.target.value })} className={textareaClass} maxLength={400} /></Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("forms.afterSignup")} htmlFor="f-done"><input id="f-done" value={draft.design.successMessage} onChange={(e) => design({ successMessage: e.target.value })} className={inputClass} maxLength={300} /></Field>
          </div>
          <Field label={t("forms.picture")} htmlFor="f-img-choose"><MediaPicker id="f-img" value={draft.design.imageUrl} onChange={(url) => design({ imageUrl: url })} /></Field>
          <Field label={t("forms.consent")} htmlFor="f-consent"><textarea id="f-consent" rows={2} value={draft.design.consentText} onChange={(e) => design({ consentText: e.target.value })} className={textareaClass} maxLength={400} /></Field>
        </fieldset>

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
          </fieldset>
        ) : null}

        <RewardEditor reward={draft.config.reward} discounts={discounts} onChange={(reward) => config({ reward })} />

        <LivePreview popup={popup} theme={theme} />

        <label className="flex min-h-[40px] items-center gap-2.5 text-[14px] font-bold"><input type="checkbox" className={checkClass} checked={draft.active} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} /> {t("forms.live")}</label>
        {error ? <Notice>{error}</Notice> : null}
        <div className="flex flex-wrap justify-end gap-2">
          <PillButton size="md" tone="white" onClick={onClose}>{t("cancel")}</PillButton>
          <PillButton size="md" type="submit" busy={saving}>{editing ? t("save") : t("forms.create")}</PillButton>
        </div>
      </form>
    </Modal>
  );
}

export function FormsManager({ forms, storeSlug, theme, discounts }: { forms: ManagedForm[]; storeSlug: string; theme: EditorTheme; discounts: DiscountOption[] }) {
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
    if (!window.confirm(t("forms.confirmDelete", { name: form.name }))) return;
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
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[14px] bg-app-canvas"><Icon name={form.isPopup ? "sparkle" : "link"} size={18} /></span>
                <div className="min-w-0 flex-1 basis-[200px]">
                  <div className="truncate text-[15px] font-extrabold">{form.name}</div>
                  <div className="truncate text-[13px] text-app-ink-soft">
                    {form.isPopup ? `${t(LAYOUT_TEXT[form.config.layout])} ${TRIGGER_TEXT[form.config.trigger](form.config, t)}` : t("forms.signupPage")}
                    {form.rewardText ? ` · ${t("forms.gives", { value: form.rewardText })}` : ""}
                  </div>
                </div>
                <div className="text-[13px] text-app-ink-soft sm:w-[190px]">
                  <strong className="text-app-ink">{form.signups}</strong> {t("forms.signupsWord")}{form.isPopup ? <> · {t("reports.views", { count: form.views })}{rate !== null ? ` · ${rate}%` : ""}</> : null}
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
