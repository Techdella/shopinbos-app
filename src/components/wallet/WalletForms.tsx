"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Notice } from "@/components/app-ui";
import { buttonClass, checkClass, inputClass, selectClass } from "@/components/growth/kit";
import { linkWalletBankAction, verifyWalletIdentityAction } from "@/app/actions/wallet";

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

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setOutcome(null);
    startTransition(async () => {
      const result = await linkWalletBankAction({ bankName, accountNumber });
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
      <Field label="Account number" htmlFor="wallet-account" hint="We check the name on it with Paystack. It should be your name as on your ID, or your business's.">
        <input id="wallet-account" className={inputClass} inputMode="numeric" autoComplete="off" maxLength={12} value={accountNumber} onChange={(event) => setAccountNumber(event.target.value)} disabled={pending} required />
      </Field>
      {outcome ? <Notice tone={outcome.tone}>{outcome.text}</Notice> : null}
      <div>
        <button type="submit" className={buttonClass("ink")} disabled={pending}>{pending ? "Checking with Paystack…" : current ? "Change account" : "Save account"}</button>
      </div>
    </form>
  );
}
