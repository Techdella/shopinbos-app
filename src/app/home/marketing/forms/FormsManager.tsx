"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { EmptyState, ListCard, ListRow, Pill } from "@/components/app-kit";
import { Notice, PillButton, Toggle, cx } from "@/components/app-ui";
import { Icon } from "@/components/ui/Icon";
import { Modal } from "@/components/growth/Modal";
import { Field, buttonClass, checkClass, formatDate, humanize, inputClass, selectClass } from "@/components/growth/kit";

interface FormField {
  key: string;
  type: string;
  label: string;
  required: boolean;
}

interface PopupSettings {
  timing: "immediate" | "delay" | "exit_intent";
  delaySeconds: number;
  pages: "all" | "home" | "product";
  frequency: "once" | "session" | "always";
  devices: ("mobile" | "desktop")[];
  afterSubmit: "message" | "add_subscriber" | "notify" | "redirect";
  redirectUrl: string;
  message: string;
}

export interface ManagedForm {
  id: string;
  name: string;
  purpose: string;
  isPopup: boolean;
  active: boolean;
  createdAt: string;
  fields: FormField[];
  popup: PopupSettings | null;
}

const FIELD_TYPES = [
  { value: "text", label: "Text" },
  { value: "email", label: "Email" },
  { value: "phone", label: "Phone" },
  { value: "textarea", label: "Long text" },
  { value: "select", label: "Dropdown" },
  { value: "checkbox", label: "Tick box" },
  { value: "radio", label: "Choice" },
];

const PURPOSES = [
  { value: "newsletter", label: "Newsletter sign-up" },
  { value: "contact", label: "Contact" },
  { value: "lead", label: "Lead" },
  { value: "waitlist", label: "Waitlist" },
  { value: "product_inquiry", label: "Product question" },
  { value: "wholesale_inquiry", label: "Wholesale enquiry" },
  { value: "request_quote", label: "Quote request" },
  { value: "support", label: "Support" },
  { value: "custom", label: "Other" },
];

const FILTERS = [
  { value: "all", label: "All" },
  { value: "popup", label: "Popups" },
  { value: "inline", label: "Forms on a page" },
] as const;

function emptyPopup(): PopupSettings {
  return { timing: "immediate", delaySeconds: 5, pages: "all", frequency: "once", devices: ["mobile", "desktop"], afterSubmit: "add_subscriber", redirectUrl: "", message: "" };
}

function newKey() {
  return `field_${Math.random().toString(36).slice(2, 8)}`;
}

async function send(url: string, method: string, body?: unknown) {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  if (!res.ok) {
    const json = await res.json().catch(() => null);
    throw new Error(json?.error?.message ?? "Something went wrong. Try again.");
  }
}

interface Draft {
  name: string;
  purpose: string;
  isPopup: boolean;
  fields: FormField[];
  popup: PopupSettings;
}

