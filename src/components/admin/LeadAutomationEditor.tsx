"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { saveLeadAutomation } from "@/app/actions/admin-lead-growth";
import { Card, CardHead } from "@/components/app-kit";
import { Notice, PillButton, TextInput, cx } from "@/components/app-ui";
import { Field, checkClass, selectClass } from "@/components/growth/kit";
import type { PlatformLegal } from "@/lib/email/shell";
import { CHANNEL_LABELS, type LeadAudienceType, type LeadStepType } from "@/lib/lead-growth/pure";
import { AudiencePicker, EMPTY_AUDIENCE, MessageEditor, MessagePreview, TestSend, draftToContent, type MessageDraft, type Readiness } from "./LeadGrowthFields";

// /admin/lead-campaigns/automations/new and /[id]: a sequence each new lead walks through (welcome straight away,
// a reminder two days later, a last nudge after a week...). It stops as soon as the lead signs up or opts out.

export type AutomationDraftInput = { id: string | null; name: string; audience: LeadAudienceType; steps: LeadStepType[]; includeExisting: boolean; active: boolean };

type StepDraft = MessageDraft & { delayHours: number };

const DELAYS = [
  { hours: 0, label: "Straight away" },
  { hours: 1, label: "1 hour later" },
  { hours: 6, label: "6 hours later" },
  { hours: 24, label: "1 day later" },
  { hours: 48, label: "2 days later" },
  { hours: 72, label: "3 days later" },
  { hours: 120, label: "5 days later" },
  { hours: 168, label: "1 week later" },
  { hours: 336, label: "2 weeks later" },
  { hours: 720, label: "30 days later" },
];

const DEFAULT_STEPS: StepDraft[] = [
  {
    delayHours: 0,
    channel: "email",
    subject: "Welcome to Shopinbos, {{first_name}}",
    body: "Hi {{first_name}},\n\nThanks for signing up on shopinbos.com. When you're ready, Chip (our AI) will build your online store in about five minutes: your products, your prices, your brand.\n\nNo website skills needed, and it's free to start.",
    ctaLabel: "Build my store",
    ctaUrl: "",
    waTemplate: "",
    waLanguage: "en",
  },
  { delayHours: 48, channel: "whatsapp", subject: "", body: "Hi {{first_name}} 👋 it's the Shopinbos team. Need a hand setting up your online store? Start here and Chip will do most of the work: {{signup_link}}", ctaLabel: "", ctaUrl: "", waTemplate: "", waLanguage: "en" },
  { delayHours: 120, channel: "sms", subject: "", body: "{{first_name}}, sell online this week: free Shopinbos store, built by AI in 5 mins. {{signup_link}}", ctaLabel: "", ctaUrl: "", waTemplate: "", waLanguage: "en" },
];

function toDraft(step: LeadStepType): StepDraft {
  return { delayHours: step.delayHours, channel: step.channel, subject: step.subject ?? "", body: step.body, ctaLabel: step.ctaLabel ?? "", ctaUrl: step.ctaUrl ?? "", waTemplate: step.waTemplate ?? "", waLanguage: step.waLanguage ?? "en" };
}

