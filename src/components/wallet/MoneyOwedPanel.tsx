"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  cancelDebtAction,
  confirmDebtPaidAction,
  confirmDebtPaymentAction,
  raiseClaimAction,
  respondToClaimAction,
  startDebtPaymentAction,
} from "@/app/actions/money-owed";
import { confirmDialog } from "@/components/ui/dialogs";
import { CLAIM_REASONS, CLAIM_WITHIN_DAYS, DEBT_REASONS, PAY_WITHIN_DAYS, type ClaimTarget } from "@/lib/money-owed/rules";
import type { DebtView, MoneyOwedView } from "@/lib/money-owed/money-owed.server";

// Money owed between this business and others (src/lib/money-owed), on the Shopinbos Wallet page. What you owe:
// accept or dispute a claim, then pay it in the app (split straight to their bank). What's owed to you: confirm it
// when they paid another way, or let it go. Sellers also raise claims here for goods that came wrong or damaged,
// or a parcel lost after pickup. Shopinbos never holds the money; it keeps the record and decides disputes.

const naira = (kobo: number) => `₦${(kobo / 100).toLocaleString("en-NG", { maximumFractionDigits: 2 })}`;
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-NG", { day: "numeric", month: "short", timeZone: "Africa/Lagos" }) : "");

const button = "inline-flex min-h-[40px] items-center rounded-full px-4 text-[13.5px] font-extrabold disabled:opacity-55";
const ink = `${button} bg-app-ink text-white`;
const white = `${button} border border-app-line bg-white`;
const field = "w-full rounded-[12px] border border-app-line bg-white px-3 py-2.5 text-[14px]";

function statusText(debt: DebtView, mine: boolean) {
  if (debt.status === "claimed") return mine ? "Waiting for your answer" : "Waiting for their answer";
  if (debt.status === "disputed") return "With our team to decide";
  if (debt.status === "paid") return "Paid";
  if (debt.status === "rejected") return "Claim dropped";
  if (debt.status === "waived") return "Cancelled";
  if (debt.overdue) return mine ? "Overdue: coming out of your sales" : "Overdue: coming out of their sales";
  return debt.dueAt ? `Due ${day(debt.dueAt)}` : "Owed";
}

function statusTone(debt: DebtView) {
  if (debt.overdue) return "text-app-danger";
  if (debt.status === "paid") return "text-app-forest";
  if (["rejected", "waived"].includes(debt.status)) return "text-app-ink-soft";
  return "text-app-ink";
}

