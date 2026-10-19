"use client";

import { useState } from "react";
import { useLocale, useT } from "@/components/i18n/I18nProvider";
import { formatDate, formatNumber } from "@shared/i18n";
import { useAppSession } from "@/components/billing/useAppSession";

export function StoreLaunchBalanceCard({ balanceDue, dueAt }: { balanceDue: number; dueAt?: string | null }) {
  const t = useT("payments");
  const locale = useLocale();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const inApp = useAppSession();

  if (balanceDue <= 0 || inApp) return null;
  const dueLabel = dueAt
    ? formatDate(dueAt, locale, { dateStyle: "long" })
    : t("lb.endOfMonth");

  async function payBalance() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/billing/store-launch/balance/initialize", { method: "POST" });
      const json = await response.json().catch(() => null) as { data?: { authorizationUrl?: string }; error?: { message?: string } } | null;
      if (!response.ok || !json?.data?.authorizationUrl) throw new Error(json?.error?.message ?? t("lb.startFailed"));
      window.location.assign(json.data.authorizationUrl);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("lb.startFailed"));
      setBusy(false);
    }
  }

  return (
    <section className="rounded-[22px] border border-[#F2D9A8] bg-white p-5">
      <h2 className="m-0 text-[15px] font-extrabold text-[#8A5A00]">{t("lb.title")}</h2>
      <div className="mt-1.5 text-[26px] font-extrabold tracking-[-0.5px]">NGN {formatNumber(balanceDue, locale)}</div>
      <p className="mb-4 mt-1.5 text-[13.5px] text-app-ink-soft">{t("lb.due", { date: dueLabel })}</p>
      {error && <p role="alert" className="mb-3 mt-0 text-[13px] text-app-danger">{error}</p>}
      <button
        type="button"
        onClick={() => void payBalance()}
        disabled={busy}
        className="inline-flex min-h-[44px] items-center justify-center rounded-full bg-app-accent px-5 text-[14px] font-extrabold text-white transition hover:brightness-95 disabled:opacity-55"
      >
        {busy ? t("lb.opening") : t("lb.pay")}
      </button>
    </section>
  );
}
