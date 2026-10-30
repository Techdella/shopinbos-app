"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addPayoutRewardAction, closePayoutWeekAction, markPayoutLinesPaidAction, voidPayoutLinesAction } from "@/app/actions/admin-payouts";
import { buttonClass, fieldClass } from "@/components/admin/AdminKit";
import { AIRTIME_MAX, AIRTIME_NETWORKS, AIRTIME_NETWORK_LABELS, PAYOUT_METHODS, PAYOUT_METHOD_LABELS, type PayoutMethod } from "@shared/payout-ledger";

// Admin › Payouts: the buttons. Mark lines paid (how + reference), cancel a line, add an airtime reward or an
// adjustment, close the week. Server actions: src/app/actions/admin-payouts.ts.

type Result = { ok: true; count: number } | { ok: false; error: string };

function useRun() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  function run(work: () => Promise<Result>, message: (count: number) => string, after?: () => void) {
    setError(null);
    setDone(null);
    startTransition(async () => {
      const result = await work();
      if (!result.ok) setError(result.error);
      else {
        setDone(message(result.count));
        after?.();
      }
      router.refresh();
    });
  }
  return { error, done, pending, run };
}

function Feedback({ error, done }: { error: string | null; done: string | null }) {
  if (error) return <p role="alert" className="m-0 text-[13px] text-app-danger">{error}</p>;
  if (done) return <p role="status" className="m-0 text-[13px] text-app-success">{done}</p>;
  return null;
}

