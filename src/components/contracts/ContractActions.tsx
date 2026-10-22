"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  adminCloseDisputeAction,
  adminOpenContractAction,
  declineContractAction,
  raiseDisputeAction,
  signContractAction,
  signWrittenCopyAction,
  withdrawDisputeAction,
} from "@/app/actions/contracts";
import { useT } from "@/components/i18n/I18nProvider";
import { cleanSignedName } from "@shared/contracts";

// The buttons around a contract (src/app/actions/contracts.ts): signing with a typed name, declining, raising or
// withdrawing a dispute, printing, and for the team opening a disputed contract or settling the dispute.

type Result = { ok: true } | { ok: false; error: string };

const INPUT = "w-full rounded-[12px] border border-app-line bg-white px-3 py-2 text-[14px]";
const PRIMARY = "inline-flex min-h-[44px] items-center justify-center rounded-full bg-app-accent px-5 text-[14px] font-extrabold text-white disabled:opacity-50";
const SECONDARY = "inline-flex min-h-[44px] items-center justify-center rounded-full border border-app-line bg-white px-5 text-[14px] font-extrabold text-app-ink disabled:opacity-50";

function useRun() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  function run(action: () => Promise<Result>, done?: string) {
    setMessage(null);
    start(async () => {
      const result = await action();
      setMessage(result.ok ? (done ? { ok: true, text: done } : null) : { ok: false, text: result.error });
      if (result.ok) router.refresh();
    });
  }
  const status = message ? <p role={message.ok ? "status" : "alert"} className={`m-0 text-[13.5px] font-bold ${message.ok ? "text-app-success" : "text-app-danger"}`}>{message.text}</p> : null;
  return { pending, run, status };
}

/** A typed full name and a confirmation box: the electronic signature. Used by every signing form. */
export function SignatureFields({ name, onName, confirmed, onConfirmed }: { name: string; onName: (value: string) => void; confirmed: boolean; onConfirmed: (value: boolean) => void }) {
  const t = useT("contracts");
  return (
    <div className="grid gap-2">
      <label className="grid gap-1 text-[13.5px] font-bold">
        {t("sign.label")}
        <input value={name} onChange={(event) => onName(event.target.value)} maxLength={80} autoComplete="name" placeholder={t("sign.ph")} className={`${INPUT} font-accent text-[17px] italic`} />
      </label>
      <p className="m-0 text-[12.5px] leading-[1.45] text-app-ink-soft">{t("sign.help")}</p>
      <label className="flex items-start gap-2 text-[13.5px] font-bold">
        <input type="checkbox" checked={confirmed} onChange={(event) => onConfirmed(event.target.checked)} className="mt-0.5 h-4 w-4" /> {t("sign.confirm")}
      </label>
    </div>
  );
}

export const signatureReady = (name: string, confirmed: boolean) => confirmed && cleanSignedName(name) !== null;

/** The second side signs (or, for a delivery agreement, declines saying why). */
export function SignContract({ contractId, canDecline }: { contractId: string; canDecline: boolean }) {
  const t = useT("contracts");
  const { pending, run, status } = useRun();
  const [name, setName] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [declining, setDeclining] = useState(false);
  const [note, setNote] = useState("");
  return (
    <section className="grid gap-3 rounded-[18px] border-2 border-app-accent bg-white p-4 print:hidden">
      <h2 className="m-0 text-[16px] font-extrabold">{t("sign.title")}</h2>
      {declining ? (
        <>
          <textarea value={note} onChange={(event) => setNote(event.target.value)} rows={2} maxLength={600} placeholder={t("decline.ph")} className={INPUT} />
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={pending} onClick={() => run(() => declineContractAction(contractId, note))} className={SECONDARY}>{t("decline.send")}</button>
            <button type="button" onClick={() => setDeclining(false)} className={SECONDARY}>{t("cancel")}</button>
          </div>
        </>
      ) : (
        <>
          <SignatureFields name={name} onName={setName} confirmed={confirmed} onConfirmed={setConfirmed} />
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={pending || !signatureReady(name, confirmed)} onClick={() => run(() => signContractAction(contractId, name), t("sign.done"))} className={PRIMARY}>{pending ? t("saving") : t("sign.button")}</button>
            {canDecline ? <button type="button" disabled={pending} onClick={() => setDeclining(true)} className={SECONDARY}>{t("decline.button")}</button> : null}
          </div>
        </>
      )}
      {status}
    </section>
  );
}

