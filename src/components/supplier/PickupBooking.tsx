"use client";

import { confirmDialog } from "@/components/ui/dialogs";
import { useState } from "react";
import type { PickupSlot } from "@shared/supplier-pickup";
import { useT } from "@/components/i18n/I18nProvider";

// After "I've packed it": "When can a rider pick it up?" with big choices (the soonest is already picked), the
// pickup address (the supplier's saved one), then "Book the rider". Once booked: "Rider booked: pick up today
// 12–4pm. We'll message you when they're on the way." The time can change, or the pickup be cancelled, until a
// rider has the job. Talks to /api/supplier/orders/[id]/pickup (src/lib/supplier-orders/pickup.server.ts).

export interface PickupView {
  kind: "dropship" | "wholesale";
  orderId: string;
  packed: boolean;
  packable: boolean;
  address: string;
  slots: PickupSlot[];
  preselected: string;
  customDays: Array<{ day: string; label: string }>;
  customHours: number[];
  pickup: null | {
    status: string;
    text: string | null;
    address: string;
    slotKey: string;
    partner: string | null;
    rider: string | null;
    jobStatus: string | null;
    changeable: boolean;
    title: string;
    body: string;
  };
}

function hourWords(hour: number) {
  const word = (h: number) => `${h % 12 === 0 ? 12 : h % 12}${h < 12 ? "am" : "pm"}`;
  return `${word(hour)} – ${word(hour + 2)}`;
}

const chip = (on: boolean) =>
  `flex min-h-[64px] w-full items-center gap-3 rounded-[18px] border-2 px-4 text-left text-[16px] font-extrabold transition ${on ? "border-app-ink bg-white" : "border-app-line bg-white hover:border-app-line-strong"}`;

