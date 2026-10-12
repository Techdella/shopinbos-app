"use client";

import { useId, useState } from "react";
import type { FormDesign, FormField } from "@/lib/marketing/forms";

// The sign-up form shoppers fill in: used inside storefront pop-ups and on the hosted /join page.
// Email consent is a separate, unticked box (consent must be given, not assumed).

export interface SignupColors {
  ink: string;
  paper: string;
  accent: string;
  accentText: string;
}

export interface SignupResult {
  code: string | null;
  message: string;
  alreadySubscribed: boolean;
}

function visitorKey(slug: string) {
  try {
    return localStorage.getItem(`visitor:${slug}`) ?? undefined;
  } catch {
    return undefined;
  }
}

export function SignupForm({
  storeSlug,
  formId,
  fields,
  design,
  colors,
  onDone,
  compact = false,
}: {
  storeSlug: string;
  formId: string;
  fields: FormField[];
  design: FormDesign;
  colors: SignupColors;
  onDone: (result: SignupResult) => void;
  compact?: boolean;
}) {
  const uid = useId();
  const [values, setValues] = useState<Record<string, string | boolean>>({});
  const [emailOk, setEmailOk] = useState(false);
  const [smsOk, setSmsOk] = useState(false);
  const [whatsappOk, setWhatsappOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasPhone = fields.some((field) => field.type === "phone");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!emailOk) {
      setError("Tick the box to agree to emails.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/public/store/${encodeURIComponent(storeSlug)}/marketing/subscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ formId, visitorKey: visitorKey(storeSlug), values, consent: { email: true, sms: smsOk, whatsapp: whatsappOk } }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error?.message ?? "Something went wrong. Try again.");
      try {
        localStorage.setItem(`sib-subscribed:${storeSlug}`, "1");
        const email = fields.find((field) => field.type === "email");
        if (email && typeof values[email.key] === "string") localStorage.setItem(`visitor-email:${storeSlug}`, String(values[email.key]));
      } catch {}
      onDone({ code: json?.data?.code ?? null, message: json?.data?.message ?? design.successMessage, alreadySubscribed: Boolean(json?.data?.alreadySubscribed) });
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const input = "h-12 w-full min-w-0 rounded-xl border bg-white px-4 text-[15px] outline-none focus:ring-2";
  const ring = { borderColor: `${colors.ink}33`, color: "#16141F", ["--tw-ring-color" as string]: colors.accent };

  return (
    <form onSubmit={(event) => void submit(event)} className={compact ? "grid gap-2.5" : "grid gap-3"} noValidate>
      {fields.map((field) => {
        const id = `${uid}-${field.key}`;
        const label = field.label || (field.type === "email" ? "Email" : field.key);
        const set = (value: string | boolean) => setValues((current) => ({ ...current, [field.key]: value }));
        if (field.type === "checkbox") {
          return (
            <label key={field.key} htmlFor={id} className="flex min-h-[40px] items-center gap-2.5 text-[14px]">
              <input id={id} type="checkbox" checked={values[field.key] === true} onChange={(event) => set(event.target.checked)} className="h-[18px] w-[18px]" style={{ accentColor: colors.accent }} />
              {label}
            </label>
          );
        }
        return (
          <div key={field.key} className="grid gap-1">
            <label htmlFor={id} className="text-[13px] font-semibold">
              {label}
              {field.required ? "" : " (optional)"}
            </label>
            {field.type === "textarea" ? (
              <textarea id={id} rows={3} className={`${input} h-auto py-3`} style={ring} required={field.required} onChange={(event) => set(event.target.value)} />
            ) : field.type === "select" || field.type === "radio" ? (
              <select id={id} className={input} style={ring} required={field.required} defaultValue="" onChange={(event) => set(event.target.value)}>
                <option value="" disabled>Choose</option>
                {(field.options ?? []).map((option) => <option key={option}>{option}</option>)}
              </select>
            ) : (
              <input
                id={id}
                type={field.type === "email" ? "email" : field.type === "phone" ? "tel" : "text"}
                inputMode={field.type === "phone" ? "tel" : field.type === "email" ? "email" : undefined}
                autoComplete={field.type === "email" ? "email" : field.type === "phone" ? "tel" : field.type === "birthday" ? "bday" : /name/i.test(label) ? "name" : undefined}
                placeholder={field.type === "birthday" ? "DD/MM" : undefined}
                className={input}
                style={ring}
                required={field.required}
                onChange={(event) => set(event.target.value)}
              />
            )}
          </div>
        );
      })}
      <label className="flex items-start gap-2.5 text-[12.5px] leading-[1.45] opacity-90">
        <input type="checkbox" checked={emailOk} onChange={(event) => setEmailOk(event.target.checked)} className="mt-0.5 h-[18px] w-[18px] shrink-0" style={{ accentColor: colors.accent }} />
        <span>{design.consentText}</span>
      </label>
      {design.askSmsConsent && hasPhone ? (
        <>
          {/* One tick box per channel: SMS and WhatsApp permission are recorded separately. */}
          <label className="flex items-start gap-2.5 text-[12.5px] leading-[1.45] opacity-90">
            <input type="checkbox" checked={whatsappOk} onChange={(event) => setWhatsappOk(event.target.checked)} className="mt-0.5 h-[18px] w-[18px] shrink-0" style={{ accentColor: colors.accent }} />
            <span>Send me offers on WhatsApp. Reply STOP any time.</span>
          </label>
          <label className="flex items-start gap-2.5 text-[12.5px] leading-[1.45] opacity-90">
            <input type="checkbox" checked={smsOk} onChange={(event) => setSmsOk(event.target.checked)} className="mt-0.5 h-[18px] w-[18px] shrink-0" style={{ accentColor: colors.accent }} />
            <span>Send me offers by SMS. Reply STOP any time.</span>
          </label>
        </>
      ) : null}
      {error ? <p role="alert" className="m-0 text-[13px] font-semibold text-[#B42318]">{error}</p> : null}
      <button
        type="submit"
        disabled={busy}
        className="min-h-[48px] rounded-full px-6 text-[15px] font-bold transition disabled:opacity-60"
        style={{ background: colors.accent, color: colors.accentText }}
      >
        {busy ? "Signing you up…" : design.buttonText}
      </button>
    </form>
  );
}

export function SignupSuccess({ result, colors }: { result: SignupResult; colors: SignupColors }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="grid gap-3" role="status">
      <p className="m-0 text-[16px] font-semibold">{result.alreadySubscribed ? "You're already on the list. Thanks!" : result.message}</p>
      {result.code ? (
        <div className="grid gap-2">
          <p className="m-0 text-[14px] opacity-80">Your code (one use):</p>
          <div className="flex flex-wrap items-center gap-2">
            <code className="rounded-xl border px-4 py-2.5 text-[18px] font-bold tracking-wider" style={{ borderColor: `${colors.ink}33` }}>{result.code}</code>
            <button
              type="button"
              className="min-h-[44px] rounded-full px-5 text-[14px] font-bold"
              style={{ background: colors.accent, color: colors.accentText }}
              onClick={() => {
                void navigator.clipboard?.writeText(result.code!).then(() => setCopied(true)).catch(() => null);
              }}
            >
              {copied ? "Copied" : "Copy code"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
