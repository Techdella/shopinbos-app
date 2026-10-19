"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Notice } from "@/components/app-ui";
import { buttonClass, checkClass, inputClass, selectClass } from "@/components/growth/kit";
import { checkWalletAccountAction, linkWalletBankAction, verifyWalletIdentityAction } from "@/app/actions/wallet";

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
        setOutcome({ tone: "success", text: result.message ?? "Your ID is verified." });
        onVerified?.();
        router.refresh();
      } else {
        setOutcome({ tone: "error", text: result.error });
      }
    });
  }

  return (
    <form onSubmit={submit} className="grid gap-4">
      <Field label="ID type" htmlFor="kyc-type" hint="NIN is quickest: it also confirms your date of birth. BVN works too.">
        <select id="kyc-type" className={selectClass} value={idType} onChange={(event) => setIdType(event.target.value as "bvn" | "nin")} disabled={pending}>
          <option value="nin">NIN (National Identification Number)</option>
          <option value="bvn">BVN (Bank Verification Number)</option>
        </select>
      </Field>
      <Field label={idType === "bvn" ? "BVN" : "NIN"} htmlFor="kyc-id" hint="11 digits. We keep only the last 4.">
        <input id="kyc-id" className={inputClass} inputMode="numeric" autoComplete="off" maxLength={13} value={idNumber} onChange={(event) => setIdNumber(event.target.value)} disabled={pending} required />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="First name" htmlFor="kyc-first" hint="Exactly as on your ID">
          <input id="kyc-first" className={inputClass} autoComplete="given-name" value={firstName} onChange={(event) => setFirstName(event.target.value)} disabled={pending} required />
        </Field>
        <Field label="Last name" htmlFor="kyc-last">
          <input id="kyc-last" className={inputClass} autoComplete="family-name" value={lastName} onChange={(event) => setLastName(event.target.value)} disabled={pending} required />
        </Field>
      </div>
      <Field label="Date of birth" htmlFor="kyc-dob">
        <input id="kyc-dob" type="date" className={inputClass} autoComplete="bday" value={dateOfBirth} onChange={(event) => setDateOfBirth(event.target.value)} disabled={pending} required />
      </Field>
      <label className="flex items-start gap-3 text-[13.5px] leading-[1.45]">
        <input type="checkbox" className={`${checkClass} mt-0.5`} checked={consent} onChange={(event) => setConsent(event.target.checked)} disabled={pending} />
        <span>I agree that Shopinbos can check this ID with the national records, through our verification partner, to confirm it&apos;s me.</span>
      </label>
      {outcome ? <Notice tone={outcome.tone}>{outcome.text}</Notice> : null}
      <div>
        <button type="submit" className={buttonClass("ink")} disabled={pending || !consent}>{pending ? "Checking…" : "Verify my ID"}</button>
      </div>
    </form>
  );
}

export function BankForm({ banks, current }: { banks: string[]; current: { bankName: string } | null }) {
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
        note: result.status === "not_found" ? "That account number doesn't exist at this bank." : result.status === "unavailable" ? "We couldn't look up this account just now. Try again in a minute." : null,
      });
    });
    return () => {
      alive = false;
    };
  }, [lookupKey, bankName, digits]);
  const shown = holder && holder.key === lookupKey ? holder : null;

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setOutcome(null);
    startTransition(async () => {
      const result = await linkWalletBankAction({ bankName, accountNumber: digits });
      if (result.ok) {
        setOutcome({ tone: "success", text: result.message ?? "Saved." });
        setAccountNumber("");
        router.refresh();
      } else {
        setOutcome({ tone: "error", text: result.error });
      }
    });
  }

  return (
    <form onSubmit={submit} className="grid gap-4">
      <Field label="Bank" htmlFor="wallet-bank">
        <select id="wallet-bank" className={selectClass} value={bankName} onChange={(event) => setBankName(event.target.value)} disabled={pending} required>
          <option value="" disabled>Choose your bank</option>
          {banks.map((bank) => <option key={bank} value={bank}>{bank}</option>)}
        </select>
      </Field>
      <Field label="Account number" htmlFor="wallet-account" hint="10 digits. In your name or your business's name: card payments start straight away.">
        <input id="wallet-account" className={inputClass} inputMode="numeric" autoComplete="off" maxLength={12} value={accountNumber} onChange={(event) => setAccountNumber(event.target.value)} disabled={pending} required />
      </Field>
      {lookupKey && !shown ? <p className="m-0 text-[13.5px] text-app-ink-soft" aria-live="polite">Looking up the account…</p> : null}
      {shown?.name ? (
        <div className="rounded-[14px] border border-app-line bg-app-canvas px-4 py-3" aria-live="polite">
          <div className="text-[12.5px] text-app-ink-soft">Account name</div>
          <div className="text-[15px] font-extrabold">{shown.name}</div>
        </div>
      ) : null}
      {shown?.note ? <Notice tone={shown.name ? "info" : "error"}>{shown.note}</Notice> : null}
      {outcome ? <Notice tone={outcome.tone}>{outcome.text}</Notice> : null}
      <div>
        <button type="submit" className={buttonClass("ink")} disabled={pending || !lookupKey || !shown?.name}>
          {pending ? "Setting up…" : shown?.name ? "Yes, pay me here" : current ? "Change account" : "Save account"}
        </button>
      </div>
    </form>
  );
}
