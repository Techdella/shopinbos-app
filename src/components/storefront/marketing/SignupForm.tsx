"use client";

import { useId, useState } from "react";
import type { FormDesign, FormField } from "@/lib/marketing/forms";
import { rememberWonCode } from "@/components/storefront/gamification/client";
import { formatStoreMoney } from "@/lib/storefront/shopper-info";

// The sign-up form shoppers fill in: used inside storefront pop-ups and on the hosted /join page.
// Email consent is a separate, unticked box (consent must be given, not assumed).

export interface SignupColors {
  ink: string;
  paper: string;
  accent: string;
  accentText: string;
  /** The store theme's heading font stack (pop-ups can use it for the headline). */
  heading?: string;
}

/** Corner rounding for inputs and the button, in px (999 = pill). */
export interface SignupShape {
  input: number;
  button: number;
}

export interface SignupReward {
  label: string;
  expiresAt: string | null;
  minOrder: number;
  /** They signed up before: this is the code they already had. */
  again: boolean;
}

export interface SignupResult {
  code: string | null;
  message: string;
  alreadySubscribed: boolean;
  reward?: SignupReward | null;
  /** They already had (and used, or let end) their one code from this form. */
  rewardSpent?: boolean;
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
  shape,
  preview = false,
}: {
  storeSlug: string;
  formId: string;
  fields: FormField[];
  design: FormDesign;
  colors: SignupColors;
  onDone: (result: SignupResult) => void;
  compact?: boolean;
  shape?: SignupShape;
  /** Seller's preview: looks real, sends nothing. */
  preview?: boolean;
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
    if (preview) return;
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
      const code: string | null = json?.data?.code ?? null;
      const reward: SignupReward | null = json?.data?.reward ?? null;
      // Kept on this device and put on the bag, so checkout fills it in (and offers it again later).
      if (code) rememberWonCode(storeSlug, { code, label: reward?.label ?? "Your reward", expiresAt: reward?.expiresAt ?? null, minOrder: reward?.minOrder ?? 0, gift: null, source: "signup" });
      onDone({ code, message: json?.data?.message ?? design.successMessage, alreadySubscribed: Boolean(json?.data?.alreadySubscribed), reward, rewardSpent: Boolean(json?.data?.rewardSpent) });
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const input = "h-12 w-full min-w-0 rounded-xl border bg-white px-4 text-[15px] outline-none focus:ring-2";
  const ring = { borderColor: `${colors.ink}33`, color: "#16141F", ["--tw-ring-color" as string]: colors.accent, ...(shape ? { borderRadius: shape.input } : {}) };

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
        style={{ background: colors.accent, color: colors.accentText, ...(shape ? { borderRadius: shape.button } : {}) }}
      >
        {busy ? "Signing you up…" : design.buttonText}
      </button>
    </form>
  );
}

function endsOn(iso: string | null) {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleDateString("en-NG", { day: "numeric", month: "short" });
}

/**
 * After signing up: their message, and the reward code big and easy to copy, with what it's for and a way back
 * to shopping. The code is already on their bag, so checkout fills it in.
 */
export function SignupSuccess({
  result,
  colors,
  shape,
  onShop,
  shopHref,
  currency = "NGN",
}: {
  result: SignupResult;
  colors: SignupColors;
  shape?: SignupShape;
  /** "Shop now" closes the pop-up… */
  onShop?: () => void;
  /** …or goes to the shop (sign-up pages). */
  shopHref?: string;
  currency?: string;
}) {
  const [copied, setCopied] = useState(false);
  const reward = result.reward ?? null;
  const ends = endsOn(reward?.expiresAt ?? null);
  const headline = result.code && result.alreadySubscribed ? (reward?.again ? "Welcome back! Here's your code again." : "You're already on the list. Here's your code.") : result.alreadySubscribed ? "You're already on the list. Thanks!" : result.message;
  const buttonStyle = { background: colors.accent, color: colors.accentText, ...(shape ? { borderRadius: shape.button } : {}) };
  const shop = onShop ? (
    <button type="button" onClick={onShop} className="min-h-[48px] rounded-full px-6 text-[15px] font-bold" style={buttonStyle}>Shop now</button>
  ) : shopHref ? (
    <a href={shopHref} className="inline-flex min-h-[48px] items-center justify-center rounded-full px-6 text-[15px] font-bold no-underline" style={buttonStyle}>Shop now</a>
  ) : null;
  return (
    <div className="grid gap-3" role="status">
      <p className="m-0 text-[16px] font-semibold">{headline}</p>
      {result.code ? (
        <div className="grid gap-2.5">
          <p className="m-0 text-[14px] opacity-80">{reward?.label ? `Your code for ${reward.label.toLowerCase()}:` : "Your code:"}</p>
          <div className="flex flex-wrap items-center gap-2">
            <code
              className="min-w-0 break-all border-2 border-dashed px-4 py-2.5 font-mono text-[24px] font-bold tracking-[0.08em]"
              style={{ borderColor: `${colors.ink}55`, borderRadius: shape?.input ?? 12 }}
            >
              {result.code}
            </code>
            <button
              type="button"
              className="min-h-[44px] rounded-full border px-5 text-[14px] font-bold"
              style={{ borderColor: `${colors.ink}55`, color: colors.ink, ...(shape ? { borderRadius: shape.button } : {}) }}
              onClick={() => {
                void navigator.clipboard?.writeText(result.code!).then(() => setCopied(true)).catch(() => null);
              }}
            >
              {copied ? "Copied" : "Copy code"}
            </button>
          </div>
          <p className="m-0 text-[13.5px] leading-[1.45] opacity-80">
            Use it at checkout. We&apos;ve added it to your bag.
            {reward?.minOrder ? ` For orders over ${formatStoreMoney(reward.minOrder, currency)}.` : ""}
            {ends ? ` Ends ${ends}.` : ""}
          </p>
        </div>
      ) : result.rewardSpent ? (
        <p className="m-0 text-[14px] opacity-80">You already got your code for this offer.</p>
      ) : null}
      {shop}
    </div>
  );
}
