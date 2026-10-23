"use client";

import { useState } from "react";
import { useT } from "@/components/i18n/I18nProvider";
import { cx } from "@/components/app-ui/cx";
import { useAppSession } from "@/components/billing/useAppSession";
import type { ExtraKind } from "@shared/plan-extras";
import { friendlyError } from "@/lib/errors/report-client";

// Pays for an add-on or boost through Paystack (src/app/api/app/extras/checkout) and comes back to this page.
// Hidden on pages the phone app opened (app store rules).

export function BuyExtraButton({
  kind,
  quantity = 1,
  target,
  label,
  className,
  disabled,
}: {
  kind: ExtraKind;
  quantity?: number;
  target?: string | null;
  label: string;
  className?: string;
  disabled?: boolean;
}) {
  const t = useT("payments");
  const inApp = useAppSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (inApp) return null;

  async function buy() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/app/extras/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind, quantity, target: target ?? undefined, returnTo: `${window.location.pathname}${window.location.search}` }),
      });
      const json = (await response.json().catch(() => null)) as { data?: { authorizationUrl?: string }; error?: { message?: string } } | null;
      if (!response.ok || !json?.data?.authorizationUrl) throw new Error(json?.error?.message ?? t("ex.failed"));
      window.location.href = json.data.authorizationUrl;
    } catch (failure) {
      setError(failure instanceof Error ? friendlyError(failure) : t("ex.failed"));
      setBusy(false);
    }
  }

  return (
    <span className="inline-grid gap-1">
      <button
        type="button"
        onClick={buy}
        disabled={busy || disabled}
        className={cx("inline-flex min-h-[44px] items-center justify-center rounded-full bg-app-ink px-5 text-[14px] font-extrabold text-white transition hover:bg-black disabled:opacity-55", className)}
      >
        {busy ? t("ex.opening") : label}
      </button>
      {error ? <span role="alert" className="text-[12.5px] text-app-danger">{error}</span> : null}
    </span>
  );
}
