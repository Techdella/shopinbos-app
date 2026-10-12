"use client";

import { useState, useTransition } from "react";
import { notifyTransferSent } from "./actions";

export interface TransferDetails {
  bankName: string;
  accountName: string;
  accountNumber: string;
  amount: number;
  reference: string;
  /** When the order lets its items go if the money hasn't arrived (ISO), or null when unknown. */
  payBy?: string | null;
}

/** "Wednesday 14 October, 3:30 pm" in Lagos time. */
export function payByText(iso: string) {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Lagos", weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(iso));
}

const INK = "#16141F";
const SOFT = "#6E6E68";

function money(currency: string, amount: number) {
  return new Intl.NumberFormat("en-NG", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
}

function CopyRow({ label, value, display }: { label: string; value: string; display?: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard can be blocked; the value is still on screen to copy by hand.
    }
  }
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderTop: "1px solid rgba(22,20,31,0.08)" }}>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 12.5, color: SOFT }}>{label}</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: INK, overflowWrap: "anywhere" }}>{display ?? value}</div>
      </div>
      <button
        type="button"
        onClick={() => void copy()}
        aria-label={`Copy ${label.toLowerCase()}`}
        style={{ minHeight: 40, padding: "0 16px", borderRadius: 999, border: "1.5px solid rgba(22,20,31,0.15)", background: "#fff", color: INK, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", flexShrink: 0 }}
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

/** Account details for a bank-transfer order, with the "I've sent it" button that tells the seller to check. */
export function TransferInstructions({ orderId, currency, details, ctaBg, ctaText }: {
  orderId: string;
  currency: string;
  details: TransferDetails;
  ctaBg: string;
  ctaText: string;
}) {
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function markSent() {
    setError(null);
    startTransition(async () => {
      const result = await notifyTransferSent(orderId).catch(() => ({ ok: false, error: "Couldn't reach the store. Try again." }));
      if (result.ok) setSent(true);
      else setError(result.error ?? "Couldn't reach the store. Try again.");
    });
  }

  return (
    <section aria-labelledby="transfer-heading" style={{ background: "#fff", borderRadius: 22, border: "1px solid rgba(22,20,31,0.08)", padding: 20, fontFamily: "var(--font-app, inherit)" }}>
      <h2 id="transfer-heading" style={{ margin: "0 0 4px", fontSize: 18, fontWeight: 800, color: INK }}>Pay by bank transfer</h2>
      <p style={{ margin: "0 0 12px", fontSize: 14, lineHeight: 1.5, color: SOFT }}>
        Send exactly {money(currency, details.amount)} and use your order number as the reference so the store can match your payment.
      </p>
      {details.payBy ? (
        <p style={{ margin: "0 0 12px", padding: "10px 14px", borderRadius: 14, background: "#FFF4E0", color: "#7A4A00", fontSize: 14, lineHeight: 1.5 }}>
          Pay by <strong suppressHydrationWarning>{payByText(details.payBy)}</strong> (Lagos time). After that the order is cancelled and its items go back on sale.
        </p>
      ) : null}
      <CopyRow label="Amount" value={String(Math.round(details.amount))} display={money(currency, details.amount)} />
      <CopyRow label="Account number" value={details.accountNumber} />
      <div style={{ padding: "12px 0", borderTop: "1px solid rgba(22,20,31,0.08)" }}>
        <div style={{ fontSize: 12.5, color: SOFT }}>Bank and account name</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: INK }}>{details.bankName} · {details.accountName}</div>
      </div>
      <CopyRow label="Reference" value={details.reference} />

      {sent ? (
        <p role="status" style={{ margin: "12px 0 0", padding: "12px 14px", borderRadius: 14, background: "#E2F6F1", color: "#14532D", fontSize: 14, lineHeight: 1.5 }}>
          Thanks. We&apos;ve told the store you sent it. Your order is confirmed once they see the money.
        </p>
      ) : (
        <button
          type="button"
          onClick={markSent}
          disabled={pending}
          style={{ marginTop: 12, width: "100%", minHeight: 48, background: pending ? "#9ca3af" : ctaBg, color: ctaText, border: "none", borderRadius: 999, fontSize: 16, fontWeight: 700, cursor: pending ? "not-allowed" : "pointer", fontFamily: "inherit" }}
        >
          {pending ? "Letting the store know..." : "I've sent it"}
        </button>
      )}
      {error && <p role="alert" style={{ margin: "10px 0 0", fontSize: 13, color: "#B42318" }}>{error}</p>}
    </section>
  );
}
