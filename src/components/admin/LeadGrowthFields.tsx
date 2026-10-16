"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { EmailPreviewIframe } from "@/app/home/marketing/_kit/EmailFrame";
import { previewLeadAudience, sendLeadTest } from "@/app/actions/admin-lead-growth";
import { Notice, PillButton, Segmented, TextInput, cx } from "@/components/app-ui";
import { Field, checkClass, selectClass, textareaClass } from "@/components/growth/kit";
import { html, platformEmail, type PlatformLegal } from "@/lib/email/shell";
import { CHANNEL_LABELS, LEAD_CHANNELS, personalise, smsParts, type LeadAudienceType, type LeadChannel } from "@/lib/lead-growth/pure";

// Pieces shared by the lead campaign and lead automation editors (/admin/lead-campaigns): who it reaches (with a
// live count per channel), the message for one channel, its preview and a test send.

export type MessageDraft = {
  channel: LeadChannel;
  subject: string;
  body: string;
  ctaLabel: string;
  ctaUrl: string;
  waTemplate: string;
  waLanguage: string;
};

export type Readiness = Record<LeadChannel, boolean>;

export const EMPTY_AUDIENCE: LeadAudienceType = { kinds: [], statuses: ["new", "contacted"], consentOnly: true, sinceDays: 0, source: "" };

export function draftToContent(draft: MessageDraft) {
  return {
    channel: draft.channel,
    subject: draft.channel === "email" ? draft.subject : null,
    body: draft.body,
    ctaLabel: draft.channel === "email" ? draft.ctaLabel : null,
    ctaUrl: draft.channel === "email" ? draft.ctaUrl : null,
    waTemplate: draft.channel === "whatsapp" ? draft.waTemplate : null,
    waLanguage: draft.channel === "whatsapp" ? draft.waLanguage : null,
  };
}

const SETUP: Record<LeadChannel, string> = {
  email: "Email isn't set up: add RESEND_API_KEY (and RESEND_FROM_EMAIL) in Vercel.",
  sms: "SMS isn't set up: add Termii, Africa's Talking or Sendchamp keys (SMS_PROVIDER) in Vercel.",
  whatsapp: "WhatsApp isn't set up: add Africa's Talking or Sendchamp keys in Vercel.",
};

