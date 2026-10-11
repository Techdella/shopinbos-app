"use client";

import { useState, useTransition } from "react";
import { Card, CardHead } from "@/components/app-kit";
import { Notice, Toggle } from "@/components/app-ui";
import { PAYMENT_METHODS, type PaymentMethodKey } from "@shared/onboarding";
import { savePaymentMethods } from "./actions";

export function PaymentMethods({ initial }: { initial: Record<PaymentMethodKey, boolean> }) {
  const [methods, setMethods] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

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
      <p className="m-0 mt-2 text-[12.5px] leading-[1.45] text-app-ink-soft">
        Bank transfer shows at checkout once your payout bank is verified. Pay on delivery shows for orders up to ₦50,000 in your delivery zones.
      </p>
      {error && <div className="mt-3"><Notice>{error}</Notice></div>}
    </Card>
  );
}
