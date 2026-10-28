"use client";

import { useState } from "react";
import { useT } from "@/components/i18n/I18nProvider";

// The store's returns switch (shared/fault-matrix.ts row 6): take returns or not, the days after delivery, and who
// pays the trip back. Saves through PATCH /api/app/returns-settings. On /home/shipping.

export interface ReturnsSetting {
  returnsAllowed: boolean;
  returnWindowDays: number;
  returnShippingPayer: string;
}

export function ReturnsSettingCard({ initial }: { initial: ReturnsSetting }) {
  const t = useT("faults");
  const [value, setValue] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  async function save(next: ReturnsSetting) {
    setValue(next);
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch("/api/app/returns-settings", { method: "PATCH", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(next) });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error?.message ?? t("error.generic"));
      setValue(json.data);
      setNote({ ok: true, text: t("settings.saved") });
    } catch (error) {
      setNote({ ok: false, text: error instanceof Error ? error.message : t("error.generic") });
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="grid gap-3 rounded-[22px] border border-app-line bg-white p-5" aria-labelledby="returns-setting" data-testid="returns-setting">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 id="returns-setting" className="m-0 text-[17px] font-extrabold">{t("settings.title")}</h2>
          <p className="m-0 mt-1 max-w-[62ch] text-[13.5px] text-app-ink-soft">{t("settings.sub")}</p>
        </div>
        <label className="inline-flex shrink-0 cursor-pointer items-center gap-2 text-[14px] font-bold">
          <input type="checkbox" role="switch" checked={value.returnsAllowed} disabled={busy} onChange={(event) => void save({ ...value, returnsAllowed: event.target.checked })} className="h-5 w-5 accent-[#0E2A38]" />
          {t("settings.allow")}
        </label>
      </div>
      {value.returnsAllowed ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid min-w-0 gap-1 text-[13px] font-bold">
            {t("settings.window")}
            <select value={value.returnWindowDays} disabled={busy} onChange={(event) => void save({ ...value, returnWindowDays: Number(event.target.value) })} className="h-11 w-full min-w-0 rounded-full border border-app-line bg-white px-4 text-[14px] font-normal">
              {[3, 7, 14, 30].map((days) => <option key={days} value={days}>{days}</option>)}
            </select>
          </label>
          <label className="grid min-w-0 gap-1 text-[13px] font-bold">
            {t("settings.payer")}
            <select value={value.returnShippingPayer} disabled={busy} onChange={(event) => void save({ ...value, returnShippingPayer: event.target.value })} className="h-11 w-full min-w-0 rounded-full border border-app-line bg-white px-4 text-[14px] font-normal">
              <option value="customer">{t("settings.payer.customer")}</option>
              <option value="seller">{t("settings.payer.seller")}</option>
            </select>
          </label>
        </div>
      ) : null}
      {note ? <p role="status" className={`m-0 text-[13px] font-bold ${note.ok ? "text-app-success" : "text-app-danger"}`}>{note.text}</p> : null}
    </section>
  );
}
