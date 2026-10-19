"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardHead, Pill } from "@/components/app-kit";
import { Notice } from "@/components/app-ui";
import { Field, buttonClass, inputClass, selectClass } from "@/components/growth/kit";
import {
  FIELD_LABELS,
  FILE_LABELS,
  LINES_OF_BUSINESS,
  NIGERIAN_STATES,
  REGISTRATION_FILES,
  queryFieldLabel,
  registrationStatusText,
  type NameCheck,
  type RegistrationForm,
  type RegistrationStatus,
} from "@shared/business-registration";

// "Register your business name with CAC", for sellers, suppliers and delivery partners
// (src/lib/business-registration): check the name (free), fill in the owner's details and pictures, pay, then follow
// the application: CAC's queries are answered here, and the certificate downloads once approved.

export interface RegistrationRow {
  id: string;
  proposedName: string;
  status: string;
  amountNgn: number;
  rcNumber: string | null;
  queries: Array<{ field: string; comment: string; date: string | null }>;
  form: RegistrationForm;
  createdAt: string;
}

type Errors = Record<string, string>;

const naira = (amount: number) => `₦${amount.toLocaleString("en-NG")}`;
const day = (iso: string) => new Date(iso).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric", timeZone: "Africa/Lagos" });

const RESULT_TEXT: Record<string, { tone: "success" | "info" | "error"; text: string }> = {
  submitted: { tone: "success", text: "Paid, and filed with CAC. We'll tell you as soon as they answer (usually a few working days)." },
  processing: { tone: "info", text: "Payment received. We're filing it with CAC now; this page updates when it's done." },
  refunded: { tone: "info", text: "We couldn't use this payment for the application, so it was refunded to your card or account. It can take a few days to show." },
  refund_failed: { tone: "info", text: "We couldn't file this application. Our team will send your money back within 2 working days; you don't need to do anything." },
  failed: { tone: "error", text: "The payment didn't go through, so nothing was charged. Try again." },
};

