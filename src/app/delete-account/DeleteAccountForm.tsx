"use client";

import { useRef, useState } from "react";
import { friendlyError } from "@/lib/errors/report-client";

// Sends a "Delete my account" request to the support desk (POST /api/support/requests, the same signed-out form
// as "Stuck?" on login: rate-limited, with a honeypot and a fill-time check).
export function DeleteAccountForm() {
  const startedAt = useRef(Date.now());
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const reason = String(form.get("reason") ?? "").trim();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/support/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: String(form.get("name") ?? ""),
          contact: String(form.get("contact") ?? ""),
          topic: "other",
          message: ["Delete my account: please delete my Shopinbos account and my data.", reason ? `Reason: ${reason}` : ""].filter(Boolean).join("\n"),
          path: "/delete-account",
          website: String(form.get("website") ?? ""),
          startedAt: startedAt.current,
        }),
      });
      const body = (await response.json().catch(() => null)) as { data?: { ticket?: string | null }; error?: { message?: string } } | null;
      if (!response.ok) throw new Error(body?.error?.message ?? "We couldn't send that. Try again in a minute.");
      setSent(body?.data?.ticket ?? "");
    } catch (cause) {
      setError(cause instanceof Error ? friendlyError(cause) : "We couldn't send that. Try again in a minute.");
    } finally {
      setBusy(false);
    }
  }

  if (sent !== null) {
    return (
      <p className="mt-4 rounded-lg bg-cream p-4 text-[15px] leading-6" role="status">
        We&apos;ve got your request{sent ? ` (${sent})` : ""}. A person will confirm with you, then delete your account within 30 days.
      </p>
    );
  }

  const field = "mt-1 w-full rounded-lg border border-navy/15 bg-white px-3 py-2.5 text-[15px] outline-none focus:border-teal";
  return (
    <form onSubmit={(event) => void submit(event)} className="mt-4 grid gap-3">
      <label className="text-[14px] font-medium">Your name<input name="name" required maxLength={120} autoComplete="name" className={field} /></label>
      <label className="text-[14px] font-medium">Email or phone number on your account<input name="contact" required maxLength={160} autoComplete="email" className={field} /></label>
      <label className="text-[14px] font-medium">Why are you leaving? (optional)<textarea name="reason" maxLength={1000} rows={3} className={field} /></label>
      <input name="website" tabIndex={-1} autoComplete="off" aria-hidden className="hidden" />
      {error && <p className="text-[14px] text-coral" role="alert">{error}</p>}
      <button type="submit" disabled={busy} className="rounded-pill bg-navy px-5 py-3 text-[15px] font-medium text-cream disabled:opacity-60">
        {busy ? "Sending…" : "Ask to delete my account"}
      </button>
    </form>
  );
}
