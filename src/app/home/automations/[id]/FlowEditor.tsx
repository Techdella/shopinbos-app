"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardHead } from "@/components/app-kit";
import { Notice, PillButton, Toggle } from "@/components/app-ui";
import { Icon } from "@/components/ui/Icon";
import { Modal } from "@/components/growth/Modal";
import { Field, buttonClass, inputClass, selectClass, textareaClass } from "@/components/growth/kit";
import { CONDITION_LABEL, STEP_LABEL, TRIGGER_INFO, describeStep, stepProblems, stepWarnings, type FlowCondition, type FlowStep, type FlowStepType, type FlowTrigger } from "@/lib/marketing/flows";
import { TEMPLATE_PRESETS, purposeOfTrigger, variableCount } from "@/lib/marketing/text-channels";
import { ChannelHelp, SmsCounter, TemplateStatusPill, VariableMapper, WhatsAppBubble, type TemplateOption } from "../../marketing/_kit/text";
import { EmailComposer } from "../../marketing/_kit/EmailComposer";
import { EmailPreview, VariableChips, api, errorText, insertAtCursor } from "../../marketing/_kit/client";
import { useT } from "@/components/i18n/I18nProvider";

interface Initial {
  id: string | null;
  name: string;
  description: string;
  trigger: FlowTrigger;
  active: boolean;
  steps: FlowStep[];
  days: number;
}

// Triggers the seller can pick; post_purchase / review_request duplicate payment_received / order_delivered.
const TRIGGERS: FlowTrigger[] = ["welcome_email", "abandoned_checkout", "browse_abandonment", "order_placed", "payment_received", "order_shipped", "order_delivered", "new_customer", "win_back", "birthday"];
const ADDABLE: FlowStepType[] = ["wait", "condition", "send_email", "send_whatsapp", "send_sms", "give_discount", "add_tag", "request_review", "notify_seller"];

function blank(type: FlowStepType): FlowStep {
  switch (type) {
    case "wait":
      return { type, minutes: 1440 };
    case "condition":
      return { type, check: "not_ordered_since_start" };
    case "send_email":
      return { type, subject: "", bodyHtml: "" };
    case "send_sms":
      return { type, message: "{{store}}: hi {{name}}, " };
    case "send_whatsapp":
      return { type, message: "", template: null, variables: [] };
    case "add_tag":
      return { type, tag: "" };
    case "give_discount":
      return { type, percent: 10, days: 7 };
    case "request_review":
      return { type };
    case "notify_seller":
      return { type, message: "{{name}} reached this step." };
  }
}

function waitParts(minutes: number): { amount: number; unit: "minutes" | "hours" | "days" } {
  if (minutes % 1440 === 0) return { amount: minutes / 1440, unit: "days" };
  if (minutes % 60 === 0) return { amount: minutes / 60, unit: "hours" };
  return { amount: minutes, unit: "minutes" };
}
const UNIT = { minutes: 1, hours: 60, days: 1440 } as const;

