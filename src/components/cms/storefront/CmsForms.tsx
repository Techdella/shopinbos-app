"use client";

import { useId, useState } from "react";
import { useStoreVisitor, rememberStoreVisitor } from "@/hooks/useStoreVisitor";
import { SignupForm, SignupSuccess, type SignupColors, type SignupResult } from "@/components/storefront/marketing/SignupForm";
import type { FormDesign, FormField } from "@/lib/marketing/forms";
import { friendlyError } from "@/lib/errors/report-client";

// Forms inside CMS pages: one of the store's own forms (Marketing → Forms), or a simple contact form that
// posts to the store's form submissions (and so reaches the seller's inbox).

export function CmsSignupForm(props: { storeSlug: string; formId: string; fields: FormField[]; design: FormDesign; colors: SignupColors; heading: string }) {
  const [result, setResult] = useState<SignupResult | null>(null);
  return (
    <section className="cms-form-card">
      {props.heading && <h2 className="cms-h2">{props.heading}</h2>}
      {result ? <SignupSuccess result={result} colors={props.colors} /> : <SignupForm storeSlug={props.storeSlug} formId={props.formId} fields={props.fields} design={props.design} colors={props.colors} onDone={setResult} />}
    </section>
  );
}

export function CmsContactForm({ storeSlug, heading, context }: { storeSlug: string; heading: string; context: string }) {
  const id = useId();
  const visitorKey = useStoreVisitor(storeSlug);
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") ?? "").trim();
    const email = String(form.get("email") ?? "").trim();
    const message = String(form.get("message") ?? "").trim();
    if (!email || !message) {
      setError("Add your email and a message.");
      setState("error");
      return;
    }
    setState("sending");
    setError("");
    try {
      const res = await fetch(`/api/public/store/${encodeURIComponent(storeSlug)}/forms`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visitorKey: visitorKey || `cms-${Date.now()}-${Math.random().toString(36).slice(2)}`, type: "contact", name: name || undefined, email, message, payload: { source: "cms", page: context } }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        throw new Error(json?.error?.message ?? "It didn't send. Try again.");
      }
      rememberStoreVisitor(storeSlug, { email, name });
      setState("sent");
    } catch (e) {
      setError(e instanceof Error ? friendlyError(e) : "It didn't send. Try again.");
      setState("error");
    }
  }

  return (
    <section className="cms-form-card" aria-labelledby={`${id}-h`}>
      <h2 id={`${id}-h`} className="cms-h2">{heading || "Send us a message"}</h2>
      {state === "sent" ? (
        <p role="status">Thanks, your message is on its way. We&apos;ll reply by email.</p>
      ) : (
        <form onSubmit={(event) => void submit(event)} className="cms-form" noValidate>
          <label htmlFor={`${id}-name`}>Name</label>
          <input id={`${id}-name`} name="name" autoComplete="name" maxLength={120} />
          <label htmlFor={`${id}-email`}>Email</label>
          <input id={`${id}-email`} name="email" type="email" autoComplete="email" required maxLength={200} />
          <label htmlFor={`${id}-msg`}>Message</label>
          <textarea id={`${id}-msg`} name="message" rows={4} required maxLength={4000} />
          {state === "error" && <p role="alert" className="cms-form-error">{error}</p>}
          <button type="submit" className="cms-btn" disabled={state === "sending"}>{state === "sending" ? "Sending…" : "Send"}</button>
        </form>
      )}
    </section>
  );
}
