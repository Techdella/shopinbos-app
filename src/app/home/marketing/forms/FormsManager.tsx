"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, EmptyState, ListCard, ListRow, Pill } from "@/components/app-kit";
import { Notice, PillButton, Segmented, Toggle } from "@/components/app-ui";
import { Icon } from "@/components/ui/Icon";
import { Modal } from "@/components/growth/Modal";
import { Field, buttonClass, checkClass, inputClass, selectClass, textareaClass } from "@/components/growth/kit";
import type { FormDesign, FormField, PopupConfig } from "@/lib/marketing/forms";
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
}

const TRIGGER_TEXT: Record<PopupConfig["trigger"], (c: PopupConfig, t: MarketingT) => string> = {
  immediate: (_, t) => t("forms.trigger.immediate"),
  delay: (c, t) => t("forms.trigger.delay", { seconds: c.delaySeconds }),
  exit_intent: (_, t) => t("forms.trigger.exit"),
  scroll: (c, t) => t("forms.trigger.scroll", { percent: c.scrollPercent }),
};
const LAYOUT_TEXT: Record<PopupConfig["layout"], MessageKey<"marketing">> = { modal: "forms.layout.modal", flyout: "forms.layout.flyout", bar: "forms.layout.bar" };

const DEFAULT_CONFIG: PopupConfig = { layout: "modal", trigger: "delay", delaySeconds: 8, scrollPercent: 50, pages: "all", frequency: "once", frequencyDays: 7, devices: ["mobile", "desktop"], reward: null, afterSubmit: "message", redirectUrl: "" };
const DEFAULT_DESIGN: FormDesign = {
  headline: "Get 10% off your first order",
  body: "Join our list for new arrivals and offers.",
  buttonText: "Sign me up",
  successMessage: "You're in! Here's your code.",
  imageUrl: "",
  consentText: "I agree to get emails about offers and new arrivals. I can unsubscribe at any time.",
  askSmsConsent: false,
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
    return { name: "Welcome pop-up", isPopup: true, active: true, design: DEFAULT_DESIGN, config: { ...DEFAULT_CONFIG, reward: { type: "percentage", value: 10, days: 14 } }, askName: true, askPhone: false, askBirthday: false, extra: [] };
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

function Preview({ draft }: { draft: Draft }) {
  const t = useT("marketing");
  const fields = fieldsFor(draft);
  const reward = draft.config.reward;
  return (
    <div className="rounded-[18px] bg-app-canvas p-4" aria-label={t("editor.preview")}>
      <div className={draft.isPopup && draft.config.layout === "bar" ? "rounded-[14px] bg-white p-4" : "mx-auto max-w-[360px] rounded-[22px] bg-white p-5 shadow-sm"}>
        <div className="text-[19px] font-extrabold leading-tight">{draft.design.headline}</div>
        <p className="mb-3 mt-1.5 text-[13.5px] text-app-ink-soft">
          {draft.design.body}
          {draft.isPopup && reward ? <strong className="block text-app-ink">{reward.type === "percentage" ? `Get ${reward.value}% off your first order.` : `Get ₦${reward.value.toLocaleString("en-NG")} off your first order.`}</strong> : null}
        </p>
        <div className="grid gap-2">
          {fields.map((field) => (
            <div key={field.key} className="h-10 rounded-[10px] border border-app-line px-3 text-[13px] leading-10 text-app-ink-faint">{field.label}</div>
          ))}
          <div className="flex items-start gap-2 text-[11.5px] text-app-ink-soft"><span className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded border border-app-line-strong" />{draft.design.consentText}</div>
          <div className="grid h-10 place-items-center rounded-full bg-app-ink text-[13px] font-bold text-white">{draft.design.buttonText}</div>
        </div>
      </div>
      <p className="mb-0 mt-3 text-[12.5px] text-app-ink-soft">{t("forms.previewNote")}</p>
    </div>
  );
}

function FormEditor({ editing, startAsPopup, onClose, onSaved }: { editing: ManagedForm | null; startAsPopup: boolean; onClose: () => void; onSaved: () => void }) {
  const t = useT("marketing", "common");
  const [draft, setDraft] = useState<Draft>(() => ({ ...toDraft(editing), ...(editing ? {} : { isPopup: startAsPopup, name: startAsPopup ? t("forms.defaultPopupName") : t("forms.defaultPageName") }) }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const design = (patch: Partial<FormDesign>) => setDraft((d) => ({ ...d, design: { ...d.design, ...patch } }));
  const config = (patch: Partial<PopupConfig>) => setDraft((d) => ({ ...d, config: { ...d.config, ...patch } }));

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
        popupConfig: { ...draft.config, redirectUrl: draft.config.redirectUrl || undefined },
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

        <fieldset className="m-0 grid min-w-0 gap-4 border-0 p-0">
          <legend className="mb-2 p-0 text-[16px] font-extrabold">{t("forms.whatItSays")}</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("forms.headline")} htmlFor="f-head"><input id="f-head" value={draft.design.headline} onChange={(e) => design({ headline: e.target.value })} className={inputClass} maxLength={120} /></Field>
            <Field label={t("forms.button")} htmlFor="f-btn"><input id="f-btn" value={draft.design.buttonText} onChange={(e) => design({ buttonText: e.target.value })} className={inputClass} maxLength={40} /></Field>
          </div>
          <Field label={t("forms.message")} htmlFor="f-body"><textarea id="f-body" rows={2} value={draft.design.body} onChange={(e) => design({ body: e.target.value })} className={textareaClass} maxLength={400} /></Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("forms.afterSignup")} htmlFor="f-done"><input id="f-done" value={draft.design.successMessage} onChange={(e) => design({ successMessage: e.target.value })} className={inputClass} maxLength={300} /></Field>
            <Field label={t("forms.picture")} htmlFor="f-img"><input id="f-img" value={draft.design.imageUrl} onChange={(e) => design({ imageUrl: e.target.value })} className={inputClass} placeholder="https://" inputMode="url" /></Field>
          </div>
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
              <Field label={t("forms.style")} htmlFor="f-layout">
                <select id="f-layout" className={selectClass} value={draft.config.layout} onChange={(e) => config({ layout: e.target.value as PopupConfig["layout"] })}>
                  <option value="modal">{t("forms.layout.modal")}</option>
                  <option value="flyout">{t("forms.layout.flyout")}</option>
                  <option value="bar">{t("forms.layout.bar")}</option>
                </select>
              </Field>
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
            <div className="grid gap-3 rounded-[16px] border border-app-line p-4">
              <label className="flex items-center gap-2.5 text-[14px] font-bold">
                <input type="checkbox" className={checkClass} checked={Boolean(draft.config.reward)} onChange={(e) => config({ reward: e.target.checked ? { type: "percentage", value: 10, days: 14 } : null })} />
                {t("forms.giveReward")}
              </label>
              {draft.config.reward ? (
                <div className="grid gap-3 sm:grid-cols-3">
                  <Field label={t("forms.kind")} htmlFor="f-rtype">
                    <select id="f-rtype" className={selectClass} value={draft.config.reward.type} onChange={(e) => config({ reward: { ...draft.config.reward!, type: e.target.value as "percentage" | "fixed_amount" } })}>
                      <option value="percentage">{t("forms.percentOff")}</option>
                      <option value="fixed_amount">{t("forms.nairaOff")}</option>
                    </select>
                  </Field>
                  <Field label={draft.config.reward.type === "percentage" ? t("forms.percent") : t("forms.naira")} htmlFor="f-rvalue"><input id="f-rvalue" type="number" min={1} value={draft.config.reward.value} onChange={(e) => config({ reward: { ...draft.config.reward!, value: Number(e.target.value) } })} className={inputClass} /></Field>
                  <Field label={t("forms.validFor")} htmlFor="f-rdays"><input id="f-rdays" type="number" min={1} max={365} value={draft.config.reward.days} onChange={(e) => config({ reward: { ...draft.config.reward!, days: Number(e.target.value) } })} className={inputClass} /></Field>
                  <p className="m-0 text-[12.5px] text-app-ink-soft sm:col-span-3">{t("forms.rewardNote", { token: "{{discount_code}}" })}</p>
                </div>
              ) : null}
            </div>
          </fieldset>
        ) : null}

        <Preview draft={draft} />

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

export function FormsManager({ forms, storeSlug }: { forms: ManagedForm[]; storeSlug: string }) {
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
                    {form.isPopup && form.config.reward ? ` · ${t("forms.reward", { value: form.config.reward.type === "percentage" ? `${form.config.reward.value}%` : `₦${formatNumber(form.config.reward.value, locale)}` })}` : ""}
                  </div>
                </div>
                <div className="text-[13px] text-app-ink-soft sm:w-[190px]">
                  <strong className="text-app-ink">{form.signups}</strong> {t("forms.signupsWord")}{form.isPopup ? <> · {t("reports.views", { count: form.views })}{rate !== null ? ` · ${rate}%` : ""}</> : null}
                  <div>{t("forms.last30")}</div>
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
