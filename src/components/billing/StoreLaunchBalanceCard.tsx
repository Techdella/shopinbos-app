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
    <div className="card" style={{ padding: 20, border: "1px solid var(--amber-200, #f4d58d)" }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "var(--amber-800, #8a5a00)", textTransform: "uppercase", letterSpacing: ".06em" }}>Store launch balance</div>
      <div style={{ marginTop: 6, fontSize: 22, fontWeight: 700 }}>NGN {balanceDue.toLocaleString("en-NG")}</div>
      <p style={{ margin: "6px 0 14px", fontSize: 12.5, color: "var(--ink-600)" }}>Your deposit launched the store. The remaining balance is due by {dueLabel}.</p>
      {error && <p role="alert" style={{ fontSize: 12, color: "#b42318" }}>{error}</p>}
      <button type="button" className="dbtn dBtn-mint" onClick={() => void payBalance()} disabled={busy}>
        {busy ? "Opening Paystack…" : "Pay remaining balance"}
      </button>
    </div>
  );
}
