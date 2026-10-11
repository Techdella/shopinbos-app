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

const TRIGGER_TEXT: Record<PopupConfig["trigger"], (c: PopupConfig) => string> = {
  immediate: () => "as the page opens",
  delay: (c) => `after ${c.delaySeconds} seconds`,
  exit_intent: () => "when they're about to leave",
  scroll: (c) => `after scrolling ${c.scrollPercent}%`,
};
const LAYOUT_TEXT: Record<PopupConfig["layout"], string> = { modal: "Centre pop-up", flyout: "Corner flyout", bar: "Bottom bar" };

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
  const fields = fieldsFor(draft);
  const reward = draft.config.reward;
  return (
    <div className="rounded-[18px] bg-app-canvas p-4" aria-label="Preview">
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
      <p className="mb-0 mt-3 text-[12.5px] text-app-ink-soft">On your store it uses your store's colours.</p>
    </div>
  );
}

function FormEditor({ editing, startAsPopup, onClose, onSaved }: { editing: ManagedForm | null; startAsPopup: boolean; onClose: () => void; onSaved: () => void }) {
  const [draft, setDraft] = useState<Draft>(() => ({ ...toDraft(editing), ...(editing ? {} : { isPopup: startAsPopup, name: startAsPopup ? "Welcome pop-up" : "Newsletter sign-up" }) }));
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
    <Modal title={editing ? `Edit ${editing.name}` : draft.isPopup ? "New pop-up" : "New sign-up page"} onClose={onClose} wide>
      <form onSubmit={(event) => void save(event)} className="grid gap-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name (only you see this)" htmlFor="f-name"><input id="f-name" required value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className={inputClass} maxLength={120} /></Field>
          <Field label="Shows as">
            <Segmented options={[{ value: "popup", label: "Pop-up on my store" }, { value: "page", label: "Sign-up page" }]} value={draft.isPopup ? "popup" : "page"} onChange={(v) => setDraft({ ...draft, isPopup: v === "popup" })} />
          </Field>
        </div>

        <fieldset className="m-0 grid min-w-0 gap-4 border-0 p-0">
          <legend className="mb-2 p-0 text-[16px] font-extrabold">What it says</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Headline" htmlFor="f-head"><input id="f-head" value={draft.design.headline} onChange={(e) => design({ headline: e.target.value })} className={inputClass} maxLength={120} /></Field>
            <Field label="Button" htmlFor="f-btn"><input id="f-btn" value={draft.design.buttonText} onChange={(e) => design({ buttonText: e.target.value })} className={inputClass} maxLength={40} /></Field>
          </div>
          <Field label="Message" htmlFor="f-body"><textarea id="f-body" rows={2} value={draft.design.body} onChange={(e) => design({ body: e.target.value })} className={textareaClass} maxLength={400} /></Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="After they sign up" htmlFor="f-done"><input id="f-done" value={draft.design.successMessage} onChange={(e) => design({ successMessage: e.target.value })} className={inputClass} maxLength={300} /></Field>
            <Field label="Picture (optional, https link)" htmlFor="f-img"><input id="f-img" value={draft.design.imageUrl} onChange={(e) => design({ imageUrl: e.target.value })} className={inputClass} placeholder="https://" inputMode="url" /></Field>
          </div>
          <Field label="Consent wording (shown next to an unticked box)" htmlFor="f-consent"><textarea id="f-consent" rows={2} value={draft.design.consentText} onChange={(e) => design({ consentText: e.target.value })} className={textareaClass} maxLength={400} /></Field>
        </fieldset>

        <fieldset className="m-0 grid min-w-0 gap-2 border-0 p-0">
          <legend className="mb-2 p-0 text-[16px] font-extrabold">What it asks</legend>
          <p className="m-0 text-[13.5px] text-app-ink-soft">Email is always asked. Fewer fields means more sign-ups.</p>
          <label className="flex min-h-[40px] items-center gap-2.5 text-[14px]"><input type="checkbox" className={checkClass} checked={draft.askName} onChange={(e) => setDraft({ ...draft, askName: e.target.checked })} /> First name</label>
          <label className="flex min-h-[40px] items-center gap-2.5 text-[14px]"><input type="checkbox" className={checkClass} checked={draft.askPhone} onChange={(e) => setDraft({ ...draft, askPhone: e.target.checked })} /> WhatsApp number</label>
          {draft.askPhone ? (
            <label className="ml-7 flex min-h-[40px] items-center gap-2.5 text-[14px]"><input type="checkbox" className={checkClass} checked={draft.design.askSmsConsent} onChange={(e) => design({ askSmsConsent: e.target.checked })} /> Ask permission for SMS and WhatsApp offers too</label>
          ) : null}
          <label className="flex min-h-[40px] items-center gap-2.5 text-[14px]"><input type="checkbox" className={checkClass} checked={draft.askBirthday} onChange={(e) => setDraft({ ...draft, askBirthday: e.target.checked })} /> Birthday (for the birthday automation)</label>
        </fieldset>

        {draft.isPopup ? (
          <fieldset className="m-0 grid min-w-0 gap-4 border-0 p-0">
            <legend className="mb-2 p-0 text-[16px] font-extrabold">When and where it shows</legend>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Style" htmlFor="f-layout">
                <select id="f-layout" className={selectClass} value={draft.config.layout} onChange={(e) => config({ layout: e.target.value as PopupConfig["layout"] })}>
                  <option value="modal">Centre pop-up</option>
                  <option value="flyout">Corner flyout</option>
                  <option value="bar">Bottom bar</option>
                </select>
              </Field>
              <Field label="Show it" htmlFor="f-trigger">
                <select id="f-trigger" className={selectClass} value={draft.config.trigger} onChange={(e) => config({ trigger: e.target.value as PopupConfig["trigger"] })}>
                  <option value="delay">After a few seconds</option>
                  <option value="scroll">After scrolling down</option>
                  <option value="exit_intent">When they're about to leave (computers)</option>
                  <option value="immediate">Straight away</option>
                </select>
              </Field>
              {draft.config.trigger === "delay" ? (
                <Field label="Seconds to wait" htmlFor="f-delay"><input id="f-delay" type="number" min={0} max={600} value={draft.config.delaySeconds} onChange={(e) => config({ delaySeconds: Number(e.target.value) })} className={inputClass} /></Field>
              ) : null}
              {draft.config.trigger === "scroll" ? (
                <Field label="How far down (%)" htmlFor="f-scroll"><input id="f-scroll" type="number" min={5} max={100} value={draft.config.scrollPercent} onChange={(e) => config({ scrollPercent: Number(e.target.value) })} className={inputClass} /></Field>
              ) : null}
              {draft.config.trigger === "exit_intent" ? <p className="m-0 self-end text-[13px] text-app-ink-soft">Phones have no mouse to leave with, so there it shows after scrolling halfway.</p> : null}
              <Field label="On" htmlFor="f-pages">
                <select id="f-pages" className={selectClass} value={draft.config.pages} onChange={(e) => config({ pages: e.target.value as PopupConfig["pages"] })}>
                  <option value="all">Every page</option>
                  <option value="home">Home page only</option>
                  <option value="product">Product pages only</option>
                </select>
              </Field>
              <Field label="How often" htmlFor="f-freq">
                <select id="f-freq" className={selectClass} value={draft.config.frequency} onChange={(e) => config({ frequency: e.target.value as PopupConfig["frequency"] })}>
                  <option value="once">Once per visitor</option>
                  <option value="days">Again after some days</option>
                  <option value="session">Once per visit</option>
                  <option value="always">Every page load</option>
                </select>
              </Field>
              {draft.config.frequency === "days" ? (
                <Field label="Days between" htmlFor="f-days"><input id="f-days" type="number" min={1} max={365} value={draft.config.frequencyDays} onChange={(e) => config({ frequencyDays: Number(e.target.value) })} className={inputClass} /></Field>
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
                  {device === "mobile" ? "Phones" : "Computers"}
                </label>
              ))}
            </div>
            <div className="grid gap-3 rounded-[16px] border border-app-line p-4">
              <label className="flex items-center gap-2.5 text-[14px] font-bold">
                <input type="checkbox" className={checkClass} checked={Boolean(draft.config.reward)} onChange={(e) => config({ reward: e.target.checked ? { type: "percentage", value: 10, days: 14 } : null })} />
                Give a sign-up reward
              </label>
              {draft.config.reward ? (
                <div className="grid gap-3 sm:grid-cols-3">
                  <Field label="Kind" htmlFor="f-rtype">
                    <select id="f-rtype" className={selectClass} value={draft.config.reward.type} onChange={(e) => config({ reward: { ...draft.config.reward!, type: e.target.value as "percentage" | "fixed_amount" } })}>
                      <option value="percentage">% off</option>
                      <option value="fixed_amount">₦ off</option>
                    </select>
                  </Field>
                  <Field label={draft.config.reward.type === "percentage" ? "Percent" : "Naira"} htmlFor="f-rvalue"><input id="f-rvalue" type="number" min={1} value={draft.config.reward.value} onChange={(e) => config({ reward: { ...draft.config.reward!, value: Number(e.target.value) } })} className={inputClass} /></Field>
                  <Field label="Valid for (days)" htmlFor="f-rdays"><input id="f-rdays" type="number" min={1} max={365} value={draft.config.reward.days} onChange={(e) => config({ reward: { ...draft.config.reward!, days: Number(e.target.value) } })} className={inputClass} /></Field>
                  <p className="m-0 text-[12.5px] text-app-ink-soft sm:col-span-3">Each new subscriber gets their own one-use code, shown on screen and available to the welcome email as {"{{discount_code}}"}.</p>
                </div>
              ) : null}
            </div>
          </fieldset>
        ) : null}

        <Preview draft={draft} />

        <label className="flex min-h-[40px] items-center gap-2.5 text-[14px] font-bold"><input type="checkbox" className={checkClass} checked={draft.active} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} /> Live</label>
        {error ? <Notice>{error}</Notice> : null}
        <div className="flex flex-wrap justify-end gap-2">
          <PillButton size="md" tone="white" onClick={onClose}>Cancel</PillButton>
          <PillButton size="md" type="submit" busy={saving}>{editing ? "Save" : "Create"}</PillButton>
        </div>
      </form>
    </Modal>
  );
}

