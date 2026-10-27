"use client";

import Link from "next/link";
import { useState } from "react";
import { Notice, PillButton } from "@/components/app-ui";
import { field } from "@/components/seller-core";
import { CacInstantCheck } from "@/components/verification/CacInstantCheck";
import { ITEM_STEP, TIER1_ITEMS, TIER2_ITEMS, type ItemState, type OnboardingStep } from "@shared/partner-tiers";
import { DocUpload, Field, Row, StatusPill, StepCard, StepError, docItemState, jsonInit, kycCall, useAction, useKycT, type KycState } from "./kit";

// The optional CAC step (Tier 2 · Registered Business, plus the optional NIPOST courier licence) and Review & submit.

type StepProps = { state: KycState; onState: (state: KycState) => void; reload: () => void };

export function CacStep({ state, onState, reload }: StepProps) {
  const t = useKycT();
  const { busy, error, run } = useAction(onState);
  const b = state.business;
  const [registeredName, setRegisteredName] = useState(b.registeredName ?? b.companyName ?? "");
  const [cacType, setCacType] = useState(b.cacType ?? "");
  const [cacNumber, setCacNumber] = useState(b.cacNumber ?? "");
  const [businessAddress, setBusinessAddress] = useState(b.businessAddress ?? "");
  const cac = state.docs.find((doc) => doc.type === "cac");
  const courier = state.docs.find((doc) => doc.type === "courier-licence");

  return (
    <StepCard title={t("cac.title")} sub={t("cac.sub")}>
      <StepError error={error} />
      <Link href="/logistics/cac-help" className="text-[14px] font-bold text-app-ink underline underline-offset-4">{t("page.cacHelpLink")}</Link>
      <Row label={t("item.businessName")} state={state.tier2.businessName === "approved" && state.tier2.cacNumber === "approved" && state.tier2.cacType === "approved" ? "approved" : "missing"} optional>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t("cac.businessName")}><input value={registeredName} onChange={(event) => setRegisteredName(event.target.value)} className={field.input} /></Field>
          <Field label={t("cac.type")}>
            <select value={cacType} onChange={(event) => setCacType(event.target.value)} className={field.select}>
              <option value="">{t("cac.type")}</option>
              <option value="BN">{t("cac.typeBn")}</option>
              <option value="RC">{t("cac.typeRc")}</option>
            </select>
          </Field>
          <Field label={t("cac.number")}><input value={cacNumber} onChange={(event) => setCacNumber(event.target.value.toUpperCase())} className={field.input} /></Field>
          <Field label={t("cac.businessAddress")}><input value={businessAddress} onChange={(event) => setBusinessAddress(event.target.value)} className={field.input} /></Field>
        </div>
        <div>
          <PillButton
            tone="white"
            size="md"
            busy={busy === "business"}
            disabled={registeredName.trim().length < 2 || !cacType || !cacNumber.trim()}
            onClick={() => void run("business", () => kycCall("/business", jsonInit("PATCH", { registeredName, cacType, cacNumber, businessAddress: businessAddress || undefined })))}
          >
            {t("nav.save")}
          </PillButton>
        </div>
      </Row>
      <Row label={t("cac.certificate")} state={state.tier2.cacCertificate} optional reason={cac?.rejectionReason}>
        <CacInstantCheck apiPath="/api/logistics/verification/cac" defaultName={registeredName} cacDoc={cac} onVerified={reload} />
        {!cac?.registry?.verified && <DocUpload type="cac" doc={cac} onDone={reload} />}
      </Row>
      <Row label={t("cac.courier")} state={docItemState(courier)} optional reason={courier?.rejectionReason}>
        <DocUpload type="courier-licence" doc={courier} hint={t("cac.courierHint")} onDone={reload} />
      </Row>
    </StepCard>
  );
}

export function ReviewStep({ state, onState, goTo }: Omit<StepProps, "reload"> & { goTo: (step: OnboardingStep) => void }) {
  const t = useKycT();
  const { busy, error, run } = useAction(onState);
  const [agreed, setAgreed] = useState(state.termsCurrent);
  const [sent, setSent] = useState(false);
  const blocking = TIER1_ITEMS.filter((item) => item !== "terms" && (state.tier1[item] === "missing" || state.tier1[item] === "rejected"));
  const canSend = blocking.length === 0 && agreed && state.state !== "suspended";
  const resend = state.state === "rejected" || Boolean(state.submittedAt);

  async function submit() {
    setSent(false);
    if (!state.termsCurrent && !(await run("terms", () => kycCall("/terms", { method: "POST" })))) return;
    await run("submit", () => kycCall("/submit", { method: "POST" }), () => setSent(true));
  }

  const line = (item: string, value: ItemState, optional = false) => (
    <li key={item} className="flex flex-wrap items-center gap-2 border-t border-app-line py-2.5 first:border-t-0">
      <span className="min-w-0 flex-1 text-[14.5px]">{t.dynamic(`item.${item}`, item)}</span>
      <StatusPill state={value} optional={optional} />
      {(value === "missing" || value === "rejected") && item !== "terms" && (
        <button type="button" onClick={() => goTo(ITEM_STEP[item as keyof typeof ITEM_STEP])} className="text-[13.5px] font-bold underline underline-offset-4">{t("rev.fix")}</button>
      )}
    </li>
  );

  return (
    <StepCard title={t("rev.title")} sub={t("rev.sub")}>
      <StepError error={error} />
      {sent && <Notice tone="success">{t("rev.sent")}</Notice>}
      <ul className="m-0 list-none p-0">{TIER1_ITEMS.map((item) => line(item, item === "terms" && agreed ? "approved" : state.tier1[item]))}</ul>
      <div>
        <h3 className="m-0 mb-1 text-[15px] font-extrabold">{t("rev.tier2")}</h3>
        <ul className="m-0 list-none p-0">{TIER2_ITEMS.map((item) => line(item, state.tier2[item], true))}</ul>
      </div>
      {blocking.length > 0 && <Notice tone="info">{t("rev.missing", { items: blocking.map((item) => t(`item.${item}`)).join(", ") })}</Notice>}
      {!state.termsCurrent && (
        <label className="flex items-start gap-3 text-[14.5px]">
          <input type="checkbox" checked={agreed} onChange={(event) => setAgreed(event.target.checked)} className={`${field.checkbox} mt-0.5`} />
          <span>
            {t("rev.terms")} ·{" "}
            <Link href="/logistics/terms" target="_blank" className="font-bold underline underline-offset-4">{t("rev.readTerms")}</Link>
          </span>
        </label>
      )}
      <div>
        <PillButton tone="accent" size="md" busy={busy === "submit" || busy === "terms"} disabled={!canSend} onClick={() => void submit()}>
          {resend ? t("rev.resubmit") : t("rev.submit")}
        </PillButton>
      </div>
    </StepCard>
  );
}
