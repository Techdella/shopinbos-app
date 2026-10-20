"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/components/i18n/I18nProvider";
import { BuyExtraButton } from "@/components/plans/BuyExtraButton";
import { FIELD_SELECT } from "@/components/seller-settings/fields";
import type { ExtraKind } from "@shared/plan-extras";

// Weeks (and the state or product) for a boost, then the Paystack checkout. Supplier Pro can also start one of
// the plan's own featured weeks here.
export function BoostForm({
  kind,
  unitPrice,
  targets,
  targetLabel,
  includedLeft = 0,
}: {
  kind: ExtraKind;
  unitPrice: number;
  targets?: Array<{ value: string; label: string }>;
  targetLabel?: string;
  includedLeft?: number;
}) {
  const t = useT("payments");
  const router = useRouter();
  const [weeks, setWeeks] = useState(1);
  const [target, setTarget] = useState(targets?.[0]?.value ?? "");
  const [note, setNote] = useState<string | null>(null);
  const price = `₦${(unitPrice * weeks).toLocaleString("en-NG")}`;

  async function useIncluded() {
    const response = await fetch("/api/app/extras/featured-week", { method: "POST" });
    const json = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
    setNote(response.ok ? t("bo.started") : json?.error?.message ?? t("ex.failed"));
    router.refresh();
  }

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-end gap-3">
        {targets ? (
          <label className="grid min-w-0 flex-1 basis-[180px] gap-1 text-[13px] font-bold">
            {targetLabel}
            <select value={target} onChange={(event) => setTarget(event.target.value)} className={`${FIELD_SELECT} h-[44px]`}>
              {targets.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
        ) : null}
        <label className="grid basis-[120px] gap-1 text-[13px] font-bold">
          <span className="sr-only">{t("bo.weeks", { count: weeks })}</span>
          <select value={weeks} onChange={(event) => setWeeks(Number(event.target.value))} className={`${FIELD_SELECT} h-[44px]`} aria-label={t("bo.weeks", { count: weeks })}>
            {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{t("bo.weeks", { count: n })}</option>)}
          </select>
        </label>
        <BuyExtraButton kind={kind} quantity={weeks} target={targets ? target : null} disabled={Boolean(targets) && !target} label={t("bo.buy", { price })} />
      </div>
      {includedLeft > 0 ? (
        <button type="button" onClick={useIncluded} className="justify-self-start text-[13.5px] font-bold text-app-ink underline underline-offset-2">
          {t("bo.useWeek")} · {t("bo.left", { count: includedLeft })}
        </button>
      ) : null}
      {note ? <p role="status" className="m-0 text-[13px] text-app-ink-soft">{note}</p> : null}
    </div>
  );
}
