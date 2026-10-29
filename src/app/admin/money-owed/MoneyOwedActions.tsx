"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { decideClaimAction, giveMoreTimeAction, recordDebtAction, waiveDebtAction } from "@/app/actions/money-owed";
import { buttonClass, fieldClass } from "@/components/admin/AdminKit";
import { DEBT_REASONS } from "@/lib/money-owed/rules";

// The team's decisions on money owed: uphold a claim (for the amount settled on) or reject it, cancel what's left
// of a debt, and record a debt decided outside the app. Both businesses see the note.

function useRun() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  function run(work: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) {
    setError(null);
    startTransition(async () => {
      const result = await work();
      if (!result.ok) setError(result.error ?? "That didn't work.");
      else after?.();
      router.refresh();
    });
  }
  return { error, pending, run };
}

export function DebtDecision({ debtId, pending: claim, amount: claimed }: { debtId: string; pending: boolean; amount: string }) {
  const { error, pending, run } = useRun();
  const [note, setNote] = useState("");
  const [amount, setAmount] = useState(claimed);
  return (
    <div className="grid gap-2 border-t border-app-line pt-3">
      <textarea className={`${fieldClass} min-h-[64px] py-2`} value={note} onChange={(event) => setNote(event.target.value)} placeholder="The reason for the decision (both businesses see it)" />
      <div className="flex flex-wrap items-center gap-2">
        {claim ? (
          <>
            <label className="flex items-center gap-2 text-[13px] font-bold">
              Owed ₦
              <input className={`${fieldClass} w-[130px]`} inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} />
            </label>
            <button type="button" className={buttonClass("ink", "sm")} disabled={pending} onClick={() => run(() => decideClaimAction(debtId, true, amount, note))}>Uphold</button>
            <button type="button" className={buttonClass("white", "sm")} disabled={pending} onClick={() => run(() => decideClaimAction(debtId, false, "", note))}>Reject</button>
          </>
        ) : (
          <button type="button" className={buttonClass("white", "sm")} disabled={pending} onClick={() => run(() => giveMoreTimeAction(debtId, note))}>Give 7 more days</button>
        )}
        <button type="button" className={buttonClass("danger", "sm")} disabled={pending} onClick={() => run(() => waiveDebtAction(debtId, note))}>Cancel what&apos;s left</button>
      </div>
      {error ? <p role="alert" className="m-0 text-[13px] text-app-danger">{error}</p> : null}
    </div>
  );
}

export function RecordDebtForm() {
  const { error, pending, run } = useRun();
  const [form, setForm] = useState({ debtorEmail: "", creditorEmail: "", reason: "wrong_item", amount: "", details: "" });
  const [saved, setSaved] = useState(false);
  const set = (key: keyof typeof form) => (event: { target: { value: string } }) => {
    setSaved(false);
    setForm((current) => ({ ...current, [key]: event.target.value }));
  };
  return (
    <form
      className="grid gap-2 sm:grid-cols-2"
      onSubmit={(event) => {
        event.preventDefault();
        run(() => recordDebtAction(form), () => {
          setSaved(true);
          setForm({ debtorEmail: "", creditorEmail: "", reason: "wrong_item", amount: "", details: "" });
        });
      }}
    >
      <input className={fieldClass} type="email" required value={form.debtorEmail} onChange={set("debtorEmail")} placeholder="Owed by (account email)" />
      <input className={fieldClass} type="email" required value={form.creditorEmail} onChange={set("creditorEmail")} placeholder="Owed to (account email)" />
      <select className={fieldClass} value={form.reason} onChange={set("reason")}>
        {Object.entries(DEBT_REASONS).filter(([key]) => key !== "overpaid" && key !== "chargeback").map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </select>
      <input className={fieldClass} inputMode="decimal" required value={form.amount} onChange={set("amount")} placeholder="Amount (₦)" />
      <textarea className={`${fieldClass} min-h-[72px] py-2 sm:col-span-2`} required value={form.details} onChange={set("details")} placeholder="What it's for: order number, what happened, what was decided" />
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <button type="submit" className={buttonClass("ink", "sm")} disabled={pending}>Record it</button>
        {saved ? <span className="text-[13px] font-bold text-app-forest">Recorded. They&apos;ve been told.</span> : null}
        {error ? <span role="alert" className="text-[13px] text-app-danger">{error}</span> : null}
      </div>
    </form>
  );
}
