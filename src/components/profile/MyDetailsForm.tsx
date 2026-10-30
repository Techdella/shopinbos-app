"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Card, CardHead } from "@/components/app-kit";
import { CodeInput, Notice, PhoneInput, PillButton } from "@/components/app-ui";
import { useT } from "@/components/i18n/I18nProvider";
import { IdentityImageUploader } from "@/components/profile/IdentityImageUploader";
import { FIELD_HELP, FIELD_INPUT, FIELD_LABEL } from "@/components/seller-settings/fields";
import { broadcastIdentity } from "@/components/shell/useShellCounts";
import { DEFAULT_DIAL_COUNTRY, OTP_LENGTH, formatE164, toE164, type DialCountry } from "@shared/phone";
import { BUSINESS_LIMITS, businessChanges, businessForm, businessKind, type BusinessDetails, type BusinessField, type MyDetails } from "@shared/my-details";

// "My details" on the web (/home/details, /supplier/details, /logistics/details): the person's photo, name, email
// and phone, then the business's logo, name, phone, address, city and state. One Save for the name and business;
// email goes through Supabase's confirmation link and phone through a 6-digit code (src/lib/my-details.server.ts),
// each with its own button. The phone app's app/my-details.tsx is the same screen.

type Note = { tone: "success" | "error" | "info"; text: string } | null;

async function call<T>(path: string, method: "PATCH" | "POST", body: unknown, fallback: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  } catch {
    throw new Error(fallback);
  }
  const json = (await response.json().catch(() => null)) as { data?: T; error?: { message?: string } } | null;
  if (!response.ok || !json || json.data === undefined) throw new Error(json?.error?.message ?? fallback);
  return json.data;
}

export function MyDetailsForm({ initial }: { initial: MyDetails }) {
  const t = useT("details", "common");
  const router = useRouter();
  const [saved, setSaved] = useState(initial);
  const [name, setName] = useState(initial.me.name);
  const [biz, setBiz] = useState<BusinessDetails>(businessForm(initial.business));
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<Note>(null);
  const kind = businessKind(saved.role);

  const changes = saved.canEditBusiness ? businessChanges(saved.business, biz) : {};
  const dirty = name.trim() !== saved.me.name || Object.keys(changes).length > 0;

  async function save() {
    if (name.trim().length < 2) return setNote({ tone: "error", text: t("needName") });
    if (changes.name !== undefined && changes.name.length < 2) return setNote({ tone: "error", text: t("needBusinessName") });
    setSaving(true);
    setNote(null);
    try {
      const next = await call<MyDetails>(
        "/api/app/me/details",
        "PATCH",
        { ...(name.trim() !== saved.me.name ? { name: name.trim() } : {}), ...(Object.keys(changes).length ? { business: changes } : {}) },
        t("saveFailed"),
      );
      setSaved(next);
      setName(next.me.name);
      setBiz(businessForm(next.business));
      // The top bar and menu show the new names straight away.
      broadcastIdentity({ name: next.me.name, ...(next.business ? { businessName: next.business.name } : {}) });
      setNote({ tone: "success", text: t("saved") });
      router.refresh();
    } catch (error) {
      setNote({ tone: "error", text: error instanceof Error ? error.message : t("saveFailed") });
    } finally {
      setSaving(false);
    }
  }

  const bizField = (field: BusinessField) => ({
    id: `biz-${field}`,
    value: biz[field],
    maxLength: BUSINESS_LIMITS[field],
    disabled: !saved.canEditBusiness,
    onChange: (event: { target: { value: string } }) => setBiz((current) => ({ ...current, [field]: event.target.value })),
    className: FIELD_INPUT,
  });

  return (
    // Full width: on wide screens you (photo, name, email, phone) on the left and the business on the right.
    <div className="grid w-full gap-5">
      {note ? <Notice tone={note.tone}>{note.text}</Notice> : null}

      <div className="grid items-start gap-5 lg:grid-cols-2">
      <div className="grid gap-5">
      <Card className="p-5">
        <CardHead title={t("you")} />
        <div className="mt-4 grid gap-4">
          <IdentityImageUploader kind="avatar" initialUrl={saved.me.avatarUrl} name={name || saved.me.name} title={t("photo")} />
          <div>
            <label htmlFor="my-name" className={FIELD_LABEL}>{t("name")}</label>
            <input id="my-name" className={FIELD_INPUT} value={name} maxLength={120} autoComplete="name" onChange={(event) => setName(event.target.value)} />
          </div>
        </div>
      </Card>

      <EmailCard details={saved} onChanged={(pendingEmail) => setSaved((current) => ({ ...current, me: { ...current.me, pendingEmail } }))} />
      <PhoneCard details={saved} onChanged={(phone) => setSaved((current) => ({ ...current, me: { ...current.me, phone } }))} />
      </div>

      {kind ? (
        <Card className="p-5">
          <CardHead title={t(`biz.${kind}.title`)} sub={saved.canEditBusiness ? undefined : saved.business ? t("staffNote") : t("noBusiness")} />
          {saved.business ? (
            <div className="mt-4 grid gap-4">
              {saved.canEditBusiness ? <IdentityImageUploader kind="logo" initialUrl={saved.business.logoUrl} name={biz.name || saved.business.name} title={t("logo")} /> : null}
              <div>
                <label htmlFor="biz-name" className={FIELD_LABEL}>{t(`biz.${kind}.name`)}</label>
                <input {...bizField("name")} autoComplete="organization" />
              </div>
              <div>
                <label htmlFor="biz-phone" className={FIELD_LABEL}>{t(`biz.${kind}.phone`)}</label>
                <input {...bizField("phone")} type="tel" inputMode="tel" placeholder="0803 123 4567" />
                <p className={FIELD_HELP}>{t("biz.phoneHint")}</p>
              </div>
              <div>
                <label htmlFor="biz-address" className={FIELD_LABEL}>{t(`biz.${kind}.address`)}</label>
                <input {...bizField("address")} autoComplete="street-address" placeholder={t("biz.addressPlaceholder")} />
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="min-w-0">
                  <label htmlFor="biz-city" className={FIELD_LABEL}>{t("city")}</label>
                  <input {...bizField("city")} autoComplete="address-level2" placeholder="Ikeja" />
                </div>
                <div className="min-w-0">
                  <label htmlFor="biz-state" className={FIELD_LABEL}>{t("state")}</label>
                  <input {...bizField("state")} autoComplete="address-level1" placeholder="Lagos" />
                </div>
              </div>
            </div>
          ) : null}
        </Card>
      ) : null}
      </div>

      <div className="sticky bottom-3 z-10 flex justify-end">
        <PillButton tone="ink" size="md" busy={saving} disabled={!dirty} onClick={() => void save()}>{t("save")}</PillButton>
      </div>
    </div>
  );
}

