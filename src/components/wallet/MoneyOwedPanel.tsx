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
import { useT } from "@/components/i18n/I18nProvider";
import { CLAIM_REASONS, CLAIM_WITHIN_DAYS, PAY_WITHIN_DAYS, type ClaimTarget } from "@/lib/money-owed/rules";
import type { DebtView, MoneyOwedView } from "@/lib/money-owed/money-owed.server";

// Money owed between this business and others (src/lib/money-owed), on the Shopinbos Wallet page. What you owe:
// accept or dispute a claim, then pay it in the app (split straight to their bank). What's owed to you: confirm it
// when they paid another way, or let it go. Sellers also raise claims here for goods that came wrong or damaged,
// or a parcel lost after pickup. Shopinbos never holds the money; it keeps the record and decides disputes.
// Words in shared/i18n/messages/wallet (owed.*, reason.*, claim.*), shared with the phone app.

type WalletT = ReturnType<typeof useT<["wallet"]>>;

const naira = (kobo: number) => `₦${(kobo / 100).toLocaleString("en-NG", { maximumFractionDigits: 2 })}`;
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-NG", { day: "numeric", month: "short", timeZone: "Africa/Lagos" }) : "");

const button = "inline-flex min-h-[40px] items-center rounded-full px-4 text-[13.5px] font-extrabold disabled:opacity-55";
const ink = `${button} bg-app-ink text-white`;
const white = `${button} border border-app-line bg-white`;
const field = "w-full rounded-[12px] border border-app-line bg-white px-3 py-2.5 text-[14px]";

function statusText(debt: DebtView, mine: boolean, t: WalletT) {
  if (debt.status === "claimed") return mine ? t("owed.status.claimedMine") : t("owed.status.claimedTheirs");
  if (debt.status === "disputed") return t("owed.status.disputed");
  if (debt.status === "paid") return t("owed.status.paid");
  if (debt.status === "rejected") return t("owed.status.rejected");
  if (debt.status === "waived") return t("owed.status.waived");
  if (debt.overdue) return mine ? t("owed.status.overdueMine") : t("owed.status.overdueTheirs");
  return debt.dueAt ? t("owed.status.due", { date: day(debt.dueAt) }) : t("owed.status.owed");
}

function statusTone(debt: DebtView) {
  if (debt.overdue) return "text-app-danger";
  if (debt.status === "paid") return "text-app-forest";
  if (["rejected", "waived"].includes(debt.status)) return "text-app-ink-soft";
  return "text-app-ink";
}