export function PickupBooking({ initial, shop }: { initial: PickupView; shop: string }) {
  const t = useT("supplier", "common");
  const [state, setState] = useState<PickupView>(initial);
  const [choice, setChoice] = useState<string>(initial.preselected);
  const [day, setDay] = useState(initial.customDays[0]?.day ?? "");
  const [hour, setHour] = useState<number>(initial.customHours.find((h) => h >= 12) ?? initial.customHours[0] ?? 12);
  const [address, setAddress] = useState(initial.pickup?.address ?? initial.address);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const url = `/api/supplier/orders/${encodeURIComponent(state.orderId)}/pickup?kind=${state.kind}`;

  async function call(method: "POST" | "DELETE", body?: unknown, label = "save") {
    setBusy(label);
    setError(null);
    try {
      const response = await fetch(url, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined, credentials: "same-origin" });
      const json = (await response.json().catch(() => null)) as { data?: PickupView; error?: { message?: string } } | null;
      if (!response.ok || !json?.data) throw new Error(json?.error?.message ?? t("pickup.errorConnection"));
      setState(json.data);
      setEditing(false);
      if (json.data.slots.length && !json.data.slots.some((slot) => slot.key === choice) && choice !== "custom") setChoice(json.data.preselected);
    } catch (callError) {
      setError(callError instanceof Error ? callError.message : t("pickup.errorRetry"));
    } finally {
      setBusy(null);
    }
  }

  const book = () => call("POST", { intent: "book", kind: state.kind, slot: choice, ...(choice === "custom" ? { day, startHour: hour } : {}), address }, "book");

  if (!state.packed && state.packable) {
    return (
      <div className="grid gap-3">
        {error && <p role="alert" className="m-0 rounded-[14px] bg-app-danger-tint px-4 py-3 text-[14.5px] font-bold text-app-danger">{error}</p>}
        <button type="button" onClick={() => void call("POST", { intent: "packed", kind: state.kind }, "packed")} disabled={Boolean(busy)} className="inline-flex min-h-[56px] w-full items-center justify-center rounded-full bg-app-ink px-6 text-[17px] font-extrabold text-white disabled:opacity-60">
          {busy === "packed" ? t("saving") : t("pickup.packed")}
        </button>
      </div>
    );
  }
  if (!state.packed) return null;

  if (state.pickup && !editing) {
    const pickup = state.pickup;
    const finding = pickup.status === "finding_rider";
    return (
      <div className="grid gap-3">
        <div className={`grid gap-1 rounded-[18px] p-5 ${finding ? "bg-[#FDF0D9]" : "bg-app-success-tint"}`}>
          <p className="m-0 text-[22px] font-extrabold leading-tight">{pickup.title}</p>
          <p className="m-0 text-[15px] leading-relaxed">{pickup.body}</p>
          <p className="m-0 mt-1 text-[14px] text-app-ink-soft">{t("pickup.from", { address: pickup.address })}</p>
          {pickup.partner && <p className="m-0 text-[14px] text-app-ink-soft">{t("pickup.deliveryCompany", { partner: pickup.partner })}</p>}
        </div>
        {error && <p role="alert" className="m-0 rounded-[14px] bg-app-danger-tint px-4 py-3 text-[14.5px] font-bold text-app-danger">{error}</p>}
        {pickup.changeable ? (
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => { setEditing(true); setAddress(pickup.address); }} className="inline-flex min-h-[44px] items-center rounded-full border border-app-line bg-white px-5 text-[14.5px] font-extrabold">{t("pickup.changeTime")}</button>
            <button type="button" disabled={Boolean(busy)} onClick={async () => { if ((await confirmDialog(t("pickup.cancelConfirm")))) void call("DELETE", undefined, "cancel"); }} className="inline-flex min-h-[44px] items-center rounded-full px-4 text-[14.5px] font-bold text-app-ink-soft underline underline-offset-4">
              {busy === "cancel" ? t("pickup.cancelling") : t("pickup.cancel")}
            </button>
          </div>
        ) : pickup.rider ? (
          <p className="m-0 text-[14px] text-app-ink-soft">{t("pickup.riderHasJob", { shop })}</p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      <h2 className="m-0 text-[22px] font-extrabold leading-tight">{t("pickup.question")}</h2>
      <div role="radiogroup" aria-label={t("pickup.timeAria")} className="grid gap-2 sm:grid-cols-2">
        {state.slots.map((slot) => (
          <button key={slot.key} type="button" role="radio" aria-checked={choice === slot.key} onClick={() => setChoice(slot.key)} className={chip(choice === slot.key)}>
            <span aria-hidden="true" className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 ${choice === slot.key ? "border-app-ink" : "border-app-line-strong"}`}>{choice === slot.key && <span className="h-3 w-3 rounded-full bg-app-ink" />}</span>
            {slot.label}
          </button>
        ))}
        <button type="button" role="radio" aria-checked={choice === "custom"} onClick={() => setChoice("custom")} className={chip(choice === "custom")}>
          <span aria-hidden="true" className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 ${choice === "custom" ? "border-app-ink" : "border-app-line-strong"}`}>{choice === "custom" && <span className="h-3 w-3 rounded-full bg-app-ink" />}</span>
          {t("pickup.pickTime")}
        </button>
      </div>
      {choice === "custom" && (
        <div className="grid gap-3 rounded-[18px] bg-app-canvas p-4 sm:grid-cols-2">
          <label className="grid gap-1 text-[15px] font-bold">
            {t("pickup.day")}
            <select value={day} onChange={(event) => setDay(event.target.value)} className="min-h-[48px] rounded-[14px] border border-app-line bg-white px-3 text-[16px]">
              {state.customDays.map((option) => <option key={option.day} value={option.day}>{option.label}</option>)}
            </select>
          </label>
          <label className="grid gap-1 text-[15px] font-bold">
            {t("pickup.time")}
            <select value={hour} onChange={(event) => setHour(Number(event.target.value))} className="min-h-[48px] rounded-[14px] border border-app-line bg-white px-3 text-[16px]">
              {state.customHours.map((option) => <option key={option} value={option}>{hourWords(option)}</option>)}
            </select>
          </label>
        </div>
      )}
      <label className="grid gap-1 text-[15px] font-bold">
        {t("pickup.where")}
        <input value={address} onChange={(event) => setAddress(event.target.value)} maxLength={300} placeholder={t("pickup.addressPlaceholder")} className="min-h-[52px] rounded-[14px] border border-app-line bg-white px-4 text-[16px] font-normal outline-none focus:border-app-ink" />
        <span className="text-[13.5px] font-normal text-app-ink-soft">{state.address ? t("pickup.savedAddress") : t("pickup.saveForNext")}</span>
      </label>
      {error && <p role="alert" className="m-0 rounded-[14px] bg-app-danger-tint px-4 py-3 text-[14.5px] font-bold text-app-danger">{error}</p>}
      <button type="button" onClick={() => void book()} disabled={Boolean(busy)} className="inline-flex min-h-[56px] w-full items-center justify-center rounded-full bg-app-ink px-6 text-[17px] font-extrabold text-white disabled:opacity-60">
        {busy === "book" ? t("pickup.booking") : editing ? t("pickup.saveNewTime") : t("pickup.book")}
      </button>
      {editing && <button type="button" onClick={() => setEditing(false)} className="min-h-[40px] text-[14.5px] font-bold text-app-ink-soft underline underline-offset-4">{t("pickup.keepOldTime")}</button>}
    </div>
  );
}