function FormEditor({ editing, startAsPopup, onClose, onSaved }: { editing: ManagedForm | null; startAsPopup: boolean; onClose: () => void; onSaved: () => void }) {
  const [draft, setDraft] = useState<Draft>(() =>
    editing
      ? { name: editing.name, purpose: editing.purpose === "popup" ? "newsletter" : editing.purpose, isPopup: editing.isPopup, fields: editing.fields, popup: editing.popup ?? emptyPopup() }
      : { name: "", purpose: "newsletter", isPopup: startAsPopup, fields: [{ key: "email", type: "email", label: "Email", required: true }], popup: emptyPopup() },
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const popup = draft.popup;
  const setPopup = (patch: Partial<PopupSettings>) => setDraft((current) => ({ ...current, popup: { ...current.popup, ...patch } }));
  const updateField = (key: string, patch: Partial<FormField>) => setDraft((current) => ({ ...current, fields: current.fields.map((field) => (field.key === key ? { ...field, ...patch } : field)) }));

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const ps = draft.isPopup ? popup : null;
      await send(editing ? `/api/store/forms/${editing.id}` : "/api/store/forms", editing ? "PATCH" : "POST", {
        name: draft.name,
        type: draft.purpose,
        isPopup: draft.isPopup,
        fields: draft.fields.filter((field) => field.label.trim()),
        popupConfig: ps ? { timing: ps.timing, delaySeconds: ps.delaySeconds, pages: ps.pages, frequency: ps.frequency, devices: ps.devices, afterSubmit: ps.afterSubmit, redirectUrl: ps.redirectUrl, message: ps.message } : {},
        actions: ps
          ? [{ type: ps.afterSubmit === "add_subscriber" ? "add_subscriber" : ps.afterSubmit === "notify" ? "notify_seller" : ps.afterSubmit === "redirect" ? "redirect" : "show_message", config: { message: ps.message, redirectUrl: ps.redirectUrl } }]
          : [],
      });
      onSaved();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Couldn't save this form.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={editing ? `Edit ${editing.name}` : draft.isPopup ? "New popup" : "New form"} onClose={onClose} wide>
      <form onSubmit={(event) => void save(event)} className="grid gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" htmlFor="form-name">
            <input id="form-name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className={inputClass} required maxLength={120} />
          </Field>
          <Field label="What it's for" htmlFor="form-purpose">
            <select id="form-purpose" value={draft.purpose} onChange={(e) => setDraft({ ...draft, purpose: e.target.value })} className={selectClass}>
              {PURPOSES.map((purpose) => <option key={purpose.value} value={purpose.value}>{purpose.label}</option>)}
            </select>
          </Field>
        </div>

        <div className="flex min-h-[52px] items-center justify-between gap-3 rounded-[14px] bg-app-canvas px-4">
          <span className="text-[14px] font-semibold">Show as a popup</span>
          <Toggle on={draft.isPopup} onChange={(on) => setDraft({ ...draft, isPopup: on })} label="Show as a popup" />
        </div>

        <fieldset className="m-0 min-w-0 border-0 p-0">
          <div className="mb-2 flex items-center justify-between gap-3">
            <legend className="p-0 text-[15px] font-extrabold">Fields</legend>
            <button type="button" onClick={() => setDraft({ ...draft, fields: [...draft.fields, { key: newKey(), type: "text", label: "", required: false }] })} className={buttonClass("white", "sm")}>
              <Icon name="plus" size={14} /> Add field
            </button>
          </div>
          <div className="grid gap-2">
            {draft.fields.map((field, index) => (
              <div key={field.key} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-[14px] border border-app-line p-2 sm:grid-cols-[130px_minmax(0,1fr)_auto_auto]">
                <select aria-label={`Field ${index + 1} type`} value={field.type} onChange={(e) => updateField(field.key, { type: e.target.value })} className={cx(selectClass, "h-[44px]")}>
                  {FIELD_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
                </select>
                <input aria-label={`Field ${index + 1} label`} value={field.label} onChange={(e) => updateField(field.key, { label: e.target.value })} className={cx(inputClass, "col-span-2 h-[44px] sm:col-span-1")} placeholder="Label, like Phone number" />
                <label className="flex min-h-[40px] items-center gap-2 px-1 text-[13px] font-semibold">
                  <input type="checkbox" checked={field.required} onChange={(e) => updateField(field.key, { required: e.target.checked })} className={checkClass} /> Required
                </label>
                <button type="button" aria-label={`Remove field ${field.label || index + 1}`} onClick={() => setDraft({ ...draft, fields: draft.fields.filter((item) => item.key !== field.key) })} className="grid h-10 w-10 place-items-center justify-self-end rounded-full text-app-danger hover:bg-app-danger-tint">
                  <Icon name="trash" size={16} />
                </button>
              </div>
            ))}
            {draft.fields.length === 0 && <p className="m-0 text-[13.5px] text-app-ink-soft">No fields yet. Add one so shoppers have something to fill in.</p>}
          </div>
        </fieldset>

        {draft.isPopup && (
          <fieldset className="m-0 grid min-w-0 gap-4 rounded-[18px] bg-app-canvas p-4">
            <legend className="sr-only">Popup settings</legend>
            <h3 className="m-0 text-[15px] font-extrabold">Popup settings</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="When it shows" htmlFor="pop-timing">
                <select id="pop-timing" value={popup.timing} onChange={(e) => setPopup({ timing: e.target.value as PopupSettings["timing"] })} className={selectClass}>
                  <option value="immediate">Straight away</option>
                  <option value="delay">After a few seconds</option>
                  <option value="exit_intent">When they&apos;re about to leave</option>
                </select>
              </Field>
              {popup.timing === "delay" && (
                <Field label="Seconds to wait" htmlFor="pop-delay">
                  <input id="pop-delay" type="number" value={popup.delaySeconds} min={1} max={60} onChange={(e) => setPopup({ delaySeconds: Number(e.target.value) })} className={inputClass} />
                </Field>
              )}
              <Field label="Pages" htmlFor="pop-pages">
                <select id="pop-pages" value={popup.pages} onChange={(e) => setPopup({ pages: e.target.value as PopupSettings["pages"] })} className={selectClass}>
                  <option value="all">Every page</option>
                  <option value="home">Home page only</option>
                  <option value="product">Product pages</option>
                </select>
              </Field>
              <Field label="How often" htmlFor="pop-frequency">
                <select id="pop-frequency" value={popup.frequency} onChange={(e) => setPopup({ frequency: e.target.value as PopupSettings["frequency"] })} className={selectClass}>
                  <option value="once">Once per shopper</option>
                  <option value="session">Once per visit</option>
                  <option value="always">Every time</option>
                </select>
              </Field>
              <Field label="After they send it" htmlFor="pop-after">
                <select id="pop-after" value={popup.afterSubmit} onChange={(e) => setPopup({ afterSubmit: e.target.value as PopupSettings["afterSubmit"] })} className={selectClass}>
                  <option value="add_subscriber">Add them as a subscriber</option>
                  <option value="message">Show a message</option>
                  <option value="notify">Tell me</option>
                  <option value="redirect">Open another page</option>
                </select>
              </Field>
              {popup.afterSubmit === "message" && (
                <Field label="Thank-you message" htmlFor="pop-message">
                  <input id="pop-message" value={popup.message} onChange={(e) => setPopup({ message: e.target.value })} className={inputClass} placeholder="Thanks for joining!" />
                </Field>
              )}
              {popup.afterSubmit === "redirect" && (
                <Field label="Page address" htmlFor="pop-url">
                  <input id="pop-url" type="url" value={popup.redirectUrl} onChange={(e) => setPopup({ redirectUrl: e.target.value })} className={inputClass} placeholder="https://" />
                </Field>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {(["mobile", "desktop"] as const).map((device) => (
                <label key={device} className="flex min-h-[44px] cursor-pointer items-center gap-2.5 rounded-[14px] border border-app-line bg-white px-3.5 text-[14px]">
                  <input
                    type="checkbox"
                    checked={popup.devices.includes(device)}
                    onChange={() => setPopup({ devices: popup.devices.includes(device) ? popup.devices.filter((d) => d !== device) : [...popup.devices, device] })}
                    className={checkClass}
                  />
                  Show on {device === "mobile" ? "phones" : "computers"}
                </label>
              ))}
            </div>
          </fieldset>
        )}

        {error && <Notice>{error}</Notice>}
        <div className="flex flex-wrap justify-end gap-2">
          <PillButton size="md" tone="white" onClick={onClose}>Cancel</PillButton>
          <PillButton size="md" type="submit" busy={saving}>{editing ? "Save changes" : "Create"}</PillButton>
        </div>
      </form>
    </Modal>
  );
}

export function FormsManager({ forms }: { forms: ManagedForm[] }) {
  const router = useRouter();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["value"]>("all");
  const [editor, setEditor] = useState<{ editing: ManagedForm | null; popup: boolean } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function act(id: string, run: () => Promise<void>) {
    setBusy(id);
    setError(null);
    try {
      await run();
      router.refresh();
    } catch (actError) {
      setError(actError instanceof Error ? actError.message : "Something went wrong. Try again.");
    } finally {
      setBusy(null);
    }
  }

  const shown = forms.filter((form) => (filter === "all" ? true : filter === "popup" ? form.isPopup : !form.isPopup));
  const count = (value: (typeof FILTERS)[number]["value"]) => forms.filter((form) => (value === "all" ? true : value === "popup" ? form.isPopup : !form.isPopup)).length;

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Show">
          {FILTERS.map((item) => (
            <button
              key={item.value}
              type="button"
              aria-pressed={filter === item.value}
              onClick={() => setFilter(item.value)}
              className={cx("inline-flex min-h-[40px] items-center rounded-full border px-4 text-[14px] font-bold", filter === item.value ? "border-app-ink bg-app-ink text-white" : "border-app-line bg-white hover:border-app-line-strong")}
            >
              {item.label}
              <span className={cx("ml-1", filter === item.value ? "text-white" : "text-app-ink-soft")}>· {count(item.value)}</span>
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <PillButton size="md" tone="white" onClick={() => setEditor({ editing: null, popup: false })}><Icon name="plus" size={16} /> New form</PillButton>
          <PillButton size="md" tone="accent" onClick={() => setEditor({ editing: null, popup: true })}><Icon name="plus" size={16} /> New popup</PillButton>
        </div>
      </div>

      {error && <Notice>{error}</Notice>}

      {shown.length ? (
        <ListCard>
          {shown.map((form) => (
            <ListRow key={form.id}>
              <div className="min-w-0 flex-1 basis-full sm:basis-auto">
                <div className="truncate text-[15px] font-extrabold">{form.name}</div>
                <div className="truncate text-[13px] text-app-ink-soft">
                  {PURPOSES.find((purpose) => purpose.value === form.purpose)?.label ?? humanize(form.purpose)} · {form.fields.length} field{form.fields.length === 1 ? "" : "s"} · made {formatDate(form.createdAt)}
                </div>
              </div>
              <Pill tone={form.isPopup ? "accent" : "muted"}>{form.isPopup ? "Popup" : "Form"}</Pill>
              <div className="flex items-center gap-2 text-[13px] font-bold">
                {form.active ? "On" : "Off"}
                <Toggle on={form.active} onChange={(on) => void act(form.id, () => send(`/api/store/forms/${form.id}`, "PATCH", { active: on }))} label={`${form.name} is ${form.active ? "on" : "off"}`} />
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => setEditor({ editing: form, popup: form.isPopup })} className={buttonClass("white", "sm")}>Edit</button>
                <button
                  type="button"
                  disabled={busy === form.id}
                  onClick={() => {
                    if (window.confirm(`Delete "${form.name}"?`)) void act(form.id, () => send(`/api/store/forms/${form.id}`, "DELETE"));
                  }}
                  className={buttonClass("danger", "sm")}
                >
                  Delete
                </button>
              </div>
            </ListRow>
          ))}
        </ListCard>
      ) : (
        <EmptyState icon="file" title={forms.length ? "Nothing here" : "No forms yet"}>
          Make a form or popup to collect emails and questions from shoppers.
        </EmptyState>
      )}

      {editor && (
        <FormEditor
          editing={editor.editing}
          startAsPopup={editor.popup}
          onClose={() => setEditor(null)}
          onSaved={() => {
            setEditor(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
