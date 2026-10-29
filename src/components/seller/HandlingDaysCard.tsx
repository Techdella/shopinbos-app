"use client";

import { useState } from "react";
import { useT } from "@/components/i18n/I18nProvider";
import { HANDLING_DAY_CHOICES } from "@shared/cart-checkout";

// The store's handling time (Store.handlingDays): how many days it takes to send an order of its own stock. Customers
// then see "Arrives Mon 3 – Thu 6 Nov" at checkout instead of "2-3 days" (shared/cart-checkout.ts ownArrival). Saves
// through PATCH /api/app/handling-days. On /home/shipping.

export function HandlingDaysCard({ initial }: { initial: number }) {
  const t = useT("shipping");
  const [value, setValue] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  async function save(next: number) {
    const before = value;
    setValue(next);
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch("/api/app/handling-days", { method: "PATCH", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ handlingDays: next }) });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error?.message ?? t("handling.error"));
      setValue(json.data.handlingDays);
      setNote({ ok: true, text: t("handling.saved") });
    } catch (error) {
      setValue(before);
      setNote({ ok: false, text: error instanceof Error ? error.message : t("handling.error") });
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="grid gap-3 rounded-[22px] border border-app-line bg-white p-5" aria-labelledby="handling-days">
      <div>
        <h2 id="handling-days" className="m-0 text-[17px] font-extrabold">{t("handling.title")}</h2>
        <p className="m-0 mt-1 max-w-[62ch] text-[13.5px] text-app-ink-soft">{t("handling.sub")}</p>
      </div>
      <label className="grid max-w-[320px] gap-1 text-[13px] font-bold">
        {t("handling.label")}
        <select value={value} disabled={busy} onChange={(event) => void save(Number(event.target.value))} className="h-11 w-full min-w-0 rounded-full border border-app-line bg-white px-4 text-[14px] font-normal">
          {HANDLING_DAY_CHOICES.map((days) => <option key={days} value={days}>{days === 0 ? t("handling.sameDay") : t("handling.days", { count: days })}</option>)}
        </select>
      </label>
      {note ? <p role="status" className={`m-0 text-[13px] font-bold ${note.ok ? "text-app-success" : "text-app-danger"}`}>{note.text}</p> : null}
    </section>
  );
}