/** "Mark paid" for some lines: opens a small form for how it was paid and the reference. */
export function MarkPaidButton({ lineIds, label = "Mark paid", amountText, defaultMethod = "bank_transfer", size = "sm" }: { lineIds: string[]; label?: string; amountText: string; defaultMethod?: PayoutMethod; size?: "sm" | "md" }) {
  const { error, done, pending, run } = useRun();
  const [open, setOpen] = useState(false);
  const [method, setMethod] = useState<PayoutMethod>(defaultMethod);
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  if (!lineIds.length) return null;
  if (!open) {
    return (
      <div className="grid gap-1">
        <button type="button" className={buttonClass("ink", size)} onClick={() => setOpen(true)}>{label} · {amountText}</button>
        <Feedback error={error} done={done} />
      </div>
    );
  }
  return (
    <div className="grid w-full gap-2 rounded-[14px] border border-app-line bg-app-canvas p-3 sm:max-w-[520px]">
      <div className="text-[13.5px] font-bold">Mark {amountText} paid ({lineIds.length} line{lineIds.length === 1 ? "" : "s"})</div>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="grid gap-1 text-[12.5px] font-bold">
          Paid how
          <select className={fieldClass} value={method} onChange={(event) => setMethod(event.target.value as PayoutMethod)}>
            {PAYOUT_METHODS.map((value) => <option key={value} value={value}>{PAYOUT_METHOD_LABELS[value]}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-[12.5px] font-bold">
          Reference{method === "bank_transfer" ? " (needed)" : ""}
          <input className={fieldClass} value={reference} maxLength={120} onChange={(event) => setReference(event.target.value)} placeholder={method === "airtime" ? "Airtime order or receipt" : "Transfer reference"} />
        </label>
      </div>
      <input className={fieldClass} value={note} maxLength={300} onChange={(event) => setNote(event.target.value)} placeholder="Note (optional)" />
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={buttonClass("ink", "sm")}
          disabled={pending}
          onClick={() => run(() => markPayoutLinesPaidAction({ lineIds, method, reference, note }), (count) => `${count} line${count === 1 ? "" : "s"} marked paid.`, () => setOpen(false))}
        >
          {pending ? "Saving…" : "Mark paid"}
        </button>
        <button type="button" className={buttonClass("white", "sm")} disabled={pending} onClick={() => setOpen(false)}>Cancel</button>
      </div>
      <Feedback error={error} done={done} />
    </div>
  );
}

/** Cancel one owed line, with a reason. */
export function VoidLineButton({ lineId }: { lineId: string }) {
  const { error, done, pending, run } = useRun();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  if (!open) return <button type="button" className={buttonClass("danger", "sm")} onClick={() => setOpen(true)}>Cancel line</button>;
  return (
    <div className="grid gap-2">
      <input className={fieldClass} value={note} maxLength={300} onChange={(event) => setNote(event.target.value)} placeholder="Why it's cancelled" />
      <div className="flex gap-2">
        <button type="button" className={buttonClass("danger", "sm")} disabled={pending} onClick={() => run(() => voidPayoutLinesAction({ lineIds: [lineId], note }), () => "Cancelled.", () => setOpen(false))}>Cancel it</button>
        <button type="button" className={buttonClass("white", "sm")} disabled={pending} onClick={() => setOpen(false)}>Keep</button>
      </div>
      <Feedback error={error} done={done} />
    </div>
  );
}

/** Add an airtime reward (or an adjustment) for any account, on this Friday's list. */
export function AddRewardForm() {
  const { error, done, pending, run } = useRun();
  const [form, setForm] = useState({ who: "", kind: "airtime_reward", amount: "", phone: "", network: "mtn", reason: "" });
  const set = (key: keyof typeof form) => (event: { target: { value: string } }) => setForm((current) => ({ ...current, [key]: event.target.value }));
  const airtime = form.kind === "airtime_reward";
  return (
    <div className="grid gap-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="grid gap-1 text-[12.5px] font-bold">
          Who (email or phone)
          <input className={fieldClass} value={form.who} onChange={set("who")} maxLength={120} placeholder="ada@example.com or 0803…" />
        </label>
        <label className="grid gap-1 text-[12.5px] font-bold">
          What
          <select className={fieldClass} value={form.kind} onChange={set("kind")}>
            <option value="airtime_reward">Airtime reward</option>
            <option value="adjustment">Adjustment (money owed)</option>
          </select>
        </label>
        <label className="grid gap-1 text-[12.5px] font-bold">
          Amount (₦){airtime ? ` up to ${AIRTIME_MAX.toLocaleString("en-NG")}` : ""}
          <input className={fieldClass} value={form.amount} onChange={set("amount")} inputMode="numeric" maxLength={12} />
        </label>
        {airtime ? (
          <>
            <label className="grid gap-1 text-[12.5px] font-bold">
              Airtime to (blank: their account phone)
              <input className={fieldClass} value={form.phone} onChange={set("phone")} inputMode="tel" maxLength={20} placeholder="0803 412 7790" />
            </label>
            <label className="grid gap-1 text-[12.5px] font-bold">
              Network
              <select className={fieldClass} value={form.network} onChange={set("network")}>
                {AIRTIME_NETWORKS.map((network) => <option key={network} value={network}>{AIRTIME_NETWORK_LABELS[network]}</option>)}
              </select>
            </label>
          </>
        ) : null}
        <label className="grid gap-1 text-[12.5px] font-bold sm:col-span-1">
          Reason
          <input className={fieldClass} value={form.reason} onChange={set("reason")} maxLength={300} placeholder="First 5 resell sales" />
        </label>
      </div>
      <div>
        <button
          type="button"
          className={buttonClass("ink", "sm")}
          disabled={pending}
          onClick={() => run(() => addPayoutRewardAction(form), () => "Added to this Friday's list.", () => setForm((current) => ({ ...current, who: "", amount: "", phone: "", reason: "" })))}
        >
          {pending ? "Adding…" : airtime ? "Add airtime reward" : "Add adjustment"}
        </button>
      </div>
      <Feedback error={error} done={done} />
    </div>
  );
}

/** Close this Friday's list once it's paid out. Anything still owed moves to next Friday's. */
export function CloseWeekButton({ payday, owedText }: { payday: string; owedText: string }) {
  const { error, done, pending, run } = useRun();
  const [confirming, setConfirming] = useState(false);
  return (
    <div className="grid gap-1">
      {confirming ? (
        <div className="flex flex-wrap items-center gap-2 text-[13px]">
          <span>{owedText} is still owed: it moves to next Friday&apos;s list.</span>
          <button type="button" className={buttonClass("ink", "sm")} disabled={pending} onClick={() => run(() => closePayoutWeekAction(payday), () => "Week closed.", () => setConfirming(false))}>Close the week</button>
          <button type="button" className={buttonClass("white", "sm")} disabled={pending} onClick={() => setConfirming(false)}>Not yet</button>
        </div>
      ) : (
        <button type="button" className={buttonClass("white", "sm")} onClick={() => setConfirming(true)}>Close this week</button>
      )}
      <Feedback error={error} done={done} />
    </div>
  );
}