/** Sign a written copy of a relationship that started before written contracts. */
export function SignWrittenCopy({ agreementId, connectionId }: { agreementId?: string; connectionId?: string }) {
  const t = useT("contracts");
  const { pending, run, status } = useRun();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  if (!open) return <button type="button" onClick={() => setOpen(true)} className={SECONDARY}>{t("unwritten.sign")}</button>;
  return (
    <div className="grid w-full gap-2">
      <SignatureFields name={name} onName={setName} confirmed={confirmed} onConfirmed={setConfirmed} />
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={pending || !signatureReady(name, confirmed)} onClick={() => run(() => signWrittenCopyAction({ agreementId, connectionId, typedName: name }), t("sign.done"))} className={PRIMARY}>{pending ? t("saving") : t("sign.button")}</button>
        <button type="button" onClick={() => setOpen(false)} className={SECONDARY}>{t("cancel")}</button>
      </div>
      {status}
    </div>
  );
}

/** Raise a dispute (the team may then open the contract), or withdraw the one you raised. */
export function DisputeBox({ contractId, open, canWithdraw }: { contractId: string; open: boolean; canWithdraw: boolean }) {
  const t = useT("contracts");
  const { pending, run, status } = useRun();
  const [reason, setReason] = useState("");
  if (open) {
    return canWithdraw ? (
      <div className="grid gap-2 print:hidden">
        <button type="button" disabled={pending} onClick={() => run(() => withdrawDisputeAction(contractId))} className={SECONDARY}>{t("dispute.withdraw")}</button>
        {status}
      </div>
    ) : null;
  }
  return (
    <details className="group rounded-[18px] border border-app-line bg-white p-4 print:hidden">
      <summary className="cursor-pointer list-none text-[15px] font-extrabold [&::-webkit-details-marker]:hidden">{t("dispute.title")} <span aria-hidden className="inline-block transition group-open:rotate-90">›</span></summary>
      <div className="mt-3 grid gap-2">
        <p className="m-0 text-[13.5px] leading-[1.5] text-app-ink-soft">{t("dispute.help")}</p>
        <textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={3} maxLength={1500} placeholder={t("dispute.ph")} className={INPUT} />
        <button type="button" disabled={pending || reason.trim().length < 10} onClick={() => run(() => raiseDisputeAction(contractId, reason))} className={`${SECONDARY} justify-self-start`}>{t("dispute.send")}</button>
        {status}
      </div>
    </details>
  );
}

export function PrintButton() {
  const t = useT("contracts");
  return <button type="button" onClick={() => window.print()} className={`${SECONDARY} print:hidden`}>{t("print")}</button>;
}

// ─── The team (English, like the rest of the admin portal) ────────────────────

export function AdminOpenContract({ contractId }: { contractId: string }) {
  const { pending, run, status } = useRun();
  const [reason, setReason] = useState("");
  return (
    <div className="grid gap-2">
      <label className="grid gap-1 text-[13.5px] font-bold">
        Why do you need to open it?
        <textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={2} maxLength={600} placeholder="e.g. To check the return terms for the dispute on order #1042" className={INPUT} />
      </label>
      <p className="m-0 text-[12.5px] text-app-ink-soft">Both businesses are told you opened it, with this reason, and it is listed on their copies. It stays open to you for an hour.</p>
      <button type="button" disabled={pending || reason.trim().length < 10} onClick={() => run(() => adminOpenContractAction(contractId, reason))} className={`${PRIMARY} justify-self-start`}>Open the contract</button>
      {status}
    </div>
  );
}

export function AdminCloseDispute({ contractId }: { contractId: string }) {
  const { pending, run, status } = useRun();
  const [note, setNote] = useState("");
  return (
    <div className="grid gap-2">
      <label className="grid gap-1 text-[13.5px] font-bold">
        How was it settled?
        <textarea value={note} onChange={(event) => setNote(event.target.value)} rows={2} maxLength={600} placeholder="e.g. Supplier refunds ₦12,000 for the damaged item (Money owed)." className={INPUT} />
      </label>
      <button type="button" disabled={pending || note.trim().length < 5} onClick={() => run(() => adminCloseDisputeAction(contractId, note), "Closed. The contract is sealed again.")} className={`${SECONDARY} justify-self-start`}>Close the dispute and seal it</button>
      {status}
    </div>
  );
}