export function MoneyOwedPanel({ owed, role }: { owed: MoneyOwedView; role: "seller" | "supplier" | "logistics_partner" }) {
  const t = useT("wallet");
  const router = useRouter();
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [disputing, setDisputing] = useState<string | null>(null);
  const [response, setResponse] = useState("");
  const [, startTransition] = useTransition();

  function run(key: string, work: () => Promise<{ ok: boolean; error?: string; message?: string }>) {
    setMessage(null);
    setBusy(key);
    startTransition(async () => {
      const result = await work();
      setBusy(null);
      setMessage(result.ok ? { tone: "success", text: result.message ?? t("owed.done") } : { tone: "error", text: result.error ?? t("owed.failed") });
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
            setMessage(result.ok ? { tone: "success", text: t("owed.paidThem", { name: debt.otherParty }) } : { tone: "error", text: t("owed.paidPending") });
            router.refresh();
          });
        },
        onCancel: () => setBusy(null),
        onError: () => {
          setBusy(null);
          setMessage({ tone: "error", text: t("owed.payNoOpen") });
        },
      });
    });
  }

  const hasDebts = owed.iOwe.length > 0 || owed.owedToMe.length > 0;
  if (!hasDebts && role !== "seller" && !owed.pausedAt) return null;
  const party = (debt: DebtView) => (debt.otherParty === "Shopinbos" ? t("owed.shopinbos") : debt.otherParty);

  return (
    <section className="grid gap-4 rounded-[22px] border border-app-line bg-white p-5">
      <div>
        <h2 className="m-0 text-[17px] font-extrabold">{t("owed.title")}</h2>
        <p className="m-0 mt-0.5 text-[13px] leading-[1.5] text-app-ink-soft">{t("owed.sub", { days: PAY_WITHIN_DAYS })}</p>
      </div>
      {owed.pausedAt ? <p role="alert" className="m-0 rounded-[14px] bg-app-danger-tint px-3.5 py-3 text-[13.5px] font-bold leading-[1.5] text-app-danger">{t("owed.paused")}</p> : null}

      {owed.iOwe.length ? (
        <div className="grid gap-2">
          <h3 className="m-0 text-[14px] font-extrabold">{t("owed.iOwe")}</h3>
          <ul className="m-0 grid list-none gap-2 p-0">
            {owed.iOwe.map((debt) => (
              <li key={debt.id} className="grid gap-2 rounded-[14px] border border-app-line px-3.5 py-3">
                <DebtLine debt={debt} mine t={t} party={party(debt)} />
                {debt.status === "claimed" ? (
                  disputing === debt.id ? (
                    <form
                      className="grid gap-2"
                      onSubmit={(event) => {
                        event.preventDefault();
                        run(`respond:${debt.id}`, () => respondToClaimAction(debt.id, false, response));
                      }}
                    >
                      <textarea className={field} rows={3} value={response} onChange={(event) => setResponse(event.target.value)} placeholder={t("owed.disputePh")} />
                      <div className="flex flex-wrap gap-2">
                        <button type="submit" className={ink} disabled={busy !== null}>{t("owed.sendTeam")}</button>
                        <button type="button" className={white} onClick={() => setDisputing(null)}>{t("owed.back")}</button>
                      </div>
                    </form>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      <button type="button" className={ink} disabled={busy !== null} onClick={() => run(`respond:${debt.id}`, () => respondToClaimAction(debt.id, true, ""))}>{t("owed.accept", { amount: naira(debt.amountKobo) })}</button>
                      <button type="button" className={white} disabled={busy !== null} onClick={() => { setDisputing(debt.id); setResponse(""); }}>{t("owed.notRight")}</button>
                    </div>
                  )
                ) : debt.status === "open" && debt.remainingKobo > 0 ? (
                  debt.payable ? (
                    <div>
                      <button type="button" className={ink} disabled={busy !== null} onClick={() => pay(debt)}>{busy === `pay:${debt.id}` ? t("owed.opening") : t("owed.pay", { amount: naira(debt.remainingKobo) })}</button>
                    </div>
                  ) : (
                    <p className="m-0 text-[13px] text-app-ink-soft">{t("owed.noWallet", { name: party(debt) })}</p>
                  )
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {owed.owedToMe.length ? (
        <div className="grid gap-2">
          <h3 className="m-0 text-[14px] font-extrabold">{t("owed.owedToMe")}</h3>
          <ul className="m-0 grid list-none gap-2 p-0">
            {owed.owedToMe.map((debt) => (
              <li key={debt.id} className="grid gap-2 rounded-[14px] border border-app-line px-3.5 py-3">
                <DebtLine debt={debt} mine={false} t={t} party={party(debt)} />
                {["claimed", "disputed", "open"].includes(debt.status) ? (
                  <div className="flex flex-wrap gap-2">
                    {debt.status === "open" && debt.remainingKobo > 0 ? (
                      <button type="button" className={white} disabled={busy !== null} onClick={() => run(`paid:${debt.id}`, () => confirmDebtPaidAction(debt.id))}>{t("owed.theyPaid", { amount: naira(debt.remainingKobo) })}</button>
                    ) : null}
                    <button
                      type="button"
                      className={`${button} text-app-ink-soft`}
                      disabled={busy !== null}
                      onClick={async () => {
                        const sure = await confirmDialog(debt.status === "open"
                          ? { title: t("owed.letGoTitle", { name: party(debt) }), message: t("owed.letGoBody", { amount: naira(debt.remainingKobo) }), confirmLabel: t("owed.letGo"), tone: "danger" }
                          : { title: t("owed.withdrawTitle"), confirmLabel: t("owed.withdraw"), tone: "danger" });
                        if (sure) run(`cancel:${debt.id}`, () => cancelDebtAction(debt.id));
                      }}
                    >
                      {debt.status === "open" ? t("owed.letGo") : t("owed.withdraw")}
                    </button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {role === "seller" ? <ClaimForm claimable={owed.claimable} t={t} onDone={(text) => { setMessage({ tone: "success", text }); router.refresh(); }} /> : null}

      {message ? <p role="status" className={`m-0 text-[14px] ${message.tone === "error" ? "text-app-danger" : "font-bold text-app-forest"}`}>{message.text}</p> : null}
    </section>
  );
}

function DebtLine({ debt, mine, t, party }: { debt: DebtView; mine: boolean; t: WalletT; party: string }) {
  const part = debt.remainingKobo > 0 && debt.remainingKobo < debt.amountKobo ? ` · ${t("owed.left", { amount: naira(debt.remainingKobo) })}` : "";
  return (
    <div className="grid gap-1">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="min-w-0 text-[15px] font-extrabold">{mine ? t("owed.to", { name: party }) : t("owed.from", { name: party })}</span>
        <span className="text-[15px] font-extrabold">{naira(debt.amountKobo)}<span className="text-[13px] font-bold text-app-ink-soft">{part}</span></span>
      </div>
      <div className="text-[13px]">
        <span className="font-bold">{t.dynamic(`reason.${debt.reason}`, debt.reasonLabel)}</span>
        <span className={`ml-2 font-bold ${statusTone(debt)}`}>{statusText(debt, mine, t)}</span>
      </div>
      {debt.details ? <p className="m-0 whitespace-pre-line text-[13px] text-app-ink-soft">{debt.details}</p> : null}
      {debt.response ? <p className="m-0 whitespace-pre-line text-[13px] text-app-ink-soft"><span className="font-bold">{mine ? t("owed.youSaid") : t("owed.theySaid")}</span> {debt.response}</p> : null}
      {debt.decisionNote ? <p className="m-0 whitespace-pre-line text-[13px]"><span className="font-bold">{t("owed.decision")}</span> {debt.decisionNote}</p> : null}
    </div>
  );
}

function ClaimForm({ claimable, t, onDone }: { claimable: MoneyOwedView["claimable"]; t: WalletT; onDone: (message: string) => void }) {
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
        <p className="m-0 max-w-[460px] text-[13px] leading-[1.5]">{t("claim.prompt", { days: CLAIM_WITHIN_DAYS })}</p>
        <button type="button" className={white} onClick={() => setOpen(true)}>{t("claim.open")}</button>
      </div>
    );
  }

  return (
    <form
      className="grid gap-3 rounded-[14px] bg-app-canvas p-3.5"
      onSubmit={(event) => {
        event.preventDefault();
        if (!selected) return setError(t("claim.chooseOrder"));
        setError(null);
        startTransition(async () => {
          const result = await raiseClaimAction({ target: selected.target, targetId: selected.id, reason, amount, details });
          if (!result.ok) return setError(result.error);
          setOpen(false);
          setChoice("");
          setReason("");
          setAmount("");
          setDetails("");
          onDone(result.message ?? t("claim.sent"));
        });
      }}
    >
      <h3 className="m-0 text-[14px] font-extrabold">{t("claim.title")}</h3>
      <p className="m-0 text-[12.5px] leading-[1.5] text-app-ink-soft">{t("claim.who")}</p>
      {claimable.length ? (
        <>
          <label className="grid gap-1 text-[13px] font-bold">
            {t("claim.which")}
            <select className={field} value={choice} onChange={(event) => { setChoice(event.target.value); setReason(""); }}>
              <option value="">{t("claim.choose")}</option>
              {claimable.map((row) => (
                <option key={`${row.target}:${row.id}`} value={`${row.target}:${row.id}`}>{row.label} · {row.party}</option>
              ))}
            </select>
          </label>
          {selected ? (
            <>
              <label className="grid gap-1 text-[13px] font-bold">
                {t("claim.what")}
                <select className={field} value={reason} onChange={(event) => setReason(event.target.value)}>
                  <option value="">{t("claim.choose")}</option>
                  {reasons.map((key) => <option key={key} value={key}>{t.dynamic(`reason.${key}`, key)}</option>)}
                </select>
              </label>
              <label className="grid gap-1 text-[13px] font-bold">
                {t("claim.howMuch", { max: naira(selected.maxKobo) })}
                <input className={field} inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="₦" />
              </label>
              <label className="grid gap-1 text-[13px] font-bold">
                {t("claim.happened")}
                <textarea className={field} rows={4} value={details} onChange={(event) => setDetails(event.target.value)} placeholder={t("claim.happenedPh")} />
              </label>
            </>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <button type="submit" className={ink} disabled={pending || !selected}>{pending ? t("claim.sending") : t("claim.send")}</button>
            <button type="button" className={white} onClick={() => setOpen(false)}>{t("claim.cancel")}</button>
          </div>
        </>
      ) : (
        <p className="m-0 text-[13px]">{t("claim.none", { days: CLAIM_WITHIN_DAYS })}</p>
      )}
      {error ? <p role="alert" className="m-0 text-[13.5px] text-app-danger">{error}</p> : null}
    </form>
  );
}
