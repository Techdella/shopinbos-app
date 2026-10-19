"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, CardHead } from "@/components/app-kit";
import { Notice, PillButton, Toggle } from "@/components/app-ui";
import { Icon } from "@/components/ui/Icon";
import { selectClass } from "@/components/growth/kit";
import { BankLinkingModal } from "@/components/payments/BankLinkingModal";
import { PAYMENT_METHODS, type PaymentMethodKey } from "@shared/onboarding";
import { TRANSFER_WINDOW_CHOICES } from "@shared/checkout-payments";
import type { PaymentMethodState } from "@shared/seller-payments";
import { saveTransferWindow, savePaymentMethods } from "./actions";
import { useT } from "@/components/i18n/I18nProvider";

// Ways customers can pay, each saying whether it reaches checkout yet (shared/seller-payments.ts paymentMethodStates).
// Card, the second card checkout and bank transfer all pay into the seller's bank, so until one is added they're
// replaced by one "add your bank" step (which also sets up their wallet); after that they show with their switches.

const NEEDS_BANK = new Set<PaymentMethodKey>(["card", "korapay", "transfer"]);

export function PaymentMethods({ initial, states, transferWindow }: {
  initial: Record<PaymentMethodKey, boolean>;
  states: Record<PaymentMethodKey, PaymentMethodState>;
  /** The seller's own time for bank-transfer orders (null: the default), and the default. */
  transferWindow: { hours: number | null; defaultHours: number };
}) {
  const t = useT("payments", "home", "common");
  const router = useRouter();
  const hoursLabel = (hours: number) => (hours % 24 === 0 && hours >= 48 ? t("methods.days", { count: hours / 24 }) : t("methods.hours", { count: hours }));
  const [methods, setMethods] = useState(initial);
  const [windowHours, setWindowHours] = useState<number | null>(transferWindow.hours);
  const [error, setError] = useState<string | null>(null);
  const [bankOpen, setBankOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const needsBank = states.card === "needs_bank";
  const shown = PAYMENT_METHODS.filter((method) => states[method.key] !== "hidden" && !(needsBank && NEEDS_BANK.has(method.key)));

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

  /** Why a switched-on method isn't at checkout yet, with what to do about it. */
  function whyNot(key: PaymentMethodKey) {
    const state = states[key];
    if (state === "live" || state === "hidden" || !methods[key]) return null;
    if (state === "needs_bank") return <button type="button" className="font-bold underline" onClick={() => setBankOpen(true)}>{t("methods.state.needs_bank")}</button>;
    if (state === "needs_whatsapp") return <Link href="/home/marketing/chat" className="font-bold underline">{t("methods.state.needs_whatsapp")}</Link>;
    if (state === "bank_failed") return <button type="button" className="font-bold underline" onClick={() => setBankOpen(true)}>{t("methods.state.bank_failed")}</button>;
    return t.dynamic(`methods.state.${state}`, "");
  }

  return (
    <Card className="p-5">
      <CardHead title={t("methods.title")} sub={pending ? t("methods.saving") : t("methods.seen")} />
      {needsBank ? (
        <div className="mt-3 rounded-[18px] bg-app-canvas p-4">
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[12px] bg-white"><Icon name="bank" size={18} /></span>
            <span className="min-w-0 flex-1">
              <span className="block text-[14.5px] font-bold">{t("methods.setup.title")}</span>
              <span className="block text-[12.5px] leading-[1.45] text-app-ink-soft">{t("methods.setup.body")}</span>
            </span>
          </div>
          <PillButton size="md" tone="ink" className="mt-3 w-full" onClick={() => setBankOpen(true)}>
            <Icon name="plus" size={16} /> {t("methods.setup.cta")}
          </PillButton>
        </div>
      ) : null}
      <ul className="m-0 mt-2 list-none divide-y divide-app-line p-0">
        {shown.map((method) => {
          const reason = whyNot(method.key);
          return (
            <li key={method.key} className="flex min-h-[60px] items-center gap-3 py-2.5">
              <span className="min-w-0 flex-1">
                <span className="block text-[14.5px] font-bold">{t.dynamic(`pm.${method.key}.label`, method.label)}</span>
                <span className="block text-[12.5px] leading-[1.4] text-app-ink-soft">{t.dynamic(`pm.${method.key}.hint`, method.hint)}</span>
                {reason ? <span className="mt-1 block text-[12.5px] leading-[1.4] text-app-accent-ink">{reason}</span> : null}
              </span>
              <Toggle on={methods[method.key]} onChange={(on) => change(method.key, on)} label={t.dynamic(`pm.${method.key}.label`, method.label)} />
            </li>
          );
        })}
      </ul>
      {methods.transfer && !needsBank && (
        <div className="mt-2 border-t border-app-line pt-3">
          <label htmlFor="transfer-window" className="block text-[14.5px] font-bold">{t("methods.window")}</label>
          <span className="block text-[12.5px] leading-[1.4] text-app-ink-soft">{t("methods.windowHint")}</span>
          <select id="transfer-window" className={`${selectClass} mt-2`} value={windowHours === null ? "default" : String(windowHours)} onChange={(event) => changeWindow(event.target.value)} disabled={pending}>
            <option value="default">{t("methods.default", { label: hoursLabel(transferWindow.defaultHours) })}</option>
            {TRANSFER_WINDOW_CHOICES.filter((hours) => hours !== transferWindow.defaultHours).map((hours) => (
              <option key={hours} value={hours}>{hoursLabel(hours)}</option>
            ))}
          </select>
        </div>
      )}
      <p className="m-0 mt-2 text-[12.5px] leading-[1.45] text-app-ink-soft">
        {t("methods.note")}
      </p>
      {error && <div className="mt-3"><Notice>{error}</Notice></div>}
      <BankLinkingModal isOpen={bankOpen} onClose={() => setBankOpen(false)} onSuccess={() => router.refresh()} role="seller" />
    </Card>
  );
}
