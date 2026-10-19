"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Notice } from "@/components/app-ui";
import { buttonClass, inputClass, selectClass } from "@/components/growth/kit";
import { checkWalletAccountAction, linkWalletBankAction } from "@/app/actions/wallet";
import { useT } from "@/components/i18n/I18nProvider";

// Setting up a Shopinbos Wallet: add the bank Paystack pays you in (the name on it is looked up first).

type Outcome = { tone: "success" | "error" | "info"; text: string } | null;

function Field({ label, htmlFor, hint, children }: { label: string; htmlFor: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <label htmlFor={htmlFor} className="text-[13.5px] font-bold">{label}</label>
      {children}
      {hint ? <span className="text-[12.5px] leading-[1.4] text-app-ink-soft">{hint}</span> : null}
    </div>
  );
}

export function BankForm({ banks, current }: { banks: string[]; current: { bankName: string } | null }) {
  const t = useT("wallet");
  const router = useRouter();
  const [bankName, setBankName] = useState(current?.bankName ?? "");
  const [accountNumber, setAccountNumber] = useState("");
  const [outcome, setOutcome] = useState<Outcome>(null);
  const [pending, startTransition] = useTransition();
  // Whose account it is, looked up as soon as the 10 digits are in (like Shopify showing the bank before saving).
  const [holder, setHolder] = useState<{ key: string; name: string | null; note: string | null } | null>(null);
  const digits = accountNumber.replace(/\D/g, "");
  const lookupKey = bankName && digits.length === 10 ? `${bankName}:${digits}` : "";

  useEffect(() => {
    if (!lookupKey) return;
    let alive = true;
    void checkWalletAccountAction({ bankName, accountNumber: digits }).then((result) => {
      if (!alive) return;
      setHolder({
        key: lookupKey,
        name: result.status === "resolved" ? result.accountName : null,
        note: result.status === "not_found" ? "not_found" : result.status === "unavailable" ? "unavailable" : null,
      });
    });
    return () => {
      alive = false;
    };
  }, [lookupKey, bankName, digits]);
  const noteText = (note: string) => (note === "not_found" ? t("bank.notFound") : t("bank.unavailable"));
  const shown = holder && holder.key === lookupKey ? holder : null;

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setOutcome(null);
    startTransition(async () => {
      const result = await linkWalletBankAction({ bankName, accountNumber: digits });
      if (result.ok) {
        setOutcome({ tone: "success", text: result.message ?? t("bank.saved") });
        setAccountNumber("");
        router.refresh();
      } else {
        setOutcome({ tone: "error", text: result.error });
      }
    });
  }

  return (
    <form onSubmit={submit} className="grid gap-4">
      <Field label={t("bank.bank")} htmlFor="wallet-bank">
        <select id="wallet-bank" className={selectClass} value={bankName} onChange={(event) => setBankName(event.target.value)} disabled={pending} required>
          <option value="" disabled>{t("bank.choose")}</option>
          {banks.map((bank) => <option key={bank} value={bank}>{bank}</option>)}
        </select>
      </Field>
      <Field label={t("bank.account")} htmlFor="wallet-account" hint={t("bank.accountHint")}>
        <input id="wallet-account" className={inputClass} inputMode="numeric" autoComplete="off" maxLength={12} value={accountNumber} onChange={(event) => setAccountNumber(event.target.value)} disabled={pending} required />
      </Field>
      {lookupKey && !shown ? <p className="m-0 text-[13.5px] text-app-ink-soft" aria-live="polite">{t("bank.lookingUp")}</p> : null}
      {shown?.name ? (
        <div className="rounded-[14px] border border-app-line bg-app-canvas px-4 py-3" aria-live="polite">
          <div className="text-[12.5px] text-app-ink-soft">{t("bank.accountName")}</div>
          <div className="text-[15px] font-extrabold">{shown.name}</div>
        </div>
      ) : null}
      {shown?.note ? <Notice tone={shown.name ? "info" : "error"}>{noteText(shown.note)}</Notice> : null}
      {outcome ? <Notice tone={outcome.tone}>{outcome.text}</Notice> : null}
      <div>
        <button type="submit" className={buttonClass("ink")} disabled={pending || !lookupKey || !shown?.name}>
          {pending ? t("bank.settingUp") : shown?.name ? t("bank.payMeHere") : current ? t("bank.change") : t("bank.save")}
        </button>
      </div>
    </form>
  );
}
