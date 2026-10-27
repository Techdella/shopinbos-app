"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { confirmDeliveryFeePaymentAction, startDeliveryFeePaymentAction } from "@/app/actions/delivery-fees";

// Pays one booking's delivery fee by card through Paystack, split straight to the delivery partner's bank.

export function PayDeliveryFeeButton({ bookingId, label }: { bookingId: string; label: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function pay() {
    setError(null);
    setBusy(true);
    startTransition(async () => {
      const started = await startDeliveryFeePaymentAction(bookingId);
      if (!started.ok) {
        setBusy(false);
        setError(started.error);
        return;
      }
      const { default: PaystackPop } = await import("@paystack/inline-js");
      new PaystackPop().resumeTransaction(started.accessCode, {
        onSuccess: (transaction) => {
          void confirmDeliveryFeePaymentAction(transaction.reference ?? started.reference).then((result) => {
            setBusy(false);
            if (!result.ok) setError(result.retry ? "Paystack took the payment; it shows here once Paystack confirms it. Refresh in a minute." : result.error);
            router.refresh();
          });
        },
        onCancel: () => setBusy(false),
        onError: () => {
          setBusy(false);
          setError("Paystack couldn't open. Check your connection and try again.");
        },
      });
    });
  }

  return (
    <span className="inline-grid justify-items-end gap-1">
      <button type="button" onClick={pay} disabled={busy} className="inline-flex min-h-[34px] items-center rounded-full bg-app-ink px-3.5 text-[13px] font-bold text-white disabled:opacity-55">
        {busy ? "Opening…" : label}
      </button>
      {error ? <span role="status" className="max-w-[240px] text-right text-[12.5px] leading-[1.35] text-app-danger">{error}</span> : null}
    </span>
  );
}
