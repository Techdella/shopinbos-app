"use client";

import { useState } from "react";

export function StoreLaunchBalanceCard({ balanceDue, dueAt }: { balanceDue: number; dueAt?: string | null }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (balanceDue <= 0) return null;
  const dueLabel = dueAt
    ? new Intl.DateTimeFormat("en-NG", { dateStyle: "long" }).format(new Date(dueAt))
    : "the end of the month";

  async function payBalance() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/billing/store-launch/balance/initialize", { method: "POST" });
      const json = await response.json().catch(() => null) as { data?: { authorizationUrl?: string }; error?: { message?: string } } | null;
      if (!response.ok || !json?.data?.authorizationUrl) throw new Error(json?.error?.message ?? "Could not start payment.");
      window.location.assign(json.data.authorizationUrl);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not start payment.");
      setBusy(false);
    }
  }

  return (
    <section className="rounded-[22px] border border-[#F2D9A8] bg-white p-5">
      <h2 className="m-0 text-[15px] font-extrabold text-[#8A5A00]">Store launch balance</h2>
      <div className="mt-1.5 text-[26px] font-extrabold tracking-[-0.5px]">NGN {balanceDue.toLocaleString("en-NG")}</div>
      <p className="mb-4 mt-1.5 text-[13.5px] text-app-ink-soft">Your deposit launched the store. The rest is due by {dueLabel}.</p>
      {error && <p role="alert" className="mb-3 mt-0 text-[13px] text-app-danger">{error}</p>}
      <button
        type="button"
        onClick={() => void payBalance()}
        disabled={busy}
        className="inline-flex min-h-[44px] items-center justify-center rounded-full bg-app-accent px-5 text-[14px] font-extrabold text-white transition hover:brightness-95 disabled:opacity-55"
      >
        {busy ? "Opening Paystack…" : "Pay remaining balance"}
      </button>
    </section>
  );
}
