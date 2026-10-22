"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { answerDropshipAgreementAction } from "@/app/actions/supplier";
import Link from "next/link";
import { useT } from "@/components/i18n/I18nProvider";
import { SignatureFields, signatureReady } from "@/components/contracts/ContractActions";

// Accept a shop's Dropship agreement by signing it with your typed name (they can then list your products), or
// decline it saying why. The shop already signed; the full copy is under Contracts.
export function AgreementAnswer({ agreementId, shopName, contractId }: { agreementId: string; shopName: string; contractId: string | null }) {
  const t = useT("supplier");
  const tc = useT("contracts");
  const [signedName, setSignedName] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const router = useRouter();
  const [declining, setDeclining] = useState(false);
  const [note, setNote] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  function answer(accept: boolean) {
    start(async () => {
      const result = await answerDropshipAgreementAction(agreementId, accept, note, accept ? signedName : undefined);
      setMessage(result.ok ? { ok: true, text: result.message } : { ok: false, text: result.error });
      if (result.ok) router.refresh();
    });
  }
  return (
    <div className="grid gap-2 border-t border-app-line pt-3">
      <p className="m-0 text-[13px] text-app-ink-soft">{t("agr.checkFirst", { shop: shopName })}</p>
      {declining ? (
        <>
          <textarea value={note} onChange={(event) => setNote(event.target.value)} rows={2} maxLength={600} placeholder={t("agr.whyPh")} className="w-full rounded-[12px] border border-app-line bg-white px-3 py-2 text-[13.5px]" />
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={pending} onClick={() => answer(false)} className="inline-flex min-h-[40px] items-center rounded-full bg-app-ink px-4 text-[13.5px] font-extrabold text-white disabled:opacity-55">{t("agr.sendDecline")}</button>
            <button type="button" onClick={() => setDeclining(false)} className="inline-flex min-h-[40px] items-center rounded-full border border-app-line bg-white px-4 text-[13.5px] font-extrabold">{t("agr.back")}</button>
          </div>
        </>
      ) : (
        <div className="grid gap-2">
          {contractId ? <Link href={`/supplier/contracts/${contractId}`} className="text-[13.5px] font-extrabold text-app-ink">{tc("sign.readSigned")} ›</Link> : null}
          <SignatureFields name={signedName} onName={setSignedName} confirmed={confirmed} onConfirmed={setConfirmed} />
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={pending || !signatureReady(signedName, confirmed)} onClick={() => answer(true)} className="inline-flex min-h-[40px] items-center rounded-full bg-app-accent px-4 text-[13.5px] font-extrabold text-white disabled:opacity-55">{tc("sign.signAndAccept")}</button>
            <button type="button" disabled={pending} onClick={() => setDeclining(true)} className="inline-flex min-h-[40px] items-center rounded-full border border-app-line bg-white px-4 text-[13.5px] font-extrabold">{t("agr.decline")}</button>
          </div>
        </div>
      )}
      {message ? <p role="status" className={`m-0 text-[13.5px] font-bold ${message.ok ? "text-app-forest" : "text-app-danger"}`}>{message.text}</p> : null}
    </div>
  );
}