function TextStep({ value, onChange, label }: { value: string; onChange: (value: string) => void; label: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  return (
    <div className="grid gap-2">
      <VariableChips only={["name", "store", "store_url", "cart_url", "cart_items", "order_number", "product_name", "discount_code"]} onInsert={(token) => onChange(insertAtCursor(ref.current, value, token))} />
      <textarea ref={ref} aria-label={label} rows={4} value={value} onChange={(e) => onChange(e.target.value)} className={textareaClass} maxLength={1000} />
    </div>
  );
}

function EmailStepEditor({ step, templates, onSave, onClose }: { step: Extract<FlowStep, { type: "send_email" }>; templates: Array<{ id: string; name: string }>; onSave: (step: FlowStep) => void; onClose: () => void }) {
  const t = useT("automations", "common");
  const [draft, setDraft] = useState(step);
  return (
    <Modal title={t("fe.email")} onClose={onClose} wide>
      <div className="grid gap-4">
        <Field label={t("fe.subject")} htmlFor="e-subject"><input id="e-subject" value={draft.subject} onChange={(e) => setDraft({ ...draft, subject: e.target.value })} className={inputClass} maxLength={200} /></Field>
        {templates.length ? (
          <Field label={t("fe.orTemplate")} htmlFor="e-template" hint={t("fe.orTemplateHint")}>
            <select id="e-template" value={draft.templateId ?? ""} onChange={(e) => setDraft({ ...draft, templateId: e.target.value || null })} className={selectClass}>
              <option value="">{t("fe.none")}</option>
              {templates.map((tpl) => <option key={tpl.id} value={tpl.id}>{tpl.name}</option>)}
            </select>
          </Field>
        ) : null}
        <EmailComposer value={draft.bodyHtml} onChange={(bodyHtml) => setDraft((d) => ({ ...d, bodyHtml }))} />
        <details>
          <summary className="cursor-pointer text-[14px] font-bold">{t("fe.preview")}</summary>
          <div className="mt-3"><EmailPreview bodyHtml={draft.bodyHtml} subject={draft.subject} /></div>
        </details>
        <div className="flex flex-wrap justify-end gap-2">
          <PillButton size="md" tone="white" onClick={onClose}>{t("cancel")}</PillButton>
          <PillButton size="md" onClick={() => onSave(draft)} disabled={!draft.subject.trim() && !draft.templateId}>{t("done")}</PillButton>
        </div>
      </div>
    </Modal>
  );
}

interface TextChannelInfo {
  ready: boolean;
  templates: boolean;
  howTo: string;
  connectHref: string | null;
  connectLabel: string | null;
}

/** The WhatsApp step: an approved template (or a ready-made one, used once approved) and what fills it. */
function WhatsAppStep({ step, onChange, waTemplates, whatsapp }: { step: Extract<FlowStep, { type: "send_whatsapp" }>; onChange: (step: FlowStep) => void; waTemplates: TemplateOption[]; whatsapp: TextChannelInfo }) {
  const t = useT("automations");
  const tm = useT("marketing");
  const preset = step.template?.startsWith("preset:") ? TEMPLATE_PRESETS.find((p) => p.key === step.template!.slice(7)) ?? null : null;
  const chosen: TemplateOption | null = preset
    ? { id: step.template!, name: preset.name, language: "en", category: preset.category, status: waTemplates.some((tpl) => tpl.status === "APPROVED" && tpl.preset === preset.key) ? "APPROVED" : "DRAFT", rejectedReason: null, content: preset.content, variables: [...preset.variables] }
    : waTemplates.find((tpl) => tpl.id === step.template) ?? null;
  return (
    <div className="grid gap-3">
      {!whatsapp.templates ? (
        <p className="m-0 text-[13px] text-app-ink-soft">
          <ChannelHelp label={t("fe.notConnected")} howTo={t("fe.waSkipped")} href={whatsapp.connectHref} linkLabel={whatsapp.connectLabel} />
        </p>
      ) : null}
      <select
        aria-label={t("fe.waTemplate")}
        className={selectClass}
        value={step.template ?? ""}
        onChange={(e) => {
          const value = e.target.value;
          const next = value.startsWith("preset:") ? TEMPLATE_PRESETS.find((p) => p.key === value.slice(7))?.variables ?? [] : waTemplates.find((tpl) => tpl.id === value)?.variables ?? [];
          onChange({ ...step, template: value || null, variables: [...next] });
        }}
      >
        <option value="">{t("fe.freeText")}</option>
        {waTemplates.length ? (
          <optgroup label={t("fe.yourTemplates")}>
            {waTemplates.map((tpl) => (
              <option key={tpl.id} value={tpl.id} disabled={tpl.status !== "APPROVED"}>{tpl.name} ({tpl.language}){tpl.status !== "APPROVED" ? ` · ${tpl.status.toLowerCase()}` : ""}</option>
            ))}
          </optgroup>
        ) : null}
        <optgroup label={t("fe.readyMade")}>
          {TEMPLATE_PRESETS.map((p) => <option key={p.key} value={`preset:${p.key}`}>{tm.dynamic(`wa.preset.${p.key}.title`, p.title)}</option>)}
        </optgroup>
      </select>
      {chosen ? (
        <>
          <div className="flex flex-wrap items-center gap-2 text-[13px]">
            <TemplateStatusPill status={chosen.status} />
            {preset && chosen.status !== "APPROVED" ? <a href="/home/marketing/whatsapp" className="font-bold text-app-accent-ink no-underline hover:underline">{t("fe.submitPreset", { title: tm.dynamic(`wa.preset.${preset.key}.title`, preset.title) })}</a> : null}
          </div>
          <VariableMapper template={chosen} value={step.variables ?? []} onChange={(variables) => onChange({ ...step, variables })} />
          {chosen.content.header.format === "IMAGE" ? (
            <input aria-label={t("fe.headerImage")} value={step.headerImageUrl ?? ""} onChange={(e) => onChange({ ...step, headerImageUrl: e.target.value.trim() || null })} className={inputClass} placeholder={t("fe.headerImagePlaceholder")} />
          ) : null}
          <WhatsAppBubble content={chosen.content} mapping={step.variables?.some(Boolean) ? step.variables : chosen.variables} headerImageUrl={step.headerImageUrl} />
        </>
      ) : (
        <TextStep label={t("fe.waMessage")} value={step.message} onChange={(message) => onChange({ ...step, message })} />
      )}
    </div>
  );
}

export function FlowEditor({
  initial,
  segments,
  templates,
  waTemplates = [],
  channels,
}: {
  initial: Initial;
  segments: Array<{ id: string; name: string }>;
  templates: Array<{ id: string; name: string }>;
  waTemplates?: TemplateOption[];
  channels?: { sms: TextChannelInfo; whatsapp: TextChannelInfo };
}) {
  const router = useRouter();
  const t = useT("automations", "common");
  const triggerLabel = (trigger: FlowTrigger) => t.dynamic(`trigger.${trigger}`, TRIGGER_INFO[trigger].label);
  const stepLabel = (type: FlowStepType) => t.dynamic(`step.${type}`, STEP_LABEL[type]);
  const [flow, setFlow] = useState(initial);
  const [editingEmail, setEditingEmail] = useState<number | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const setStep = (index: number, step: FlowStep) => setFlow((f) => ({ ...f, steps: f.steps.map((s, i) => (i === index ? step : s)) }));
  const move = (index: number, delta: number) =>
    setFlow((f) => {
      const target = index + delta;
      if (target < 0 || target >= f.steps.length) return f;
      const steps = [...f.steps];
      [steps[index], steps[target]] = [steps[target], steps[index]];
      return { ...f, steps };
    });

  async function save(active = flow.active) {
    if (active && !flow.active && !window.confirm(t("fe.confirmOn", { name: flow.name || t("fe.thisAutomation") }))) return;
    setBusy("save");
    setError(null);
    setNotice(null);
    try {
      const body = { name: flow.name || TRIGGER_INFO[flow.trigger].label, description: flow.description, trigger: flow.trigger, steps: flow.steps, settings: flow.trigger === "win_back" ? { days: flow.days } : {}, active };
      const saved = flow.id ? await api<{ id: string }>(`/api/app/marketing/automations/${flow.id}`, "PATCH", body) : await api<{ id: string }>("/api/app/marketing/automations", "POST", body);
      setFlow((f) => ({ ...f, id: saved.id, active }));
      setNotice(active ? t("fe.savedOn") : t("fe.savedOff"));
      if (!flow.id) router.replace(`/home/automations/${saved.id}`);
      else router.refresh();
    } catch (saveError) {
      setError(errorText(saveError));
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    if (!flow.id || !window.confirm(t("fe.confirmDelete"))) return;
    setBusy("delete");
    try {
      await api(`/api/app/marketing/automations/${flow.id}`, "DELETE");
      router.push("/home/automations");
    } catch (deleteError) {
      setError(errorText(deleteError));
      setBusy(null);
    }
  }

  const editing = editingEmail !== null ? flow.steps[editingEmail] : null;

  return (
    <div className="grid gap-5">
      {error ? <Notice>{error}</Notice> : null}
      {notice ? <Notice tone="success">{notice}</Notice> : null}

      <Card className="grid gap-4 p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardHead title={t("fe.setup")} />
          <label className="flex items-center gap-3 text-[14px] font-bold">
            {flow.active ? t("status.active") : t("status.inactive")}
            <Toggle on={flow.active} onChange={(on) => void save(on)} label={t("fe.automationOn")} />
          </label>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label={t("fe.name")} htmlFor="fl-name"><input id="fl-name" value={flow.name} onChange={(e) => setFlow({ ...flow, name: e.target.value })} className={inputClass} maxLength={80} /></Field>
          <Field label={t("fe.startsWhen")} htmlFor="fl-trigger" hint={t.dynamic(`trigger.${flow.trigger}.sub`, TRIGGER_INFO[flow.trigger].sub)}>
            <select id="fl-trigger" value={flow.trigger} onChange={(e) => setFlow({ ...flow, trigger: e.target.value as FlowTrigger })} className={selectClass}>
              {TRIGGERS.map((trigger) => <option key={trigger} value={trigger}>{triggerLabel(trigger)}</option>)}
            </select>
          </Field>
          {flow.trigger === "win_back" ? (
            <Field label={t("fe.daysWithout")} htmlFor="fl-days"><input id="fl-days" type="number" min={7} max={3650} value={flow.days} onChange={(e) => setFlow({ ...flow, days: Number(e.target.value) })} className={inputClass} /></Field>
          ) : null}
        </div>
      </Card>

      <section className="grid gap-3" aria-label={t("fe.steps")}>
        <h2 className="m-0 text-[17px] font-extrabold">{t("fe.steps")}</h2>
        <ol className="m-0 grid list-none gap-3 p-0">
          <li className="flex items-center gap-3 rounded-[18px] bg-app-ink px-4 py-3 text-white">
            <Icon name="bolt" size={16} />
            <span className="text-[14px] font-bold">{triggerLabel(flow.trigger)}</span>
          </li>
          {flow.steps.map((step, index) => (
            <li key={index}>
              <Card className="grid gap-3 p-4">
                <div className="flex items-center gap-1">
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-app-canvas text-[12px] font-extrabold">{index + 1}</span>
                  <strong className="ml-2 mr-auto text-[14.5px]">{stepLabel(step.type)}</strong>
                  <button type="button" aria-label={t("fe.moveUp")} disabled={index === 0} onClick={() => move(index, -1)} className="grid h-9 w-9 place-items-center rounded-full hover:bg-app-canvas disabled:opacity-30"><Icon name="arrowUp" size={15} /></button>
                  <button type="button" aria-label={t("fe.moveDown")} disabled={index === flow.steps.length - 1} onClick={() => move(index, 1)} className="grid h-9 w-9 place-items-center rounded-full hover:bg-app-canvas disabled:opacity-30"><Icon name="arrowDown" size={15} /></button>
                  <button type="button" aria-label={t("fe.removeStep")} onClick={() => setFlow({ ...flow, steps: flow.steps.filter((_, i) => i !== index) })} className="grid h-9 w-9 place-items-center rounded-full text-app-danger hover:bg-app-danger-tint"><Icon name="trash" size={15} /></button>
                </div>

                {step.type === "wait" ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <input aria-label={t("fe.howLong")} type="number" min={1} value={waitParts(step.minutes).amount} onChange={(e) => setStep(index, { type: "wait", minutes: Math.max(1, Number(e.target.value)) * UNIT[waitParts(step.minutes).unit] })} className={`${inputClass} w-[110px]`} />
                    <select aria-label={t("fe.unit")} value={waitParts(step.minutes).unit} onChange={(e) => setStep(index, { type: "wait", minutes: waitParts(step.minutes).amount * UNIT[e.target.value as keyof typeof UNIT] })} className={`${selectClass} w-[140px]`}>
                      <option value={t("fe.minutes")}>{t("fe.minutes")}</option>
                      <option value={t("fe.hours")}>{t("fe.hours")}</option>
                      <option value={t("fe.daysWord")}>{t("fe.daysWord")}</option>
                    </select>
                  </div>
                ) : step.type === "condition" ? (
                  <div className="grid gap-2 sm:grid-cols-2">
                    <select aria-label={t("fe.check")} value={step.check} onChange={(e) => setStep(index, { ...step, check: e.target.value as FlowCondition })} className={selectClass}>
                      {(Object.keys(CONDITION_LABEL) as FlowCondition[]).map((check) => <option key={check} value={check}>{t.dynamic(`check.${check}`, CONDITION_LABEL[check])}</option>)}
                    </select>
                    {step.check === "in_segment" ? (
                      <select aria-label={t("fe.segment")} value={step.segmentId ?? ""} onChange={(e) => setStep(index, { ...step, segmentId: e.target.value || null })} className={selectClass}>
                        <option value="">{t("fe.chooseSegment")}</option>
                        {segments.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                    ) : (
                      <p className="m-0 self-center text-[13px] text-app-ink-soft">{t("fe.ifNot")}</p>
                    )}
                  </div>
                ) : step.type === "send_email" ? (
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="min-w-0 flex-1 truncate text-[14px]">{step.subject || (step.templateId ? t("fe.templateName", { name: templates.find((tpl) => tpl.id === step.templateId)?.name ?? t("fe.missing") }) : t("fe.noSubject"))}</span>
                    <button type="button" className={buttonClass("white", "sm")} onClick={() => setEditingEmail(index)}>{t("fe.editEmail")}</button>
                  </div>
                ) : step.type === "send_whatsapp" ? (
                  <WhatsAppStep step={step} onChange={(next) => setStep(index, next)} waTemplates={waTemplates} whatsapp={channels?.whatsapp ?? { ready: false, templates: false, howTo: "", connectHref: "/home/inbox/chatbot?tab=whatsapp", connectLabel: t("fe.connectWhatsApp") }} />
                ) : step.type === "send_sms" ? (
                  <div className="grid gap-2">
                    <TextStep label={stepLabel(step.type)} value={step.message} onChange={(message) => setStep(index, { ...step, message })} />
                    <SmsCounter text={step.message.replace(/{{\s*[a-z_]+\s*}}/g, "XXXXXXXX")} />
                    {channels && !channels.sms.ready ? (
                      <p className="m-0 text-[13px] text-app-ink-soft"><ChannelHelp label={t("fe.smsNotSetUp")} howTo={t("fe.smsSkipped")} href={channels.sms.connectHref} linkLabel={channels.sms.connectLabel} /></p>
                    ) : null}
                  </div>
                ) : step.type === "add_tag" ? (
                  <input aria-label={t("fe.tag")} value={step.tag} onChange={(e) => setStep(index, { type: "add_tag", tag: e.target.value })} className={inputClass} placeholder={t("fe.tagPlaceholder")} />
                ) : step.type === "give_discount" ? (
                  <div className="flex flex-wrap items-center gap-2 text-[14px]">
                    <input aria-label={t("fe.percentOff")} type="number" min={1} max={90} value={step.percent} onChange={(e) => setStep(index, { ...step, percent: Number(e.target.value) })} className={`${inputClass} w-[90px]`} />
                    <span>{t("fe.offValidFor")}</span>
                    <input aria-label={t("fe.daysValid")} type="number" min={1} max={365} value={step.days} onChange={(e) => setStep(index, { ...step, days: Number(e.target.value) })} className={`${inputClass} w-[90px]`} />
                    <span>{t("fe.daysOneUse", { token: "{{discount_code}}" })}</span>
                  </div>
                ) : step.type === "notify_seller" ? (
                  <TextStep label={t("fe.noteToYou")} value={step.message} onChange={(message) => setStep(index, { type: "notify_seller", message })} />
                ) : (
                  <p className="m-0 text-[13.5px] text-app-ink-soft">{describeStep(step)} {t("fe.reviewNote")}</p>
                )}
                {[...stepProblems(step, { templates: waTemplates.map((tpl) => ({ id: tpl.id, status: tpl.status, variableCount: variableCount(tpl.content) })) }), ...stepWarnings(step)].map((problem) => (
                  <p key={problem} className="m-0 text-[13px] font-semibold text-app-accent-ink">{problem}</p>
                ))}
              </Card>
            </li>
          ))}
        </ol>
        <div className="flex flex-wrap gap-2">
          {ADDABLE.map((type) => (
            <button key={type} type="button" className={buttonClass("white", "sm")} onClick={() => setFlow({ ...flow, steps: [...flow.steps, blank(type)] })} disabled={flow.steps.length >= 20}>
              <Icon name="plus" size={14} /> {stepLabel(type)}
            </button>
          ))}
        </div>
      </section>

      <Card className="flex flex-wrap items-center gap-2 p-4">
        <PillButton size="md" busy={busy === "save"} onClick={() => void save()} disabled={!flow.steps.length}>{t("save")}</PillButton>
        {!flow.active ? <PillButton size="md" tone="accent" onClick={() => void save(true)} disabled={!flow.steps.length}>{t("fe.saveOn")}</PillButton> : null}
        {flow.id ? <PillButton size="md" tone="white" className="text-app-danger sm:ml-auto" busy={busy === "delete"} onClick={() => void remove()}>{t("delete")}</PillButton> : null}
        <p className="m-0 w-full text-[12.5px] text-app-ink-soft">
          {t("fe.footer")}{" "}
          {purposeOfTrigger(flow.trigger) === "transactional" ? t("fe.transactional") : t("fe.marketing")}
        </p>
      </Card>

      {editing && editing.type === "send_email" ? (
        <EmailStepEditor
          step={editing}
          templates={templates}
          onClose={() => setEditingEmail(null)}
          onSave={(step) => {
            setStep(editingEmail!, step);
            setEditingEmail(null);
          }}
        />
      ) : null}
    </div>
  );
}
