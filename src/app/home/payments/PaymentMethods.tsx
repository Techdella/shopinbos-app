"use client";

import { useState, useTransition } from "react";
import { Card, CardHead } from "@/components/app-kit";
import { Notice, Toggle } from "@/components/app-ui";
import { selectClass } from "@/components/growth/kit";
import { PAYMENT_METHODS, type PaymentMethodKey } from "@shared/onboarding";
import { TRANSFER_WINDOW_CHOICES } from "@shared/checkout-payments";
import { saveTransferWindow, savePaymentMethods } from "./actions";

function hoursLabel(hours: number) {
  return hours % 24 === 0 && hours >= 48 ? `${hours / 24} days` : `${hours} hour${hours === 1 ? "" : "s"}`;
}

export function PaymentMethods({ initial, transferWindow }: {
  initial: Record<PaymentMethodKey, boolean>;
  /** The seller's own time for bank-transfer orders (null: the default), and the default. */
  transferWindow: { hours: number | null; defaultHours: number };
}) {
  const [methods, setMethods] = useState(initial);
  const [windowHours, setWindowHours] = useState<number | null>(transferWindow.hours);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function changeWindow(value: string) {
    const previous = windowHours;
    const next = value === "default" ? null : Number(value);
    setWindowHours(next);
    setError(null);
    startTransition(async () => {
      const result = await saveTransferWindow(next);
      if (result.error) {
        setWindowHours(previous);
        setError(result.error);
      }
    });
  }

  function change(key: PaymentMethodKey, on: boolean) {
    const previous = methods;
    const next = { ...methods, [key]: on };
    setMethods(next);
    setError(null);
    startTransition(async () => {
      const result = await savePaymentMethods(next);
      if (result.error) {
        setMethods(previous);
        setError(result.error);
      }
    });
  }

  return (
    <Card className="p-5">
      <CardHead title="Ways customers can pay" sub={pending ? "Saving" : "Customers see these at checkout"} />
      <ul className="m-0 mt-2 list-none divide-y divide-app-line p-0">
        {PAYMENT_METHODS.map((method) => (
          <li key={method.key} className="flex min-h-[60px] items-center gap-3 py-2.5">
            <span className="min-w-0 flex-1">
              <span className="block text-[14.5px] font-bold">{method.label}</span>
              <span className="block text-[12.5px] leading-[1.4] text-app-ink-soft">{method.hint}</span>
            </span>
            <Toggle on={methods[method.key]} onChange={(on) => change(method.key, on)} label={method.label} />
          </li>
        ))}
      </ul>
      {methods.transfer && (
        <div className="mt-2 border-t border-app-line pt-3">
          <label htmlFor="transfer-window" className="block text-[14.5px] font-bold">Time to pay by transfer</label>
          <span className="block text-[12.5px] leading-[1.4] text-app-ink-soft">Unpaid transfer orders give their items back after this and are cancelled. Buyers see the deadline on their order page.</span>
          <select id="transfer-window" className={`${selectClass} mt-2`} value={windowHours === null ? "default" : String(windowHours)} onChange={(event) => changeWindow(event.target.value)} disabled={pending}>
            <option value="default">{hoursLabel(transferWindow.defaultHours)} (default)</option>
            {TRANSFER_WINDOW_CHOICES.filter((hours) => hours !== transferWindow.defaultHours).map((hours) => (
              <option key={hours} value={hours}>{hoursLabel(hours)}</option>
            ))}
          </select>
        </div>
      )}
      <p className="m-0 mt-2 text-[12.5px] leading-[1.45] text-app-ink-soft">
        Bank transfer shows on the payment page once your bank is checked. Pay on delivery shows for orders up to ₦50,000 in your delivery zones.
      </p>
      {error && <div className="mt-3"><Notice>{error}</Notice></div>}
    </Card>
  );
}