async function send(url: string, body: FormData | object) {
  const response = await fetch(url, body instanceof FormData ? { method: "POST", body } : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = (await response.json().catch(() => null)) as { data?: unknown; error?: { message?: string; fields?: Errors } } | null;
  if (!response.ok) return { ok: false as const, message: json?.error?.message ?? "Something went wrong. Try again.", fields: json?.error?.fields ?? {} };
  return { ok: true as const, data: json?.data };
}

export function RegisterBusiness({ enabled, priceNgn, registrations, prefill, result }: {
  enabled: boolean;
  priceNgn: number;
  registrations: RegistrationRow[];
  prefill: Partial<RegistrationForm>;
  /** ?registration= after Paystack. */
  result?: string | null;
}) {
  const router = useRouter();
  const active = registrations.find((row) => !["refunded", "failed", "payment_failed", "pending_payment", "draft"].includes(row.status));
  const [starting, setStarting] = useState(!active);
  const banner = result ? RESULT_TEXT[result] : null;

  return (
    <div className="grid gap-5">
      {banner ? <Notice tone={banner.tone}>{banner.text}</Notice> : null}
      {registrations.length ? (
        <section className="grid gap-4">
          {registrations
            .filter((row) => !["pending_payment", "payment_failed", "draft"].includes(row.status))
            .map((row) => <Application key={row.id} row={row} onChange={() => router.refresh()} />)}
        </section>
      ) : null}
      {!enabled ? (
        <Card className="p-5">
          <CardHead title="Register your business name" sub="Coming soon" />
          <p className="mb-0 mt-3 text-[14px] leading-[1.5] text-app-ink-soft">Registering with CAC from Shopinbos is being switched on. Check back soon.</p>
        </Card>
      ) : starting ? (
        <StartForm priceNgn={priceNgn} prefill={prefill} />
      ) : (
        <button type="button" className={buttonClass("white", "md", "justify-self-start")} onClick={() => setStarting(true)}>Register another business name</button>
      )}
    </div>
  );
}

function StartForm({ priceNgn, prefill }: { priceNgn: number; prefill: Partial<RegistrationForm> }) {
  const [form, setForm] = useState<Partial<RegistrationForm>>({ proprietorNationality: "Nigerian", lineOfBusiness: LINES_OF_BUSINESS[0], ...prefill });
  const [check, setCheck] = useState<{ name: string; result: NameCheck } | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [message, setMessage] = useState<{ tone: "error" | "info"; text: string } | null>(null);
  const [pending, start] = useTransition();
  const set = (key: keyof RegistrationForm) => (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm((current) => ({ ...current, [key]: event.target.value }));
  const nameChecked = check && check.name === (form.proposedName ?? "").trim() && check.result.canProceed;

  function checkName() {
    setMessage(null);
    start(async () => {
      const name = (form.proposedName ?? "").trim();
      const reply = await send("/api/business-registration/name-check", { proposedName: name, lineOfBusiness: form.lineOfBusiness });
      if (!reply.ok) return setMessage({ tone: "error", text: reply.message });
      setCheck({ name, result: reply.data as NameCheck });
    });
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setErrors({});
    const data = new FormData(event.currentTarget);
    start(async () => {
      const reply = await send("/api/business-registration", data);
      if (!reply.ok) {
        setErrors(reply.fields);
        return setMessage({ tone: "error", text: reply.message });
      }
      window.location.href = (reply.data as { authorizationUrl: string }).authorizationUrl;
    });
  }

  const text = (key: keyof RegistrationForm, props: React.InputHTMLAttributes<HTMLInputElement> = {}, className?: string) => (
    <Field label={FIELD_LABELS[key]} htmlFor={`br-${key}`} hint={errors[key] ? <span className="text-app-danger">{errors[key]}</span> : undefined} className={className}>
      <input id={`br-${key}`} name={key} className={inputClass} value={form[key] ?? ""} onChange={set(key)} {...props} />
    </Field>
  );
  const select = (key: keyof RegistrationForm, options: readonly string[], className?: string) => (
    <Field label={FIELD_LABELS[key]} htmlFor={`br-${key}`} hint={errors[key] ? <span className="text-app-danger">{errors[key]}</span> : undefined} className={className}>
      <select id={`br-${key}`} name={key} className={selectClass} value={form[key] ?? ""} onChange={set(key)}>
        <option value="" disabled>Choose</option>
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </Field>
  );

  return (
    <Card className="p-5 sm:p-6">
      <CardHead title="Register your business name with CAC" sub={`${naira(priceNgn)}, CAC's fee included. You get your BN number and certificate here.`} />
      <form onSubmit={submit} className="mt-5 grid gap-6">
        <fieldset className="m-0 grid gap-4 border-0 p-0 sm:grid-cols-2">
          <legend className="mb-2 text-[15px] font-extrabold">1. Your business name</legend>
          {text("proposedName", { placeholder: "e.g. Ada Fabrics Ventures", maxLength: 120, autoComplete: "organization" })}
          {select("lineOfBusiness", LINES_OF_BUSINESS)}
          <div className="sm:col-span-2 flex flex-wrap items-center gap-3">
            <button type="button" className={buttonClass("white")} onClick={checkName} disabled={pending || (form.proposedName ?? "").trim().length < 4}>Check the name with CAC</button>
            <span className="text-[12.5px] text-app-ink-soft">Free. Add a word like Ventures, Enterprises or Concepts.</span>
          </div>
          {check && check.name === (form.proposedName ?? "").trim() ? (
            <div className="sm:col-span-2">
              <Notice tone={check.result.canProceed ? "success" : "error"}>
                {check.result.canProceed ? `CAC can accept "${check.name}".` : `CAC won't accept "${check.name}".`}
                {check.result.advice.length ? ` ${check.result.advice.join(" ")}` : ""}
                {check.result.suggestions.length ? ` Try: ${check.result.suggestions.join(", ")}.` : ""}
              </Notice>
            </div>
          ) : null}
        </fieldset>

        {nameChecked ? (
          <>
            <fieldset className="m-0 grid gap-4 border-0 p-0 sm:grid-cols-2">
              <legend className="mb-2 text-[15px] font-extrabold">2. About you (the owner)</legend>
              {text("proprietorFirstname", { autoComplete: "given-name" })}
              {text("proprietorSurname", { autoComplete: "family-name" })}
              {text("proprietorOthername", { autoComplete: "additional-name" })}
              {select("proprietorGender", ["MALE", "FEMALE"])}
              {text("proprietorDob", { type: "date" })}
              {text("proprietorNationality")}
              {text("proprietorEmail", { type: "email", autoComplete: "email" })}
              {text("proprietorPhonenumber", { type: "tel", autoComplete: "tel", placeholder: "08012345678" })}
              {text("proprietorStreetNumber", { placeholder: "12" })}
              {text("proprietorServiceAddress", { placeholder: "Adeola Odeku Street, Victoria Island", autoComplete: "street-address" })}
              {text("proprietorCity")}
              {text("proprietorLga", { placeholder: "e.g. Eti-Osa" })}
              {select("proprietorState", NIGERIAN_STATES)}
              {text("proprietorPostcode", { inputMode: "numeric", maxLength: 6, placeholder: "100001" })}
            </fieldset>

            <fieldset className="m-0 grid gap-4 border-0 p-0 sm:grid-cols-2">
              <legend className="mb-2 text-[15px] font-extrabold">3. The business</legend>
              {text("businessCommencementDate", { type: "date" })}
              {text("companyEmail", { type: "email" })}
              {text("companyStreetNumber")}
              {text("companyAddress", { placeholder: "Where the business runs from" })}
              {text("companyCity")}
              {select("companyState", NIGERIAN_STATES)}
            </fieldset>

            <fieldset className="m-0 grid gap-4 border-0 p-0 sm:grid-cols-3">
              <legend className="mb-2 text-[15px] font-extrabold">4. Pictures for CAC</legend>
              {REGISTRATION_FILES.map((key) => (
                <Field key={key} label={FILE_LABELS[key]} htmlFor={`br-${key}`} hint={errors[key] ? <span className="text-app-danger">{errors[key]}</span> : "JPG or PNG, under 3 MB"}>
                  <input id={`br-${key}`} name={key} type="file" accept="image/jpeg,image/png" required className="block w-full text-[13px]" />
                </Field>
              ))}
            </fieldset>

            <p className="m-0 text-[12.5px] leading-[1.5] text-app-ink-soft">
              CAC checks these details before you pay. If CAC turns the application down before filing it, you get your money back. Your pictures are kept private and deleted once CAC approves.
            </p>
            {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}
            <button type="submit" className={buttonClass("ink", "md", "justify-self-start")} disabled={pending}>{pending ? "Checking with CAC…" : `Pay ${naira(priceNgn)} and register`}</button>
          </>
        ) : message ? (
          <Notice tone={message.tone}>{message.text}</Notice>
        ) : null}
      </form>
    </Card>
  );
}

function Application({ row, onChange }: { row: RegistrationRow; onChange: () => void }) {
  const status = registrationStatusText(row.status as RegistrationStatus);
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ tone: "error" | "success" | "info"; text: string } | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  // The fields CAC queried, as the form's keys (CAC calls the name proposedOption1).
  const queried = useMemo(() => [...new Set(row.queries.map((q) => (q.field === "proposedOption1" ? "proposedName" : q.field)))], [row.queries]);
  const editable = queried.filter((key) => key in FIELD_LABELS && !["passport", "signature", "meansOfId", "supportingDoc"].includes(key)) as (keyof RegistrationForm)[];

  function refresh() {
    start(async () => {
      const reply = await send(`/api/business-registration/${row.id}/refresh`, {});
      if (!reply.ok) return setMessage({ tone: "error", text: reply.message });
      onChange();
    });
  }

  function answer(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrors({});
    const data = new FormData(event.currentTarget);
    start(async () => {
      const reply = await send(`/api/business-registration/${row.id}/answer`, data);
      if (!reply.ok) {
        setErrors(reply.fields);
        return setMessage({ tone: "error", text: reply.message });
      }
      setMessage({ tone: "success", text: "Sent back to CAC. We'll tell you when they answer." });
      onChange();
    });
  }

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start gap-3">
        <span className="min-w-0 flex-1">
          <span className="block text-[16px] font-extrabold">{row.proposedName}</span>
          <span className="block text-[13px] text-app-ink-soft">Started {day(row.createdAt)}{row.rcNumber ? ` · BN ${row.rcNumber}` : ""}</span>
        </span>
        <Pill tone={status.tone} dot>{status.label}</Pill>
      </div>

      {row.status === "approved" ? (
        <div className="mt-4 flex flex-wrap gap-2">
          <a href={`/api/business-registration/${row.id}/certificate`} className={buttonClass("ink", "sm")}>Download certificate</a>
        </div>
      ) : null}

      {row.status === "submitted" || row.status === "paid" || row.status === "submitting" || row.status === "answering" ? (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <p className="m-0 flex-1 text-[13.5px] leading-[1.5] text-app-ink-soft">CAC is reviewing it. It usually takes a few working days; we check for you regularly and tell you when CAC answers.</p>
          <button type="button" className={buttonClass("white", "sm")} onClick={refresh} disabled={pending}>Check now</button>
        </div>
      ) : null}

      {row.status === "refunded" || row.status === "refund_failed" || row.status === "failed" ? (
        <p className="m-0 mt-3 text-[13.5px] leading-[1.5] text-app-ink-soft">CAC didn&apos;t accept this application, so it wasn&apos;t filed. {row.status === "refunded" ? `Your ${naira(row.amountNgn)} was sent back.` : "Our team is sending your money back."}</p>
      ) : null}

      {row.status === "queried" ? (
        <form onSubmit={answer} className="mt-4 grid gap-4">
          <div className="rounded-[14px] bg-app-canvas p-4">
            <div className="text-[14px] font-bold">CAC asked for these changes</div>
            <ul className="m-0 mt-2 grid gap-1.5 pl-5 text-[13.5px] leading-[1.5]">
              {row.queries.map((query, index) => <li key={index}><strong>{queryFieldLabel(query.field)}:</strong> {query.comment}</li>)}
            </ul>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {editable.map((key) => (
              <Field key={key} label={FIELD_LABELS[key]} htmlFor={`q-${row.id}-${key}`} hint={errors[key] ? <span className="text-app-danger">{errors[key]}</span> : undefined}>
                <input id={`q-${row.id}-${key}`} name={key} className={inputClass} defaultValue={row.form[key] ?? ""} />
              </Field>
            ))}
            {(["passport", "signature", "meansOfId", "supportingDoc"] as const).filter((key) => queried.includes(key) || key === "supportingDoc").map((key) => (
              <Field key={key} label={`${FIELD_LABELS[key]}${queried.includes(key) ? " (new picture)" : " (optional)"}`} htmlFor={`q-${row.id}-${key}`} hint={errors[key] ? <span className="text-app-danger">{errors[key]}</span> : "JPG or PNG, under 3 MB"}>
                <input id={`q-${row.id}-${key}`} name={key} type="file" accept="image/jpeg,image/png" className="block w-full text-[13px]" required={queried.includes(key)} />
              </Field>
            ))}
          </div>
          <button type="submit" className={buttonClass("ink", "md", "justify-self-start")} disabled={pending}>{pending ? "Sending…" : "Send changes to CAC"}</button>
        </form>
      ) : null}

      {message ? <div className="mt-3"><Notice tone={message.tone}>{message.text}</Notice></div> : null}
    </Card>
  );
}
