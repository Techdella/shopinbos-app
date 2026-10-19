"use client";

import { useState } from "react";
import { useLocale, useT } from "@/components/i18n/I18nProvider";
import { formatNumber } from "@shared/i18n";

export type StoreLaunchPricing = { total: number; deposit: number };

export function StoreLaunchBillingModal({ open, pricing, onClose }: {
  open: boolean;
  pricing: StoreLaunchPricing | null;
  onClose: () => void;
}) {
  const t = useT("payments");
  const locale = useLocale();
  const [option, setOption] = useState<"full" | "installment">("full");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (!open || !pricing) return null;
  const balance = Math.max(0, pricing.total - pricing.deposit);
  const money = (amount: number) => `NGN ${formatNumber(amount, locale)}`;

  async function continueToPaystack() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/billing/store-launch/initialize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ option, returnTo: window.location.pathname }),
      });
      const json = (await response.json().catch(() => null)) as {
        data?: { authorizationUrl?: string };
        error?: { message?: string };
      } | null;
      if (!response.ok || !json?.data?.authorizationUrl) {
        throw new Error(json?.error?.message ?? t("lm.openFailed"));
      }
      window.location.assign(json.data.authorizationUrl);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("lm.openFailed"));
      setBusy(false);
    }
  }

  const choices = [
    { value: "full" as const, title: t("lm.full"), price: t("lm.now", { amount: money(pricing.total) }), body: t("lm.fullBody") },
    { value: "installment" as const, title: t("lm.part"), price: t("lm.now", { amount: money(pricing.deposit) }), body: t("lm.partBody", { amount: money(balance) }) },
  ];

  return (
    <div className="fixed inset-0 z-[1000] grid place-items-center bg-black/50 px-4" role="presentation" onMouseDown={() => !busy && onClose()}>
      <div role="dialog" aria-modal="true" aria-labelledby="store-launch-billing-title" className="w-full max-w-[520px] rounded-2xl bg-white p-6 text-left shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-teal-700">{t("lm.eyebrow")}</div>
            <h2 id="store-launch-billing-title" className="mt-1 text-2xl font-semibold text-[#0e2a38]">{t("lm.title")}</h2>
          </div>
          <button type="button" onClick={onClose} disabled={busy} aria-label={t("lm.closeAria")} className="rounded-lg px-3 py-1.5 text-xl text-neutral-500 hover:bg-neutral-100">×</button>
        </div>
        <p className="mt-2 text-[13px] leading-5 text-neutral-600">{t("lm.sub")}</p>
        <div className="mt-5 grid gap-3">
          {choices.map((item) => (
            <button key={item.value} type="button" aria-pressed={option === item.value} onClick={() => setOption(item.value)} className={`flex w-full items-start gap-3 rounded-xl border p-4 text-left ${option === item.value ? "border-teal-500 bg-teal-50" : "border-neutral-200 bg-white"}`}>
              <span className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border-2 ${option === item.value ? "border-teal-600" : "border-neutral-300"}`}>
                {option === item.value && <span className="h-2.5 w-2.5 rounded-full bg-teal-600" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap justify-between gap-2 text-sm font-semibold text-neutral-900"><span>{item.title}</span><span>{item.price}</span></span>
                <span className="mt-1 block text-xs leading-5 text-neutral-500">{item.body}</span>
              </span>
            </button>
          ))}
        </div>
        {error && <p className="mt-3 text-xs font-semibold text-red-700" role="alert">{error}</p>}
        <button type="button" onClick={() => void continueToPaystack()} disabled={busy} className="mt-5 w-full rounded-xl bg-teal-500 px-5 py-3 text-sm font-semibold text-[#0e2a38] hover:bg-teal-400 disabled:cursor-wait disabled:opacity-60">
          {busy ? t("lb.opening") : t("lm.continue", { amount: money(option === "full" ? pricing.total : pricing.deposit) })}
        </button>
        <p className="mt-3 text-center text-[11px] text-neutral-400">{t("lm.secure")}</p>
      </div>
    </div>
  );
}