export function AudiencePicker({ value, onChange, kinds }: { value: LeadAudienceType; onChange: (next: LeadAudienceType) => void; kinds: Array<{ key: string; label: string }> }) {
  const [counts, setCounts] = useState<{ all: number; email: number; sms: number; whatsapp: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const key = JSON.stringify(value);

  useEffect(() => {
    let live = true;
    const timer = setTimeout(async () => {
      const result = await previewLeadAudience(JSON.parse(key));
      if (!live) return;
      if (result.ok) {
        setCounts(result.counts);
        setError(null);
      } else setError(result.error);
    }, 350);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [key]);

  const toggleKind = (kind: string) => onChange({ ...value, kinds: value.kinds.includes(kind) ? value.kinds.filter((k) => k !== kind) : [...value.kinds, kind] });
  const toggleStatus = (status: "new" | "contacted") => {
    const next = value.statuses.includes(status) ? value.statuses.filter((s) => s !== status) : [...value.statuses, status];
    onChange({ ...value, statuses: next.length ? next : [status === "new" ? "contacted" : "new"] });
  };

  return (
    <div className="flex flex-col gap-4">
      <Field label="Which forms" hint="Leave all off for every form.">
        <div className="flex flex-wrap gap-2">
          {kinds.map((kind) => (
            <button
              key={kind.key}
              type="button"
              aria-pressed={value.kinds.includes(kind.key)}
              onClick={() => toggleKind(kind.key)}
              className={cx("min-h-[36px] rounded-full border px-3.5 text-[13px] font-bold transition", value.kinds.includes(kind.key) ? "border-app-ink bg-app-ink text-white" : "border-app-line bg-white text-app-ink hover:border-app-line-strong")}
            >
              {kind.label}
            </button>
          ))}
        </div>
      </Field>
      <div className="grid gap-4 md:grid-cols-3">
        <Field label="Lead status">
          <div className="flex flex-col gap-2 pt-1 text-[14px]">
            {(["new", "contacted"] as const).map((status) => (
              <label key={status} className="flex items-center gap-2">
                <input type="checkbox" className={checkClass} checked={value.statuses.includes(status)} onChange={() => toggleStatus(status)} />
                {status === "new" ? "New" : "Contacted"}
              </label>
            ))}
          </div>
        </Field>
        <Field label="Came in" htmlFor="aud-since">
          <select id="aud-since" className={selectClass} value={value.sinceDays} onChange={(e) => onChange({ ...value, sinceDays: Number(e.target.value) })}>
            <option value={0}>Any time</option>
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
            <option value={365}>Last year</option>
          </select>
        </Field>
        <Field label="Source contains" htmlFor="aud-source" hint="A page, partner or campaign name.">
          <TextInput id="aud-source" value={value.source} maxLength={120} placeholder="e.g. instagram" onChange={(e) => onChange({ ...value, source: e.target.value })} />
        </Field>
      </div>
      <label className="flex items-start gap-2 text-[14px]">
        <input type="checkbox" className={cx(checkClass, "mt-0.5")} checked={value.consentOnly} onChange={(e) => onChange({ ...value, consentOnly: e.target.checked })} />
        <span>
          <b>Only people who agreed to messages</b>
          <span className="block text-[12.5px] text-app-ink-soft">Recommended. Turning this off reaches people who only asked for one thing (a guide, a reply), which is more likely to be seen as spam.</span>
        </span>
      </label>
      <div className="rounded-[14px] bg-app-canvas px-4 py-3 text-[13.5px]" aria-live="polite">
        {error ? (
          <span className="text-app-danger">{error}</span>
        ) : counts ? (
          <>
            <b>{counts.all}</b> leads match. Reachable: <b>{counts.email}</b> by email · <b>{counts.sms}</b> by SMS · <b>{counts.whatsapp}</b> on WhatsApp. People who signed up, were closed or opted out are always left out.
          </>
        ) : (
          "Counting…"
        )}
      </div>
    </div>
  );
}

const VARIABLES = ["{{first_name}}", "{{name}}", "{{signup_link}}"];

export function MessageEditor({ value, onChange, readiness, idPrefix }: { value: MessageDraft; onChange: (next: MessageDraft) => void; readiness: Readiness; idPrefix: string }) {
  const set = (patch: Partial<MessageDraft>) => onChange({ ...value, ...patch });
  const parts = value.channel === "sms" ? smsParts(`${value.body}\n\nStop: https://app.shopinbos.com/api/public/leads/opt-out?t=xxxxxxxxxxxxxxxxxxxxxxxxxx`) : 0;
  return (
    <div className="flex flex-col gap-4">
      <Segmented options={LEAD_CHANNELS.map((channel) => ({ value: channel, label: CHANNEL_LABELS[channel] }))} value={value.channel} onChange={(channel) => set({ channel })} />
      {!readiness[value.channel] && <Notice tone="info">{SETUP[value.channel]}</Notice>}
      {value.channel === "email" && (
        <Field label="Subject" htmlFor={`${idPrefix}-subject`}>
          <TextInput id={`${idPrefix}-subject`} value={value.subject} maxLength={160} placeholder="{{first_name}}, your free online store is waiting" onChange={(e) => set({ subject: e.target.value })} />
        </Field>
      )}
      {value.channel === "whatsapp" && (
        <div className="grid gap-4 md:grid-cols-[1fr_140px]">
          <Field label="Approved template name" htmlFor={`${idPrefix}-tpl`} hint="WhatsApp only lets businesses start a chat with an approved template. Its first variable ({{1}}) gets the first name. Leave empty to send the text below (only reaches people who messaged you in the last 24 hours).">
            <TextInput id={`${idPrefix}-tpl`} value={value.waTemplate} maxLength={120} placeholder="lead_welcome" onChange={(e) => set({ waTemplate: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_") })} />
          </Field>
          <Field label="Language" htmlFor={`${idPrefix}-lang`}>
            <TextInput id={`${idPrefix}-lang`} value={value.waLanguage} maxLength={12} placeholder="en" onChange={(e) => set({ waLanguage: e.target.value })} />
          </Field>
        </div>
      )}
      <Field
        label={value.channel === "whatsapp" && value.waTemplate ? "Message (for your records; the template's own text is what's sent)" : "Message"}
        htmlFor={`${idPrefix}-body`}
        hint={
          <>
            Insert:{" "}
            {VARIABLES.map((variable) => (
              <button key={variable} type="button" className="mr-1.5 rounded-md bg-app-canvas px-1.5 py-0.5 font-mono text-[12px] text-app-ink" onClick={() => set({ body: `${value.body}${value.body && !value.body.endsWith(" ") ? " " : ""}${variable}` })}>
                {variable}
              </button>
            ))}
            {value.channel === "sms" && <span className="ml-1">· {value.body.length} characters, about {parts} SMS part{parts === 1 ? "" : "s"} with the opt-out link.</span>}
            {value.channel !== "email" && <span className="ml-1">An opt-out link is added at the end.</span>}
          </>
        }
      >
        <textarea id={`${idPrefix}-body`} className={textareaClass} rows={value.channel === "email" ? 9 : 5} maxLength={5000} value={value.body} onChange={(e) => set({ body: e.target.value })} />
      </Field>
      {value.channel === "email" && (
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Button text" htmlFor={`${idPrefix}-cta`}>
            <TextInput id={`${idPrefix}-cta`} value={value.ctaLabel} maxLength={60} placeholder="Create your free store" onChange={(e) => set({ ctaLabel: e.target.value })} />
          </Field>
          <Field label="Button link" htmlFor={`${idPrefix}-url`} hint="Empty = the sign-up page. UTM tags are added for Analytics.">
            <TextInput id={`${idPrefix}-url`} value={value.ctaUrl} maxLength={500} placeholder="https://app.shopinbos.com/signup" onChange={(e) => set({ ctaUrl: e.target.value })} />
          </Field>
        </div>
      )}
    </div>
  );
}

export function MessagePreview({ value, legal, appUrl }: { value: MessageDraft; legal: PlatformLegal; appUrl: string }) {
  const signup = `${appUrl.replace(/\/+$/, "")}/signup`;
  const vars = { name: "Ada Okafor", signupLink: signup };
  const emailHtml = useMemo(() => {
    if (value.channel !== "email") return "";
    const subject = personalise(value.subject || "Your subject", vars);
    return platformEmail({
      appUrl,
      kind: "lifecycle",
      heading: subject,
      bodyHtml: html.text(personalise(value.body || "Your message", vars)),
      cta: { label: value.ctaLabel || "Create your free store", url: value.ctaUrl || signup },
      reason: "you left your details on shopinbos.com",
      legal,
      unsubscribeUrl: "#",
      preferencesUrl: "#",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, legal, appUrl]);

  if (value.channel === "email") {
    return (
      <div className="overflow-hidden rounded-[18px] border border-app-line bg-app-canvas">
        <div className="border-b border-app-line bg-white px-4 py-2.5 text-[13px]">
          <b>Subject:</b> {personalise(value.subject || "", vars) || <span className="text-app-ink-faint">(no subject)</span>}
        </div>
        <EmailPreviewIframe title="Email preview" html={emailHtml} className="block h-[560px] w-full border-0 bg-white" />
      </div>
    );
  }
  const text = value.channel === "whatsapp" && value.waTemplate ? `Template "${value.waTemplate}" with {{1}} = Ada` : personalise(value.body || "Your message", vars);
  return (
    <div className="rounded-[18px] border border-app-line bg-[#ECE5DD] p-4">
      <div className="max-w-[340px] whitespace-pre-line rounded-[14px] rounded-tl-[4px] bg-white px-3.5 py-2.5 text-[14px] shadow-sm">
        {text}
        {!(value.channel === "whatsapp" && value.waTemplate) && (
          <span className="mt-2 block text-[12.5px] text-app-ink-soft">{value.channel === "sms" ? "Stop: https://…/opt-out" : "Don't want these messages? https://…/opt-out"}</span>
        )}
      </div>
      <p className="mb-0 mt-2 text-[12px] text-app-ink-soft">Preview for a lead called Ada Okafor.</p>
    </div>
  );
}

export function TestSend({ value, name }: { value: MessageDraft; name: string }) {
  const [to, setTo] = useState("");
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const send = () =>
    start(async () => {
      const outcome = await sendLeadTest({ name: name || "Test", content: draftToContent(value), to });
      setResult(outcome.ok ? { ok: true, text: outcome.message ?? "Sent." } : { ok: false, text: outcome.error });
    });
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <TextInput className="min-w-[200px] flex-1" aria-label="Send a test to" value={to} placeholder={value.channel === "email" ? "you@shopinbos.com" : "+234 803 000 0000"} onChange={(e) => setTo(e.target.value)} />
        <PillButton type="button" tone="white" size="sm" busy={pending} disabled={!to.trim() || pending} onClick={send}>
          Send test
        </PillButton>
      </div>
      {result && <Notice tone={result.ok ? "success" : "error"}>{result.text}</Notice>}
    </div>
  );
}
