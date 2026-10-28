"use client";

import { useEffect, useState } from "react";
import { PillButton, cx } from "@/components/app-ui";
import { field } from "@/components/seller-core";
import { NG_STATES } from "@shared/delivery-market";
import { CodeConfirm, DocUpload, Field, Row, StepCard, StepError, docItemState, jsonInit, kycCall, useAction, useKycT, type KycState } from "./kit";
import { SelfieCapture, type SelfieValue } from "./SelfieCapture";

// Identity (name, NIN, phone, email, selfie, address) and Bank (a bank account in the NIN's name; never a BVN).

type StepProps = { state: KycState; onState: (state: KycState) => void; reload: () => void };

/** "Mary Jane Obi" → first "Mary Jane", last "Obi" (how it was saved: first + " " + last). */
function splitName(full: string | null) {
  const parts = String(full ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return { first: parts[0] ?? "", last: "" };
  return { first: parts.slice(0, -1).join(" "), last: parts[parts.length - 1] };
}

export function IdentityStep({ state, onState, reload, accountEmail, accountPhone }: StepProps & { accountEmail: string | null; accountPhone: string | null }) {
  const t = useKycT();
  const { busy, error, run } = useAction(onState);
  const name = splitName(state.identity.fullName);
  const [firstName, setFirstName] = useState(name.first);
  const [lastName, setLastName] = useState(name.last);
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [nin, setNin] = useState("");
  const [phone, setPhone] = useState(state.identity.phone?.value ?? accountPhone ?? "");
  const [phoneChallenge, setPhoneChallenge] = useState<string | null>(null);
  const [email, setEmail] = useState(state.identity.email?.value ?? accountEmail ?? "");
  const [emailChallenge, setEmailChallenge] = useState<string | null>(null);
  const [address, setAddress] = useState(state.identity.address?.value ?? "");
  const [addressState, setAddressState] = useState(state.identity.address?.state ?? "");
  const nameLocked = state.identity.nin?.status === "approved";
  const selfie = state.docs.find((doc) => doc.type === "selfie");
  const [selfieShot, setSelfieShot] = useState<SelfieValue | null>(null);
  // The NIN and selfie are checked together (Korapay matches the selfie to the NIN photo), so a rejected or missing
  // selfie asks for the NIN again.
  const selfieNeeded = state.tier1.selfie === "missing" || state.tier1.selfie === "rejected";
  const ninFormOpen = state.identity.nin?.status !== "approved" || selfieNeeded;
  const utility = state.docs.find((doc) => doc.type === "utility");

  return (
    <StepCard title={t("id.title")} sub={t("id.sub")}>
      <StepError error={error} />

      <Row label={t("item.nin")} state={state.tier1.nin} reason={state.identity.nin?.rejectionReason}>
        {state.identity.nin?.status === "approved" && (
          <p className="m-0 text-[14.5px]">{t("id.ninDone", { last4: state.identity.nin.last4 })} · <b>{state.identity.fullName}</b></p>
        )}
        {state.identity.nin?.status === "approved" && selfieNeeded && <p className="m-0 text-[13.5px] text-app-ink-soft">{t("selfie.redo")}</p>}
        {ninFormOpen && (
          <>
            {state.identity.nin?.status === "pending" && <p className="m-0 text-[14.5px] text-app-ink-soft">{t("id.ninWaiting", { last4: state.identity.nin.last4 })}</p>}
            {!state.idChecksReady && <p className="m-0 text-[13.5px] text-app-ink-soft">{t("id.ninManual")}</p>}
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t("id.firstName")}><input value={firstName} onChange={(event) => setFirstName(event.target.value)} autoComplete="given-name" disabled={nameLocked} className={field.input} /></Field>
              <Field label={t("id.lastName")}><input value={lastName} onChange={(event) => setLastName(event.target.value)} autoComplete="family-name" disabled={nameLocked} className={field.input} /></Field>
              <Field label={t("id.dob")}><input type="date" value={dateOfBirth} onChange={(event) => setDateOfBirth(event.target.value)} className={field.input} /></Field>
              <Field label={t("id.nin")}><input value={nin} onChange={(event) => setNin(event.target.value.replace(/\D/g, "").slice(0, 11))} inputMode="numeric" className={field.input} /></Field>
            </div>
            <Field label={t("id.selfie")}>
              <SelfieCapture value={selfieShot} onChange={setSelfieShot} firstName={firstName} lastName={lastName} />
            </Field>
            <div>
              <PillButton
                size="md"
                busy={busy === "nin"}
                disabled={nin.length !== 11 || !dateOfBirth || !firstName.trim() || !lastName.trim() || !selfieShot}
                onClick={() => void run("nin", () => kycCall("/nin", jsonInit("POST", { nin, firstName, lastName, dateOfBirth, selfie: selfieShot?.dataUri, liveness: selfieShot?.liveness ?? undefined })), () => { setSelfieShot(null); setNin(""); })}
              >
                {t("selfie.check")}
              </PillButton>
            </div>
          </>
        )}
      </Row>

      <Row label={t("item.phone")} state={state.tier1.phone}>
        {state.identity.phone?.status === "approved" && phone === state.identity.phone.value ? (
          <p className="m-0 text-[14.5px]">{t("id.phoneDone", { phone: state.identity.phone.value })}</p>
        ) : null}
        <div className="flex flex-wrap items-end gap-2">
          <Field label={t("id.phone")}><input value={phone} onChange={(event) => { setPhone(event.target.value); setPhoneChallenge(null); }} inputMode="tel" autoComplete="tel" className={cx(field.input, "sm:min-w-[260px]")} /></Field>
          <PillButton tone="white" size="md" busy={busy === "phone-send"} disabled={!phone.trim()} onClick={() => void run("phone-send", () => kycCall<{ challenge: string }>("/phone", jsonInit("POST", { action: "send", phone })), (result) => setPhoneChallenge(result.challenge))}>
            {t("id.sendCode")}
          </PillButton>
        </div>
        {phoneChallenge && (
          <>
            <p className="m-0 text-[13.5px] text-app-ink-soft">{t("id.codeSent", { to: phone })}</p>
            <CodeConfirm busy={busy === "phone-verify"} onConfirm={(code) => void run("phone-verify", () => kycCall("/phone", jsonInit("POST", { action: "verify", phone, challenge: phoneChallenge, code })), () => setPhoneChallenge(null))} />
          </>
        )}
      </Row>

      <Row label={t("item.email")} state={state.tier1.email}>
        {state.identity.email?.status === "approved" && email.trim().toLowerCase() === state.identity.email.value ? (
          <p className="m-0 text-[14.5px]">{t("id.emailDone", { email: state.identity.email.value })}</p>
        ) : null}
        <div className="flex flex-wrap items-end gap-2">
          <Field label={t("id.email")}><input type="email" value={email} onChange={(event) => { setEmail(event.target.value); setEmailChallenge(null); }} autoComplete="email" className={cx(field.input, "sm:min-w-[260px]")} /></Field>
          <PillButton
            tone="white"
            size="md"
            busy={busy === "email-send"}
            disabled={!email.trim()}
            onClick={() => void run("email-send", () => kycCall<KycState | { challenge: string }>("/email", jsonInit("POST", { action: "send", email })), (result) => setEmailChallenge("challenge" in result ? result.challenge : null))}
          >
            {t("id.sendCode")}
          </PillButton>
        </div>
        {emailChallenge && (
          <>
            <p className="m-0 text-[13.5px] text-app-ink-soft">{t("id.codeSent", { to: email })}</p>
            <CodeConfirm busy={busy === "email-verify"} onConfirm={(code) => void run("email-verify", () => kycCall("/email", jsonInit("POST", { action: "verify", email, challenge: emailChallenge, code })), () => setEmailChallenge(null))} />
          </>
        )}
      </Row>

      <Row label={t("id.selfie")} state={state.tier1.selfie} reason={selfie?.rejectionReason}>
        <p className="m-0 text-[14px] text-app-ink-soft">
          {state.tier1.selfie === "approved" ? t("selfie.matched") : state.tier1.selfie === "pending" ? t("selfie.waiting") : t("id.selfieHint")}
        </p>
      </Row>

      <Row label={t("item.address")} state={state.tier1.address}>
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_220px]">
          <Field label={t("id.address")}><textarea value={address} onChange={(event) => setAddress(event.target.value)} rows={2} autoComplete="street-address" className={field.textarea} /></Field>
          <Field label={t("id.state")}>
            <select value={addressState} onChange={(event) => setAddressState(event.target.value)} className={field.select}>
              <option value="">{t("cov.pickState")}</option>
              {NG_STATES.map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
          </Field>
        </div>
        <div>
          <PillButton tone="white" size="md" busy={busy === "address"} disabled={address.trim().length < 5} onClick={() => void run("address", () => kycCall("/identity", jsonInit("PATCH", { address, state: addressState || undefined })))}>
            {t("nav.save")}
          </PillButton>
        </div>
      </Row>

      <Row label={t("id.utility")} state={docItemState(utility)} optional reason={utility?.rejectionReason}>
        <DocUpload type="utility" doc={utility} hint={t("id.utilityHint")} onDone={reload} />
      </Row>
    </StepCard>
  );
}

