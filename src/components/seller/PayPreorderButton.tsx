"use client";

import { useState } from "react";
import { PillButton } from "@/components/app-ui";
import { useT } from "@/components/i18n/I18nProvider";

// "Pay deposit ₦X" / "Pay balance ₦X" on the seller's preorders (/home/preorders): starts the card payment of what's
// due on the bulk order (PATCH /api/app/wholesale/[id] { action: "pay" }, split straight to the supplier's bank)
// and goes to Paystack, which comes back to /home/preorders to confirm it.

export function PayPreorderButton({ orderId, label }: { orderId: string; label: string }) {
  const t = useT("orders");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pay() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/app/wholesale/${encodeURIComponent(orderId)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "pay" }) });
      const json = (await response.json().catch(() => null)) as { data?: { authorizationUrl?: string | null }; error?: { message?: string } } | null;
      if (!response.ok || !json?.data?.authorizationUrl) {
        setError(json?.error?.message ?? t("preorders.payError"));
        setBusy(false);
        return;
      }
      window.location.assign(json.data.authorizationUrl);
    } catch {
      setError(t("preorders.payError"));
      setBusy(false);
    }
  }

  return (
    <span className="grid gap-1">
      <PillButton tone="accent" size="sm" busy={busy} disabled={busy} onClick={() => void pay()} className="whitespace-nowrap">
        {label}
      </PillButton>
      {error && <span role="alert" className="text-[12.5px] font-bold text-app-danger">{error}</span>}
    </span>
  );
}