export function LeadAutomationEditor({ initial, readiness, kinds, legal, appUrl }: { initial: AutomationDraftInput | null; readiness: Readiness; kinds: Array<{ key: string; label: string }>; legal: PlatformLegal; appUrl: string }) {
  const router = useRouter();
  const [name, setName] = useState(initial?.name ?? "New lead welcome");
  const [audience, setAudience] = useState<LeadAudienceType>(initial?.audience ?? EMPTY_AUDIENCE);
  const [includeExisting, setIncludeExisting] = useState(initial?.includeExisting ?? false);
  const [steps, setSteps] = useState<StepDraft[]>(initial?.steps.length ? initial.steps.map(toDraft) : DEFAULT_STEPS);
  const [open, setOpen] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();

  const setStep = (index: number, next: StepDraft) => {
    setSteps((all) => all.map((step, i) => (i === index ? next : step)));
    setSaved(false);
  };
  const move = (index: number, by: number) =>
    setSteps((all) => {
      const next = all.slice();
      const [step] = next.splice(index, 1);
      next.splice(index + by, 0, step);
      return next;
    });

  const save = () =>
    start(async () => {
      setError(null);
      const result = await saveLeadAutomation({ id: initial?.id, name, audience, includeExisting, steps: steps.map((step) => ({ ...draftToContent(step), delayHours: step.delayHours })) });
      if (!result.ok) return setError(result.error);
      setSaved(true);
      if (!initial?.id && result.id) router.push(`/admin/lead-campaigns/automations/${result.id}`);
      else router.refresh();
    });

  let elapsed = 0;
  return (
    <div className="flex flex-col gap-5">
      <Card className="p-5">
        <CardHead title="Name" />
        <TextInput aria-label="Automation name" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />
      </Card>
      <Card className="p-5">
        <CardHead title="Who walks through it" sub="New leads that match go in as they arrive. Anyone who signs up or opts out leaves straight away." />
        <AudiencePicker value={audience} onChange={setAudience} kinds={kinds} />
        <label className="mt-4 flex items-start gap-2 text-[14px]">
          <input type="checkbox" className={cx(checkClass, "mt-0.5")} checked={includeExisting} onChange={(e) => setIncludeExisting(e.target.checked)} />
          <span>
            <b>Also include leads that came in before it was switched on</b>
            <span className="block text-[12.5px] text-app-ink-soft">They start from the first step at once. Off: only leads from the moment you switch it on.</span>
          </span>
        </label>
      </Card>

      <ol className="m-0 flex list-none flex-col gap-3 p-0">
        {steps.map((step, index) => {
          elapsed += step.delayHours;
          const when = elapsed === 0 ? "when the lead comes in" : elapsed < 48 ? `${elapsed} h after they come in` : `day ${Math.round(elapsed / 24)}`;
          return (
            <li key={index}>
              <Card className="p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <button type="button" className="min-w-0 text-left" aria-expanded={open === index} onClick={() => setOpen(open === index ? -1 : index)}>
                    <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-app-ink-soft">Step {index + 1} · {when}</span>
                    <span className="block truncate text-[15.5px] font-bold">
                      {CHANNEL_LABELS[step.channel]}: {step.channel === "email" ? step.subject || "(no subject)" : step.body.slice(0, 70) || "(empty)"}
                    </span>
                  </button>
                  <div className="flex items-center gap-1.5">
                    <PillButton type="button" tone="white" size="sm" disabled={index === 0} onClick={() => move(index, -1)} aria-label={`Move step ${index + 1} up`}>↑</PillButton>
                    <PillButton type="button" tone="white" size="sm" disabled={index === steps.length - 1} onClick={() => move(index, 1)} aria-label={`Move step ${index + 1} down`}>↓</PillButton>
                    <PillButton type="button" tone="white" size="sm" disabled={steps.length === 1} onClick={() => setSteps((all) => all.filter((_, i) => i !== index))}>Remove</PillButton>
                  </div>
                </div>
                {open === index && (
                  <div className="mt-4 grid gap-5 xl:grid-cols-[minmax(0,1fr)_400px]">
                    <div className="flex min-w-0 flex-col gap-4">
                      <Field label={index === 0 ? "Send" : "After the previous step, wait"} htmlFor={`delay-${index}`}>
                        <select id={`delay-${index}`} className={selectClass} value={step.delayHours} onChange={(e) => setStep(index, { ...step, delayHours: Number(e.target.value) })}>
                          {DELAYS.some((d) => d.hours === step.delayHours) ? null : <option value={step.delayHours}>{step.delayHours} hours</option>}
                          {DELAYS.map((delay) => (
                            <option key={delay.hours} value={delay.hours}>{index === 0 && delay.hours === 0 ? "Straight away" : delay.label.replace(" later", index === 0 ? " after they come in" : "")}</option>
                          ))}
                        </select>
                      </Field>
                      <MessageEditor idPrefix={`step-${index}`} value={step} onChange={(next) => setStep(index, { ...next, delayHours: step.delayHours })} readiness={readiness} />
                    </div>
                    <div className="flex min-w-0 flex-col gap-4">
                      <MessagePreview value={step} legal={legal} appUrl={appUrl} />
                      <TestSend value={step} name={name} />
                    </div>
                  </div>
                )}
              </Card>
            </li>
          );
        })}
      </ol>
      <div>
        <PillButton
          type="button"
          tone="white"
          size="sm"
          disabled={steps.length >= 10}
          onClick={() => {
            setSteps((all) => [...all, { ...DEFAULT_STEPS[2], delayHours: 72 }]);
            setOpen(steps.length);
          }}
        >
          + Add a step
        </PillButton>
      </div>

      {error && <Notice>{error}</Notice>}
      {saved && <Notice tone="success">Saved.{initial?.active ? " Changes apply to the next steps people get." : ""}</Notice>}
      <div className="flex flex-wrap gap-2">
        <PillButton type="button" busy={pending} disabled={pending} onClick={save}>
          {initial?.id ? "Save changes" : "Save automation"}
        </PillButton>
      </div>
    </div>
  );
}