export function BankStep({ state, onState }: StepProps) {
  const t = useKycT();
  const { busy, error, run } = useAction(onState);
  const payout = state.identity.payout;
  const [banks, setBanks] = useState<string[]>([]);
  const [bankName, setBankName] = useState(payout?.bankName ?? "");
  const [accountNumber, setAccountNumber] = useState("");

  useEffect(() => {
    kycCall<{ banks: string[] }>("/payout").then((data) => setBanks(data.banks), () => setBanks([]));
  }, []);

  return (
    <StepCard title={t("bank.title")} sub={t("bank.sub")}>
      <StepError error={error} />
      {!state.identity.nin ? (
        <p className="m-0 text-[14.5px] text-app-ink-soft">{t("bank.needNin")}</p>
      ) : (
        <Row label={t("item.payout")} state={state.tier1.payout} reason={payout?.rejectionReason}>
          {payout?.status === "approved" && payout.method === "bank" && (
            <p className="m-0 text-[14.5px]">{t("bank.doneBank", { bank: payout.bankName ?? "", last4: payout.last4, name: payout.accountName ?? "" })}</p>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t("bank.bank")}>
              <select value={bankName} onChange={(event) => setBankName(event.target.value)} className={field.select}>
                <option value="">{t("bank.pickBank")}</option>
                {banks.map((bank) => <option key={bank} value={bank}>{bank}</option>)}
              </select>
            </Field>
            <Field label={t("bank.account")}><input value={accountNumber} onChange={(event) => setAccountNumber(event.target.value.replace(/\D/g, "").slice(0, 10))} inputMode="numeric" className={field.input} /></Field>
          </div>
          <div>
            <PillButton
              size="md"
              busy={busy === "payout"}
              disabled={!bankName || accountNumber.length !== 10}
              onClick={() => void run("payout", () => kycCall("/payout", jsonInit("POST", { method: "bank", bankName, accountNumber })))}
            >
              {t("bank.check")}
            </PillButton>
          </div>
        </Row>
      )}
    </StepCard>
  );
}