export function FormsManager({ forms, storeSlug }: { forms: ManagedForm[]; storeSlug: string }) {
  const router = useRouter();
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
    if (!window.confirm(`Delete "${form.name}"? Sign-ups it collected stay on your list.`)) return;
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
        <PillButton size="md" tone="accent" onClick={() => setEditor({ editing: null, popup: true })}><Icon name="plus" size={16} /> New pop-up</PillButton>
        <PillButton size="md" tone="white" onClick={() => setEditor({ editing: null, popup: false })}><Icon name="link" size={16} /> New sign-up page</PillButton>
      </div>
      {livePopups > 1 ? <Notice tone="info">{livePopups} pop-ups are live. Shoppers see at most one per visit: the most recently edited one that fits the page.</Notice> : null}
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
                    {form.isPopup ? `${LAYOUT_TEXT[form.config.layout]} ${TRIGGER_TEXT[form.config.trigger](form.config)}` : "Sign-up page"}
                    {form.isPopup && form.config.reward ? ` · ${form.config.reward.type === "percentage" ? `${form.config.reward.value}%` : `₦${form.config.reward.value.toLocaleString("en-NG")}`} reward` : ""}
                  </div>
                </div>
                <div className="text-[13px] text-app-ink-soft sm:w-[190px]">
                  <strong className="text-app-ink">{form.signups}</strong> sign-ups{form.isPopup ? <> · {form.views} views{rate !== null ? ` · ${rate}%` : ""}</> : null}
                  <div>last 30 days</div>
                </div>
                <Toggle on={form.active} onChange={(on) => void toggle(form, on)} label={`${form.name} live`} />
                <div className="flex w-full flex-wrap gap-2 sm:w-auto">
                  {!form.isPopup ? <button type="button" className={buttonClass("white", "sm")} onClick={() => copyLink(form)}>{copied === form.id ? "Copied" : "Copy link"}</button> : null}
                  <button type="button" className={buttonClass("white", "sm")} onClick={() => setEditor({ editing: form, popup: form.isPopup })}>Edit</button>
                  <button type="button" className={buttonClass("danger", "sm")} onClick={() => void remove(form)} aria-label={`Delete ${form.name}`}><Icon name="trash" size={14} /></button>
                </div>
              </ListRow>
            );
          })}
        </ListCard>
      ) : (
        <EmptyState icon="mail" title="No forms yet" action={<PillButton size="md" onClick={() => setEditor({ editing: null, popup: true })}>Make a welcome pop-up</PillButton>}>
          A pop-up with a small reward is the fastest way to turn visitors into subscribers you can message again.
        </EmptyState>
      )}

      {forms.some((f) => !f.isPopup && f.active) ? (
        <Card className="p-4 text-[13.5px] text-app-ink-soft">Sign-up pages live at <code className="text-app-ink">/s/{storeSlug}/join/…</code>. Put the link in your Instagram bio, WhatsApp status or on a QR code at your stand.</Card>
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