/** A label, the current value in a grey box, and an optional line under it. */
function Current({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="min-w-0">
      <span className={FIELD_LABEL}>{label}</span>
      <div className="flex h-[50px] min-w-0 items-center rounded-[16px] border border-app-line bg-app-canvas px-4 text-[15px]">
        <span className="truncate">{value}</span>
      </div>
      {hint ? <p className={FIELD_HELP}>{hint}</p> : null}
    </div>
  );
}

function EmailCard({ details, onChanged }: { details: MyDetails; onChanged: (pendingEmail: string) => void }) {
  const t = useT("details", "common");
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<Note>(null);
  const current = details.me.email;

  async function send() {
    setBusy(true);
    setNote(null);
    try {
      const sent = await call<{ pendingEmail: string; currentToo: boolean }>("/api/app/me/email", "POST", { email: email.trim() }, t("emailFailed"));
      onChanged(sent.pendingEmail);
      setNote({ tone: "success", text: t(sent.currentToo ? "emailSent" : "emailSentOnly", { email: sent.pendingEmail }) });
      setOpen(false);
      setEmail("");
    } catch (error) {
      setNote({ tone: "error", text: error instanceof Error ? error.message : t("emailFailed") });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-5">
      <CardHead title={t("email")} />
      <div className="mt-4 grid gap-4">
        <Current label={t("email")} value={current ?? t("emailNone")} hint={t("emailHint")} />
        {details.me.pendingEmail && !note ? <Notice tone="info">{t("emailPending", { email: details.me.pendingEmail })}</Notice> : null}
        {note ? <Notice tone={note.tone}>{note.text}</Notice> : null}
        {open ? (
          <div className="grid gap-3">
            <div>
              <label htmlFor="new-email" className={FIELD_LABEL}>{t("emailNew")}</label>
              <input id="new-email" type="email" inputMode="email" autoComplete="email" className={FIELD_INPUT} value={email} maxLength={200} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" />
            </div>
            <div className="flex flex-wrap gap-2">
              <PillButton tone="ink" size="md" busy={busy} disabled={!email.trim()} onClick={() => void send()}>{t("emailSend")}</PillButton>
              <PillButton tone="white" size="md" disabled={busy} onClick={() => setOpen(false)}>{t("cancel")}</PillButton>
            </div>
          </div>
        ) : (
          <div>
            <PillButton tone="white" size="md" onClick={() => { setOpen(true); setNote(null); }}>{current ? t("emailChange") : t("emailAdd")}</PillButton>
          </div>
        )}
      </div>
    </Card>
  );
}

function PhoneCard({ details, onChanged }: { details: MyDetails; onChanged: (phone: string) => void }) {
  const t = useT("details", "common");
  const [step, setStep] = useState<"idle" | "number" | "code">("idle");
  const [country, setCountry] = useState<DialCountry>(DEFAULT_DIAL_COUNTRY);
  const [national, setNational] = useState("");
  const [sent, setSent] = useState<{ phone: string; challenge: string } | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<Note>(null);
  const current = details.me.phone;

  async function sendCode(via?: "sms") {
    const phone = toE164(national, country);
    if (!phone) return setNote({ tone: "error", text: t("phoneInvalid") });
    setBusy(true);
    setNote(null);
    try {
      const result = await call<{ phone: string; challenge: string; channel: string }>("/api/app/me/phone", "POST", { action: "send", phone, ...(via ? { via } : {}) }, t("phoneFailed"));
      setSent({ phone: result.phone, challenge: result.challenge });
      setCode("");
      setStep("code");
      setNote({ tone: "info", text: t(result.channel === "whatsapp" ? "phoneCodeWhatsApp" : "phoneCodeSms", { phone: formatE164(result.phone) }) });
    } catch (error) {
      setNote({ tone: "error", text: error instanceof Error ? error.message : t("phoneFailed") });
    } finally {
      setBusy(false);
    }
  }

  async function confirm(value = code) {
    if (!sent || value.length !== OTP_LENGTH || busy) return;
    setBusy(true);
    setNote(null);
    try {
      const result = await call<{ phone: string }>("/api/app/me/phone", "POST", { action: "verify", phone: sent.phone, challenge: sent.challenge, code: value }, t("phoneFailed"));
      onChanged(result.phone);
      setStep("idle");
      setSent(null);
      setNational("");
      setNote({ tone: "success", text: t("phoneSaved", { phone: formatE164(result.phone) }) });
    } catch (error) {
      setNote({ tone: "error", text: error instanceof Error ? error.message : t("phoneFailed") });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-5">
      <CardHead title={t("phone")} />
      <div className="mt-4 grid gap-4">
        <Current label={t("phone")} value={current ? formatE164(current) : t("phoneNone")} hint={t("phoneHint")} />
        {note ? <Notice tone={note.tone}>{note.text}</Notice> : null}
        {step === "idle" ? (
          <div>
            <PillButton tone="white" size="md" onClick={() => { setStep("number"); setNote(null); }}>{current ? t("phoneChange") : t("phoneAdd")}</PillButton>
          </div>
        ) : null}
        {step === "number" ? (
          <div className="grid gap-3">
            <div>
              <label htmlFor="new-phone" className={FIELD_LABEL}>{t("phoneNew")}</label>
              <PhoneInput id="new-phone" country={country} onCountry={setCountry} value={national} onChange={setNational} />
            </div>
            <div className="flex flex-wrap gap-2">
              <PillButton tone="ink" size="md" busy={busy} disabled={!national.trim()} onClick={() => void sendCode()}>{t("phoneSend")}</PillButton>
              <PillButton tone="white" size="md" disabled={busy} onClick={() => setStep("idle")}>{t("cancel")}</PillButton>
            </div>
          </div>
        ) : null}
        {step === "code" && sent ? (
          <div className="grid gap-3">
            <span className={FIELD_LABEL}>{t("phoneCode")}</span>
            <CodeInput value={code} onChange={setCode} onComplete={(value) => void confirm(value)} disabled={busy} />
            <div className="flex flex-wrap gap-2">
              <PillButton tone="ink" size="md" busy={busy} disabled={code.length !== OTP_LENGTH} onClick={() => void confirm()}>{t("phoneConfirm")}</PillButton>
              <PillButton tone="white" size="md" disabled={busy} onClick={() => void sendCode("sms")}>{t("phoneSendSms")}</PillButton>
              <PillButton tone="white" size="md" disabled={busy} onClick={() => { setStep("idle"); setSent(null); setNote(null); }}>{t("cancel")}</PillButton>
            </div>
          </div>
        ) : null}
      </div>
    </Card>
  );
}