export function MoneyOwedPanel({ owed, role }: { owed: MoneyOwedView; role: "seller" | "supplier" | "logistics_partner" }) {
  const router = useRouter();
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [disputing, setDisputing] = useState<string | null>(null);
  const [response, setResponse] = useState("");
  const [, startTransition] = useTransition();

  function run(key: string, work: () => Promise<{ ok: boolean; error?: string; message?: string }>, done?: string) {
    setMessage(null);
    setBusy(key);
    startTransition(async () => {
      const result = await work();
      setBusy(null);
      setMessage(result.ok ? { tone: "success", text: result.message ?? done ?? "Done." } : { tone: "error", text: result.error ?? "That didn't work." });
      if (result.ok) {
        setDisputing(null);
        setResponse("");
      }
      router.refresh();
    });
  }

  function pay(debt: DebtView) {
    setMessage(null);
    setBusy(`pay:${debt.id}`);
    startTransition(async () => {
      const started = await startDebtPaymentAction(debt.id);
      if (!started.ok) {
        setBusy(null);
        setMessage({ tone: "error", text: started.error });
        return;
      }
      const { default: PaystackPop } = await import("@paystack/inline-js");
      new PaystackPop().resumeTransaction(started.accessCode, {
        onSuccess: (transaction) => {
          void confirmDebtPaymentAction(transaction.reference ?? started.reference).then((result) => {
            setBusy(null);
            setMessage(result.ok ? { tone: "success", text: `Paid ${debt.otherParty}. It goes straight to their bank.` } : { tone: "error", text: "Paystack took the payment; it shows here once Paystack confirms it. Refresh in a minute." });
            router.refresh();
          });
        },
        onCancel: () => setBusy(null),
        onError: () => {
          setBusy(null);
          setMessage({ tone: "error", text: "Paystack couldn't open. Check your connection and try again." });
        },
      });
    });
  }

  const hasDebts = owed.iOwe.length > 0 || owed.owedToMe.length > 0;
  if (!hasDebts && role !== "seller") return null;

  return (
    <section className="grid gap-4 rounded-[22px] border border-app-line bg-white p-5">
      <div>
        <h2 className="m-0 text-[17px] font-extrabold">Money owed</h2>
        <p className="m-0 mt-0.5 text-[13px] leading-[1.5] text-app-ink-soft">
          When an order between businesses goes wrong, whoever is at fault pays the other back here, straight to their bank. Shopinbos never holds the money: we keep the record and decide when you don&apos;t agree. Anything not paid within {PAY_WITHIN_DAYS} days comes out of the next sales of the business that owes it.
        </p>
      </div>

      {owed.iOwe.length ? (
        <div className="grid gap-2">
          <h3 className="m-0 text-[14px] font-extrabold">You owe</h3>
          <ul className="m-0 grid list-none gap-2 p-0">
            {owed.iOwe.map((debt) => (
              <li key={debt.id} className="grid gap-2 rounded-[14px] border border-app-line px-3.5 py-3">
                <DebtLine debt={debt} mine />
                {debt.status === "claimed" ? (
                  disputing === debt.id ? (
                    <form
                      className="grid gap-2"
                      onSubmit={(event) => {
                        event.preventDefault();
                        run(`respond:${debt.id}`, () => respondToClaimAction(debt.id, false, response));
                      }}
                    >
                      <textarea className={field} rows={3} value={response} onChange={(event) => setResponse(event.target.value)} placeholder="What really happened? Photos you can share, tracking, what was agreed…" />
                      <div className="flex flex-wrap gap-2">
                        <button type="submit" className={ink} disabled={busy !== null}>Send to our team</button>
                        <button type="button" className={white} onClick={() => setDisputing(null)}>Back</button>
                      </div>
                    </form>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      <button type="button" className={ink} disabled={busy !== null} onClick={() => run(`respond:${debt.id}`, () => respondToClaimAction(debt.id, true, ""))}>Accept {naira(debt.amountKobo)}</button>
                      <button type="button" className={white} disabled={busy !== null} onClick={() => { setDisputing(debt.id); setResponse(""); }}>It isn&apos;t right</button>
                    </div>
                  )
                ) : debt.status === "open" && debt.remainingKobo > 0 ? (
                  debt.payable ? (
                    <div>
                      <button type="button" className={ink} disabled={busy !== null} onClick={() => pay(debt)}>{busy === `pay:${debt.id}` ? "Opening…" : `Pay ${naira(debt.remainingKobo)}`}</button>
                    </div>
                  ) : (
                    <p className="m-0 text-[13px] text-app-ink-soft">{debt.otherParty} hasn&apos;t set up their Shopinbos Wallet. Transfer it to them and ask them to confirm it in the app.</p>
                  )
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {owed.owedToMe.length ? (
        <div className="grid gap-2">
          <h3 className="m-0 text-[14px] font-extrabold">Owed to you</h3>
          <ul className="m-0 grid list-none gap-2 p-0">
            {owed.owedToMe.map((debt) => (
              <li key={debt.id} className="grid gap-2 rounded-[14px] border border-app-line px-3.5 py-3">
                <DebtLine debt={debt} mine={false} />
                {["claimed", "disputed", "open"].includes(debt.status) ? (
                  <div className="flex flex-wrap gap-2">
                    {debt.status === "open" && debt.remainingKobo > 0 ? (
                      <button type="button" className={white} disabled={busy !== null} onClick={() => run(`paid:${debt.id}`, () => confirmDebtPaidAction(debt.id))}>They paid me {naira(debt.remainingKobo)}</button>
                    ) : null}
                    <button
                      type="button"
                      className={`${button} text-app-ink-soft`}
                      disabled={busy !== null}
                      onClick={async () => {
                        const sure = await confirmDialog(debt.status === "open"
                          ? { title: `Let ${debt.otherParty} off?`, message: `They won't have to pay the ${naira(debt.remainingKobo)} that's left.`, confirmLabel: "Let it go", tone: "danger" }
                          : { title: "Withdraw this claim?", confirmLabel: "Withdraw", tone: "danger" });
                        if (sure) run(`cancel:${debt.id}`, () => cancelDebtAction(debt.id));
                      }}
                    >
                      {debt.status === "open" ? "Let it go" : "Withdraw claim"}
                    </button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {role === "seller" ? <ClaimForm claimable={owed.claimable} onDone={(text) => { setMessage({ tone: "success", text }); router.refresh(); }} /> : null}

      {message ? <p role="status" className={`m-0 text-[14px] ${message.tone === "error" ? "text-app-danger" : "font-bold text-app-forest"}`}>{message.text}</p> : null}
    </section>
  );
}

function DebtLine({ debt, mine }: { debt: DebtView; mine: boolean }) {
  const part = debt.remainingKobo > 0 && debt.remainingKobo < debt.amountKobo ? ` · ${naira(debt.remainingKobo)} left` : "";
  return (
    <div className="grid gap-1">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="min-w-0 text-[15px] font-extrabold">{mine ? `To ${debt.otherParty}` : `From ${debt.otherParty}`}</span>
        <span className="text-[15px] font-extrabold">{naira(debt.amountKobo)}<span className="text-[13px] font-bold text-app-ink-soft">{part}</span></span>
      </div>
      <div className="text-[13px]">
        <span className="font-bold">{debt.reasonLabel}</span>
        <span className={`ml-2 font-bold ${statusTone(debt)}`}>{statusText(debt, mine)}</span>
      </div>
      {debt.details ? <p className="m-0 whitespace-pre-line text-[13px] text-app-ink-soft">{debt.details}</p> : null}
      {debt.response ? <p className="m-0 whitespace-pre-line text-[13px] text-app-ink-soft"><span className="font-bold">{mine ? "You said:" : "They said:"}</span> {debt.response}</p> : null}
      {debt.decisionNote ? <p className="m-0 whitespace-pre-line text-[13px]"><span className="font-bold">Decision:</span> {debt.decisionNote}</p> : null}
    </div>
  );
}

function ClaimForm({ claimable, onDone }: { claimable: MoneyOwedView["claimable"]; onDone: (message: string) => void }) {
  const params = useSearchParams();
  const preset = params.get("claim") ?? "";
  const initial = claimable.find((row) => `${row.target}:${row.id}` === preset);
  const [open, setOpen] = useState(Boolean(initial));
  const [choice, setChoice] = useState(initial ? `${initial.target}:${initial.id}` : "");
  const [reason, setReason] = useState("");
  const [amount, setAmount] = useState("");
  const [details, setDetails] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const selected = claimable.find((row) => `${row.target}:${row.id}` === choice) ?? null;
  const reasons = selected ? CLAIM_REASONS[selected.target as ClaimTarget] : [];

  if (!open) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[14px] bg-app-canvas px-3.5 py-3">
        <p className="m-0 max-w-[460px] text-[13px] leading-[1.5]">A supplier sent the wrong or damaged goods, or a parcel was lost or damaged after the rider picked it up? Claim it back within {CLAIM_WITHIN_DAYS} days of delivery.</p>
        <button type="button" className={white} onClick={() => setOpen(true)}>Report a problem</button>
      </div>
    );
  }

  return (
    <form
      className="grid gap-3 rounded-[14px] bg-app-canvas p-3.5"
      onSubmit={(event) => {
        event.preventDefault();
        if (!selected) return setError("Choose the order this is about.");
        setError(null);
        startTransition(async () => {
          const result = await raiseClaimAction({ target: selected.target, targetId: selected.id, reason, amount, details });
          if (!result.ok) return setError(result.error);
          setOpen(false);
          setChoice("");
          setReason("");
          setAmount("");
          setDetails("");
          onDone(result.message ?? "Claim sent.");
        });
      }}
    >
      <h3 className="m-0 text-[14px] font-extrabold">Report a problem</h3>
      <p className="m-0 text-[12.5px] leading-[1.5] text-app-ink-soft">
        Suppliers are responsible for their goods (wrong, damaged, not as described, short), delivery partners for parcels from pickup until delivery. Problems between you and your own customers, like a change of mind or a refused parcel, are between you and them.
      </p>
      {claimable.length ? (
        <>
          <label className="grid gap-1 text-[13px] font-bold">
            Which order?
            <select className={field} value={choice} onChange={(event) => { setChoice(event.target.value); setReason(""); }}>
              <option value="">Choose…</option>
              {claimable.map((row) => (
                <option key={`${row.target}:${row.id}`} value={`${row.target}:${row.id}`}>{row.label} · {row.party}</option>
              ))}
            </select>
          </label>
          {selected ? (
            <>
              <label className="grid gap-1 text-[13px] font-bold">
                What went wrong?
                <select className={field} value={reason} onChange={(event) => setReason(event.target.value)}>
                  <option value="">Choose…</option>
                  {reasons.map((key) => <option key={key} value={key}>{DEBT_REASONS[key]}</option>)}
                </select>
              </label>
              <label className="grid gap-1 text-[13px] font-bold">
                How much should they pay back? (up to {naira(selected.maxKobo)})
                <input className={field} inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="₦" />
              </label>
              <label className="grid gap-1 text-[13px] font-bold">
                What happened?
                <textarea className={field} rows={4} value={details} onChange={(event) => setDetails(event.target.value)} placeholder="What arrived, what was wrong, what your customer said. Keep the photos: our team may ask for them." />
              </label>
            </>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <button type="submit" className={ink} disabled={pending || !selected}>{pending ? "Sending…" : "Send claim"}</button>
            <button type="button" className={white} onClick={() => setOpen(false)}>Cancel</button>
          </div>
        </>
      ) : (
        <p className="m-0 text-[13px]">There are no recent orders from a supplier or delivery partner to claim on. Claims can be made within {CLAIM_WITHIN_DAYS} days of delivery.</p>
      )}
      {error ? <p role="alert" className="m-0 text-[13.5px] text-app-danger">{error}</p> : null}
    </form>
  );
}
