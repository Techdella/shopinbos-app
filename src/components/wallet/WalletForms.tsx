"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Notice } from "@/components/app-ui";
import { buttonClass, checkClass, inputClass, selectClass } from "@/components/growth/kit";
import { checkWalletAccountAction, linkWalletBankAction, verifyWalletIdentityAction } from "@/app/actions/wallet";
import { useT } from "@/components/i18n/I18nProvider";

// The two steps of setting up a Shopinbos Wallet: verify your ID (BVN or NIN), then add the bank Paystack pays you in.

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

export function KycForm({ defaultName, onVerified }: { defaultName: { firstName: string; lastName: string }; onVerified?: () => void }) {
  const t = useT("wallet");
  const router = useRouter();
  const [idType, setIdType] = useState<"bvn" | "nin">("nin");
  const [idNumber, setIdNumber] = useState("");
  const [firstName, setFirstName] = useState(defaultName.firstName);
  const [lastName, setLastName] = useState(defaultName.lastName);
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [consent, setConsent] = useState(false);
  const [outcome, setOutcome] = useState<Outcome>(null);
  const [pending, startTransition] = useTransition();

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setOutcome(null);
    startTransition(async () => {
      const result = await verifyWalletIdentityAction({ idType, idNumber, firstName, lastName, dateOfBirth, consent });
      if (result.ok) {
        setOutcome({ tone: "success", text: result.message ?? t("kyc.done") });
        onVerified?.();
        router.refresh();
      } else {
        setOutcome({ tone: "error", text: result.error });
      }
    });
  }

  return (
    <form onSubmit={submit} className="grid gap-4">
      <Field label={t("kyc.type")} htmlFor="kyc-type" hint={t("kyc.typeHint")}>
        <select id="kyc-type" className={selectClass} value={idType} onChange={(event) => setIdType(event.target.value as "bvn" | "nin")} disabled={pending}>
          <option value="nin">{t("kyc.nin")}</option>
          <option value="bvn">{t("kyc.bvn")}</option>
        </select>
      </Field>
      <Field label={idType === "bvn" ? "BVN" : "NIN"} htmlFor="kyc-id" hint={t("kyc.idHint")}>
        <input id="kyc-id" className={inputClass} inputMode="numeric" autoComplete="off" maxLength={13} value={idNumber} onChange={(event) => setIdNumber(event.target.value)} disabled={pending} required />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("kyc.first")} htmlFor="kyc-first" hint={t("kyc.firstHint")}>
          <input id="kyc-first" className={inputClass} autoComplete="given-name" value={firstName} onChange={(event) => setFirstName(event.target.value)} disabled={pending} required />
        </Field>
        <Field label={t("kyc.last")} htmlFor="kyc-last">
          <input id="kyc-last" className={inputClass} autoComplete="family-name" value={lastName} onChange={(event) => setLastName(event.target.value)} disabled={pending} required />
        </Field>
      </div>
      <Field label={t("kyc.dob")} htmlFor="kyc-dob">
        <input id="kyc-dob" type="date" className={inputClass} autoComplete="bday" value={dateOfBirth} onChange={(event) => setDateOfBirth(event.target.value)} disabled={pending} required />
      </Field>
      <label className="flex items-start gap-3 text-[13.5px] leading-[1.45]">
        <input type="checkbox" className={`${checkClass} mt-0.5`} checked={consent} onChange={(event) => setConsent(event.target.checked)} disabled={pending} />
        <span>{t("kyc.consent")}</span>
      </label>
      {outcome ? <Notice tone={outcome.tone}>{outcome.text}</Notice> : null}
      <div>
        <button type="submit" className={buttonClass("ink")} disabled={pending || !consent}>{pending ? t("kyc.checking") : t("kyc.verify")}</button>
      </div>
    </form>
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
        <button type="submit" className={buttonClass("ink")} disabled={pending || !lookupKey || Boolean(shown && !shown.name && shown.note === "not_found")}>
          {pending ? t("bank.settingUp") : shown?.name ? t("bank.payMeHere") : current ? t("bank.change") : t("bank.save")}
        </button>
      </div>
    </form>
  );
}
